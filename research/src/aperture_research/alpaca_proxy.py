"""Stdlib-only Alpaca SIP archive and proxy-row construction.

Historical REST fetch time is retained as download provenance only. Feature
availability is reconstructed from completed bar end plus an explicit lag and
is never represented as an original provider-availability timestamp.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from hashlib import sha256
import json
import os
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

from .manifest import canonical_json, content_hash
from .proxy_manifest import PROXY_AVAILABILITY_MODE, PROXY_LABEL_SOURCE

ALPACA_RAW_PAGE_SCHEMA = "aperture-alpaca-raw-page-v1"
ALPACA_DOWNLOAD_MANIFEST_SCHEMA = "aperture-alpaca-download-manifest-v1"
ALPACA_DATA_BASE_URL = "https://data.alpaca.markets"
MAX_DOWNLOAD_DAYS = 3_660
MAX_PAGES_PER_TIMEFRAME = 500
NEW_YORK = ZoneInfo("America/New_York")


class AlpacaProxyError(RuntimeError):
    pass


class _RejectRedirects(HTTPRedirectHandler):
    """Never forward Alpaca credential headers to a redirect target."""

    def redirect_request(self, _request, _fp, _code, _message, _headers, _new_url):
        raise AlpacaProxyError("Alpaca historical request redirected")


@dataclass(frozen=True)
class RawAlpacaPage:
    body: bytes
    metadata: dict[str, Any]


def _raw_hash(body: bytes) -> str:
    return "sha256:" + sha256(body).hexdigest()


def _epoch_ms(value: datetime) -> int:
    return int(value.timestamp() * 1_000)


def _parse_timestamp(value: Any, label: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be an ISO timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} must be an ISO timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _price_cents(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a price")
    try:
        cents = (Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError) as error:
        raise ValueError(f"{label} must be a price") from error
    if not cents.is_finite() or cents <= 0:
        raise ValueError(f"{label} must be positive")
    return int(cents)


def _volume(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0 or int(value) != value:
        raise ValueError("bar volume must be a nonnegative integer")
    return int(value)


def _download_dates(start_date: str, end_date: str) -> tuple[date, date]:
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError as error:
        raise ValueError("download dates must use YYYY-MM-DD") from error
    days = (end - start).days + 1
    if days < 1 or days > MAX_DOWNLOAD_DAYS:
        raise ValueError(f"download window must contain 1 through {MAX_DOWNLOAD_DAYS} calendar days")
    return start, end


class AlpacaHistoricalClient:
    """Bounded REST client. Application callers construct it from environment."""

    def __init__(
        self,
        *,
        _api_key_id: str,
        _api_secret_key: str,
        transport: Callable[[Request, float], bytes] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        if not _api_key_id or not _api_secret_key:
            raise AlpacaProxyError("Alpaca credentials are not configured")
        self.__api_key_id = _api_key_id
        self.__api_secret_key = _api_secret_key
        self.__transport = transport or self._urlopen
        self.__clock = clock or (lambda: datetime.now(timezone.utc))

    @classmethod
    def from_environment(
        cls,
        environ: Mapping[str, str] | None = None,
        *,
        transport: Callable[[Request, float], bytes] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> "AlpacaHistoricalClient":
        values = os.environ if environ is None else environ
        key_id = values.get("APCA_API_KEY_ID", "")
        secret = values.get("APCA_API_SECRET_KEY", "")
        if not key_id or not secret:
            raise AlpacaProxyError("APCA_API_KEY_ID and APCA_API_SECRET_KEY must be set in the environment")
        return cls(_api_key_id=key_id, _api_secret_key=secret, transport=transport, clock=clock)

    @staticmethod
    def _urlopen(request: Request, timeout: float) -> bytes:
        try:
            opener = build_opener(_RejectRedirects())
            with opener.open(request, timeout=timeout) as response:  # fixed Alpaca authority; redirects rejected
                return response.read()
        except HTTPError as error:
            raise AlpacaProxyError(f"Alpaca historical request returned HTTP {error.code}") from None
        except (URLError, TimeoutError):
            raise AlpacaProxyError("Alpaca historical request failed") from None

    def download_bars(
        self,
        *,
        start_date: str,
        end_date: str,
        timeframe: str,
        maximum_pages: int = MAX_PAGES_PER_TIMEFRAME,
    ) -> list[RawAlpacaPage]:
        start, end = _download_dates(start_date, end_date)
        if timeframe not in ("1Min", "1Day"):
            raise ValueError("timeframe must be 1Min or 1Day")
        if not isinstance(maximum_pages, int) or isinstance(maximum_pages, bool) or not 1 <= maximum_pages <= MAX_PAGES_PER_TIMEFRAME:
            raise ValueError(f"maximum_pages must be between 1 and {MAX_PAGES_PER_TIMEFRAME}")
        request_start = datetime.combine(start, time.min, timezone.utc).isoformat().replace("+00:00", "Z")
        request_end = datetime.combine(end + timedelta(days=1), time.min, timezone.utc).isoformat().replace("+00:00", "Z")
        page_token: str | None = None
        seen_tokens: set[str] = set()
        pages: list[RawAlpacaPage] = []
        for page_index in range(1, maximum_pages + 1):
            query = {
                "start": request_start,
                "end": request_end,
                "timeframe": timeframe,
                "feed": "sip",
                "adjustment": "raw",
                "sort": "asc",
                "limit": "10000",
            }
            if page_token is not None:
                query["page_token"] = page_token
            url = f"{ALPACA_DATA_BASE_URL}/v2/stocks/NVDA/bars?{urlencode(query)}"
            request = Request(url, headers={
                "APCA-API-KEY-ID": self.__api_key_id,
                "APCA-API-SECRET-KEY": self.__api_secret_key,
                "Accept": "application/json",
                "User-Agent": "aperture-nvda-proxy-bootstrap/1",
            })
            body = self.__transport(request, 30.0)
            if not isinstance(body, bytes) or not body:
                raise AlpacaProxyError("Alpaca historical response body is empty")
            try:
                payload = json.loads(body)
            except (UnicodeDecodeError, json.JSONDecodeError):
                raise AlpacaProxyError("Alpaca historical response is not valid JSON") from None
            if not isinstance(payload, dict) or not isinstance(payload.get("bars"), list):
                raise AlpacaProxyError("Alpaca historical response has an invalid bars payload")
            digest = _raw_hash(body)
            token_hash = None if page_token is None else _raw_hash(page_token.encode("utf-8"))
            downloaded_at = self.__clock()
            if downloaded_at.tzinfo is None:
                raise AlpacaProxyError("download clock must be timezone-aware")
            metadata_base = {
                "schemaVersion": ALPACA_RAW_PAGE_SCHEMA,
                "objectKey": f"raw/alpaca/sip/NVDA/{timeframe}/{start_date}_{end_date}/page-{page_index:04d}-{digest[7:23]}.json",
                "contentHash": digest,
                "byteLength": len(body),
                "downloadedAtMs": _epoch_ms(downloaded_at.astimezone(timezone.utc)),
                "provider": "alpaca",
                "feed": "sip",
                "symbol": "NVDA",
                "timeframe": timeframe,
                "requestStart": request_start,
                "requestEnd": request_end,
                "requestPageTokenHash": token_hash,
                "pageIndex": page_index,
            }
            pages.append(RawAlpacaPage(body=body, metadata={**metadata_base, "metadataHash": content_hash(metadata_base)}))
            next_token = payload.get("next_page_token")
            if next_token is None:
                return pages
            if not isinstance(next_token, str) or not next_token or next_token in seen_tokens:
                raise AlpacaProxyError("Alpaca pagination token is invalid or repeated")
            seen_tokens.add(next_token)
            page_token = next_token
        raise AlpacaProxyError(f"Alpaca pagination exceeded the {maximum_pages}-page bound")


def write_download_archive(
    pages: Iterable[RawAlpacaPage],
    *,
    archive_directory: Path,
    manifest_path: Path,
    created_at_ms: int,
) -> dict[str, Any]:
    selected = list(pages)
    if not selected:
        raise ValueError("download archive requires at least one page")
    metadata_rows = []
    for page in selected:
        relative = Path(page.metadata["objectKey"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("raw page objectKey escapes the archive directory")
        destination = archive_directory / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if destination.read_bytes() != page.body:
                raise AlpacaProxyError("immutable raw page path already contains different bytes")
        else:
            with destination.open("xb") as stream:
                stream.write(page.body)
        metadata_rows.append({**page.metadata, "relativePath": relative.as_posix()})
    base = {
        "schemaVersion": ALPACA_DOWNLOAD_MANIFEST_SCHEMA,
        "createdAtMs": created_at_ms,
        "provider": "alpaca",
        "feed": "sip",
        "symbol": "NVDA",
        "credentialSource": "ENVIRONMENT_ONLY",
        "pages": sorted(metadata_rows, key=lambda row: (row["timeframe"], row["pageIndex"])),
    }
    manifest = {**base, "manifestHash": content_hash(base)}
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_body = (canonical_json(manifest) + "\n").encode("utf-8")
    if manifest_path.exists():
        if manifest_path.read_bytes() != manifest_body:
            raise AlpacaProxyError("immutable download manifest path already contains different bytes")
    else:
        with manifest_path.open("xb") as stream:
            stream.write(manifest_body)
    return manifest


def load_download_archive(manifest_path: Path, *, archive_directory: Path | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != ALPACA_DOWNLOAD_MANIFEST_SCHEMA:
        raise ValueError("download manifest schema is invalid")
    supplied_hash = manifest.get("manifestHash")
    base = {key: value for key, value in manifest.items() if key != "manifestHash"}
    if supplied_hash != content_hash(base):
        raise ValueError("download manifest hash does not match its contents")
    root = archive_directory or manifest_path.parent
    minute_payloads: list[dict[str, Any]] = []
    daily_payloads: list[dict[str, Any]] = []
    pages = manifest.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ValueError("download manifest has no pages")
    for metadata in pages:
        if not isinstance(metadata, dict):
            raise ValueError("download page metadata is invalid")
        relative = Path(str(metadata.get("relativePath", "")))
        if relative.is_absolute() or not relative.parts or ".." in relative.parts:
            raise ValueError("download page path is invalid")
        body = (root / relative).read_bytes()
        if len(body) != metadata.get("byteLength") or _raw_hash(body) != metadata.get("contentHash"):
            raise ValueError("immutable raw page bytes do not match their metadata")
        metadata_base = {key: value for key, value in metadata.items() if key not in ("metadataHash", "relativePath")}
        if metadata.get("metadataHash") != content_hash(metadata_base):
            raise ValueError("raw page metadata hash does not match")
        payload = json.loads(body)
        target = minute_payloads if metadata.get("timeframe") == "1Min" else daily_payloads
        target.append(payload)
    if not minute_payloads or not daily_payloads:
        raise ValueError("download archive requires 1Min and 1Day pages")
    return minute_payloads, daily_payloads


def _bars(payloads: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    by_timestamp: dict[str, dict[str, Any]] = {}
    for payload in payloads:
        values = payload.get("bars")
        if not isinstance(values, list):
            raise ValueError("raw page bars must be an array")
        for value in values:
            if not isinstance(value, dict) or not isinstance(value.get("t"), str):
                raise ValueError("raw bar is invalid")
            timestamp = value["t"]
            existing = by_timestamp.get(timestamp)
            if existing is not None and existing != value:
                raise ValueError("duplicate Alpaca bar timestamp has conflicting payloads")
            by_timestamp[timestamp] = value
    return [by_timestamp[key] for key in sorted(by_timestamp, key=lambda value: _parse_timestamp(value, "bar.t"))]


def build_proxy_rows(
    minute_payloads: Iterable[Mapping[str, Any]],
    daily_payloads: Iterable[Mapping[str, Any]],
    *,
    reconstructed_availability_lag_ms: int,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    lag = reconstructed_availability_lag_ms
    if isinstance(lag, bool) or not isinstance(lag, int) or lag < 1 or lag > 5 * 60_000:
        raise ValueError("reconstructed_availability_lag_ms must be between 1 and 300000")
    daily = _bars(daily_payloads)
    minutes = _bars(minute_payloads)
    daily_close: dict[str, int] = {}
    for bar in daily:
        stamp = _parse_timestamp(bar["t"], "daily bar.t").astimezone(NEW_YORK)
        daily_close[stamp.date().isoformat()] = _price_cents(bar.get("c"), "daily close")
    daily_sessions = sorted(daily_close)

    minute_by_session: dict[str, list[tuple[datetime, dict[str, Any]]]] = {}
    for bar in minutes:
        stamp = _parse_timestamp(bar["t"], "minute bar.t").astimezone(NEW_YORK)
        minute_by_session.setdefault(stamp.date().isoformat(), []).append((stamp, bar))

    rows: list[dict[str, Any]] = []
    exclusions: list[dict[str, str]] = []
    for session, session_bars in sorted(minute_by_session.items()):
        opening = next((item for item in session_bars if item[0].hour == 9 and item[0].minute == 30), None)
        if opening is None:
            continue
        previous_sessions = [value for value in daily_sessions if value < session]
        if not previous_sessions:
            exclusions.append({"sessionDate": session, "reason": "PREVIOUS_DAILY_CLOSE_UNAVAILABLE"})
            continue
        feature_cutoff = datetime.combine(date.fromisoformat(session), time(9, 24, 30), NEW_YORK)
        cutoff_ms = _epoch_ms(feature_cutoff)
        eligible = []
        for stamp, bar in session_bars:
            if stamp.time() < time(4, 0) or stamp.time() >= time(9, 30):
                continue
            end_ms = _epoch_ms(stamp) + 60_000
            if end_ms + lag <= cutoff_ms:
                eligible.append((stamp, bar, end_ms))
        if not eligible:
            exclusions.append({"sessionDate": session, "reason": "NO_COMPLETED_PREMARKET_BAR_BEFORE_CUTOFF"})
            continue
        eligible.sort(key=lambda item: item[0])
        high_values = [_price_cents(item[1].get("h"), "premarket high") for item in eligible]
        low_values = [_price_cents(item[1].get("l"), "premarket low") for item in eligible]
        last_stamp, last_bar, last_end_ms = eligible[-1]
        opening_stamp, opening_bar = opening
        opening_start_ms = _epoch_ms(opening_stamp)
        rows.append({
            "sessionDate": session,
            "featureCutoffAtMs": cutoff_ms,
            "reconstructedAvailabilityLagMs": lag,
            "availabilityMode": PROXY_AVAILABILITY_MODE,
            "latestFeatureBarEndMs": last_end_ms,
            "latestFeatureAvailableAtMs": last_end_ms + lag,
            "outcomeAvailableAtMs": opening_start_ms + 60_000 + lag,
            "proxyOpenSource": PROXY_LABEL_SOURCE,
            "proxyOpenBarStartMs": opening_start_ms,
            "proxyOpenBarEndMs": opening_start_ms + 60_000,
            "proxyOpenCents": _price_cents(opening_bar.get("o"), "proxy open"),
            "previousCloseCents": daily_close[previous_sessions[-1]],
            "overnightMidpointCents": (max(high_values) + min(low_values)) / 2,
            "lastPremarketCloseCents": _price_cents(last_bar.get("c"), "last premarket close"),
            "premarketHighCents": max(high_values),
            "premarketLowCents": min(low_values),
            "premarketVolume": sum(_volume(item[1].get("v", 0)) for item in eligible),
            "completedPremarketBars": len(eligible),
        })
    return rows, exclusions
