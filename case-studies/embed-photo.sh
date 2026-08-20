#!/usr/bin/env bash
# Embed the PSA HQ photograph into the case study as a base64 data URI.
#
# The published page must be fully self-contained (no external asset hosts), so the
# photograph is inlined rather than linked. Run this once after dropping the image in:
#
#   ./case-studies/embed-photo.sh case-studies/assets/psa-hq-2026-06-30.jpg
#
# Re-running is safe: it always replaces the current src of #psa-hq-photo.
set -euo pipefail

PHOTO="${1:-case-studies/assets/psa-hq-2026-06-30.jpg}"
PAGE="${2:-case-studies/psa-luna-sol.html}"

[ -f "$PHOTO" ] || { echo "error: photo not found at $PHOTO" >&2; exit 1; }
[ -f "$PAGE" ]  || { echo "error: page not found at $PAGE" >&2; exit 1; }

case "${PHOTO,,}" in
  *.jpg|*.jpeg) MIME=image/jpeg ;;
  *.png)        MIME=image/png ;;
  *.webp)       MIME=image/webp ;;
  *) echo "error: unsupported image type: $PHOTO" >&2; exit 1 ;;
esac

BYTES=$(wc -c < "$PHOTO")
if [ "$BYTES" -gt 3000000 ]; then
  echo "warning: $PHOTO is $((BYTES/1024))KB. Base64 inflates by ~33%; the rendered"
  echo "         page must stay under 16MB. Consider resizing to ~1600px wide first."
fi

DATA="data:$MIME;base64,$(base64 -w0 "$PHOTO")"

python3 - "$PAGE" "$DATA" <<'PY'
import re, sys
page, data = sys.argv[1], sys.argv[2]
html = open(page, encoding='utf-8').read()
# Replace the src of the element carrying id="psa-hq-photo", whatever it currently is.
pat = re.compile(r'(<img\b[^>]*\bid="psa-hq-photo"[^>]*?\bsrc=")[^"]*(")', re.S)
html, n = pat.subn(lambda m: m.group(1) + data.replace('\\', '\\\\') + m.group(2), html)
if n == 0:
    sys.exit('error: could not find <img id="psa-hq-photo" ... src="..."> in ' + page)
open(page, 'w', encoding='utf-8').write(html)
print(f'embedded photograph into {page} ({len(data)//1024}KB data URI)')
PY
