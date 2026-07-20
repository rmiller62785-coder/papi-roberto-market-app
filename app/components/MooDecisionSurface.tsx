"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  MooDeadline,
  MooDecisionSnapshot,
  MooSourceHealth,
  MooTicket,
  MooValueState,
} from "../moo-contract";
import {
  buildMooPlanningSnapshot,
  type MooPaperPreference,
  type MooPlanningField,
  type MooPlanningProvenance,
  type MooPlanningTicket,
  type MooQuantityMode,
  type MooSideRiskInput,
} from "../moo-planning";
import {
  summarizeMooReadiness,
  type MooDominantBlockerCode,
  type MooReadinessGroup,
  type MooReadinessSummary,
  type MooStrictCommissionState,
} from "../moo-readiness";
import type { MarketValue } from "../market-contract";

type Language = "en" | "es";

export type MooPlanningSource = {
  id: string;
  label: string;
  provider: string;
  status: "LIVE" | "LIMITED" | "PENDING" | "CLOSED" | "API_REQUIRED" | "UNAVAILABLE";
  detail: string;
  observedAt: number | null;
  checkedAt: number | null;
};

export type MooResearchPreview = {
  low: number | null;
  median: number | null;
  high: number | null;
  lean: "LONG_LEAN" | "SHORT_LEAN" | "NO_EDGE" | "UNAVAILABLE";
  directionBps: number | null;
  computedAt: number | null;
  reason: string;
};

export type MooPlanningSourceList = MooPlanningSource[] & {
  researchPreview?: MooResearchPreview;
  planningInput?: MooPlanningInput;
};

export type MooPlanningInput = {
  estimatedOpenCents: number | null;
  priorOfficialCloseCents?: number | null;
  previousHighCents: number | null;
  previousLowCents: number | null;
  premarketCurrentCents?: number | null;
  premarketHighCents: number | null;
  premarketLowCents: number | null;
  computedAt: number | null;
  marketCheckedAt: number | null;
  quoteObservedAt?: number | null;
  quoteSource?: string | null;
  quoteFreshness?: string | null;
  marketStates?: {
    priorClose: MarketValue<number>;
    previousHigh: MarketValue<number>;
    previousLow: MarketValue<number>;
    premarketCurrent: MarketValue<number>;
    premarketHigh: MarketValue<number>;
    premarketLow: MarketValue<number>;
  };
  targetSession: string;
};

type PlanningPreference = "RESEARCH" | "LONG_FAVORED" | "SHORT_FAVORED" | "UNASSIGNED";
type PaperSideConfig = {
  quantityMode: MooQuantityMode;
  stopOffset: string;
  riskBudget: string;
  slippageAllowance: string;
  maxShares: string;
  manualQuantity: string;
  accountLabel: string;
  reserve: string;
  timeStop: string;
};
type PaperPlanningConfig = {
  preference: PlanningPreference;
  long: PaperSideConfig;
  short: PaperSideConfig;
};
export type BrokerStatusPayload = {
  provider: string;
  configured: boolean;
  assetStatus: string | null;
  tradable: boolean | null;
  shortable: boolean | null;
  borrowStatus: string | null;
  borrowStatusSource: string | null;
  checkedAt: number;
  freshness: { state: "current" | "stale" | "unavailable" | string; ageMs: number | null; maxAgeMs: number };
  status: "live" | "limited" | "offline";
  detail: string;
  indicativeOnly: boolean;
  locateGuaranteed: boolean;
};

export type MooCommissioningEvidence = {
  executionMode: string;
  blockers: string[];
  modelPromoted: boolean;
  artifactValidated: boolean;
  riskPolicyVersion: string | null;
};

const defaultSideConfig = (accountLabel: string): PaperSideConfig => ({
  quantityMode: "AUTO_RISK",
  stopOffset: "1.00",
  riskBudget: "100.00",
  slippageAllowance: "0.10",
  maxShares: "25",
  manualQuantity: "",
  accountLabel,
  reserve: "0.00",
  timeStop: "10:00 ET",
});

const emptyPaperConfig = (): PaperPlanningConfig => ({
  preference: "RESEARCH",
  long: defaultSideConfig("Long paper"),
  short: defaultSideConfig("Short paper"),
});

const PAPER_PROFILE_STORAGE_KEY = "aperture-moo-paper-risk-profile:v2";

const copy = (lang: Language, en: string, es: string) => (lang === "es" ? es : en);

function cents(value: number | null) {
  return value == null || !Number.isFinite(value) ? null : `$${(value / 100).toFixed(2)}`;
}

function money(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `$${value.toFixed(2)}`;
}

function etDateTime(value: number | null, lang: Language) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(value);
}

function isoDateTime(value: number | null) {
  if (value == null || !Number.isFinite(value)) return undefined;
  return new Date(value).toISOString();
}

function targetDate(value: string, lang: Language) {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function dollarsToCents(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : Number.NaN;
}

function wholeNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function sideRiskInput(config: PaperSideConfig): MooSideRiskInput {
  return {
    stopOffsetCents: dollarsToCents(config.stopOffset),
    slippageAllowanceCents: dollarsToCents(config.slippageAllowance),
    riskBudgetCents: dollarsToCents(config.riskBudget),
    quantityMode: config.quantityMode,
    manualQuantity: wholeNumber(config.manualQuantity),
    maxShares: wholeNumber(config.maxShares),
    reserveCents: dollarsToCents(config.reserve),
    accountLabel: config.accountLabel.trim() || null,
    timeStop: config.timeStop.trim() || null,
  };
}

function safePaperConfig(value: unknown): PaperPlanningConfig | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PaperPlanningConfig>;
  if (!["RESEARCH", "LONG_FAVORED", "SHORT_FAVORED", "UNASSIGNED"].includes(candidate.preference ?? "")) return null;
  const side = (input: unknown): PaperSideConfig | null => {
    if (!input || typeof input !== "object") return null;
    const raw = input as Partial<PaperSideConfig>;
    if (raw.quantityMode !== "AUTO_RISK" && raw.quantityMode !== "MANUAL") return null;
    const textKeys: Array<Exclude<keyof PaperSideConfig, "quantityMode">> = [
      "stopOffset", "riskBudget", "slippageAllowance", "maxShares", "manualQuantity",
      "accountLabel", "reserve", "timeStop",
    ];
    if (textKeys.some((key) => typeof raw[key] !== "string")) return null;
    return raw as PaperSideConfig;
  };
  const long = side(candidate.long);
  const short = side(candidate.short);
  return long && short ? { preference: candidate.preference as PlanningPreference, long, short } : null;
}

function storedPaperConfig(storageKey: string) {
  if (typeof window === "undefined") return emptyPaperConfig();
  try {
    const stored = window.localStorage.getItem(PAPER_PROFILE_STORAGE_KEY) ?? window.sessionStorage.getItem(storageKey);
    const parsed = stored ? safePaperConfig(JSON.parse(stored)) : null;
    return parsed ?? emptyPaperConfig();
  } catch {
    return emptyPaperConfig();
  }
}

function planningStateLabel(state: MooPlanningField<unknown>["state"], lang: Language) {
  const labels: Record<MooPlanningField<unknown>["state"], [string, string]> = {
    READY: ["READY", "LISTO"],
    PENDING_MARKET_DATA: ["WAITING FOR MARKET DATA", "ESPERANDO DATOS DE MERCADO"],
    USER_INPUT_REQUIRED: ["USER INPUT REQUIRED", "SE REQUIERE ENTRADA DEL USUARIO"],
    PREFERENCE_REQUIRED: ["PREFERENCE REQUIRED", "SE REQUIERE PREFERENCIA"],
    INVALID_INPUT: ["CHECK INPUT", "REVISE LA ENTRADA"],
  };
  return copy(lang, ...labels[state]);
}

function provenanceLabel(value: MooPlanningProvenance, lang: Language) {
  const labels: Record<MooPlanningProvenance, [string, string]> = {
    SELECTED_SESSION_RESEARCH: ["RESEARCH", "INVESTIGACIÓN"],
    PREVIOUS_SESSION_MARKET_DATA: ["PRIOR SESSION", "SESIÓN PREVIA"],
    TARGET_PREMARKET_DATA: ["PREMARKET", "PREAPERTURA"],
    USER_RISK_INPUT: ["USER", "USUARIO"],
    PAPER_PREFERENCE: ["PAPER CHOICE", "ELECCIÓN DE PRUEBA"],
    LITERAL_0_33_THIRD_RULE: ["0.33 RULE", "REGLA 0.33"],
    ROUND_HALF_UP_PLUS_TICK: ["ROUNDED + TICK", "REDONDEO + TICK"],
    TARGET_CUSHION_RULE: ["TARGET RULE", "REGLA DE OBJETIVO"],
  };
  return copy(lang, ...labels[value]);
}

function fieldExplanation(field: MooPlanningField<unknown>, lang: Language) {
  if (field.state === "READY") return copy(lang, "Available for this paper calculation.", "Disponible para este cálculo de prueba.");
  if (field.state === "PENDING_MARKET_DATA") return copy(lang, "Waiting for valid point-in-time data for the selected session.", "Esperando datos puntuales válidos para la sesión seleccionada.");
  if (field.state === "USER_INPUT_REQUIRED") return copy(lang, "Complete this value in the paper configuration above.", "Complete este valor en la configuración de prueba de arriba.");
  if (field.state === "PREFERENCE_REQUIRED") return copy(lang, "Choose a paper preference before assigning major and minor thirds.", "Elija una preferencia de prueba antes de asignar los tercios mayor y menor.");
  return copy(lang, "The entered value is outside the permitted range.", "El valor ingresado está fuera del rango permitido.");
}

function valueState(state: MooValueState, lang: Language) {
  const values: Record<MooValueState, [string, string]> = {
    AVAILABLE: ["Available", "Disponible"],
    FROZEN: ["Frozen", "Congelado"],
    PENDING: ["Pending", "Pendiente"],
    NOT_STARTED: ["Not started", "No iniciado"],
    MARKET_CLOSED: ["Market closed", "Mercado cerrado"],
    STALE: ["Stale", "Vencido"],
    NOT_ENTITLED: ["Not entitled", "Sin autorización"],
    NOT_CONFIGURED: ["Not configured", "No configurado"],
    NOT_PROMOTED: ["Model not promoted", "Modelo no promovido"],
    NO_EDGE: ["No qualified edge", "Sin ventaja calificada"],
    MISSED_CHECKPOINT: ["Checkpoint missed", "Punto de control omitido"],
    INVALID: ["Invalid", "Inválido"],
    UNAVAILABLE: ["Unavailable", "No disponible"],
    INSUFFICIENT_BARS: ["Insufficient bars", "Velas insuficientes"],
  };
  return copy(lang, ...values[state]);
}

function marketAbsence(field: MarketValue<number> | undefined, lang: Language, fallback: [string, string]) {
  if (!field) return copy(lang, ...fallback);
  if (field.availability === "NOT_STARTED") return copy(lang, "Not started for selected session", "No iniciado para la sesión seleccionada");
  if (field.availability === "MISSING") return copy(lang, "No archived value", "Sin valor archivado");
  if (field.availability === "NOT_ENTITLED") return copy(lang, "Required feed not entitled", "Fuente requerida sin autorización");
  if (field.availability === "SOURCE_ERROR") return copy(lang, "Source temporarily unavailable", "Fuente temporalmente no disponible");
  return copy(lang, ...fallback);
}

function lifecycleLabel(snapshot: MooDecisionSnapshot, lang: Language) {
  const values: Partial<Record<MooDecisionSnapshot["lifecycle"], [string, string]>> = {
    MARKET_CLOSED: ["MARKET CLOSED", "MERCADO CERRADO"],
    FUTURE_SESSION: ["FUTURE SESSION · PLANNING", "SESIÓN FUTURA · PLANIFICACIÓN"],
    PREPARING: ["PREPARING", "PREPARANDO"],
    READY: ["DECISION WINDOW OPEN", "VENTANA DE DECISIÓN ABIERTA"],
    FROZEN: snapshot.frozenAt == null
      ? ["FREEZE WINDOW PASSED · NO STRICT ARTIFACT", "VENTANA DE CIERRE VENCIDA · SIN ARTEFACTO ESTRICTO"]
      : ["STRICT SNAPSHOT FROZEN · MONITORING", "CAPTURA ESTRICTA CONGELADA · MONITOREO"],
    LATE_LOCKED: snapshot.frozenAt == null
      ? ["LATE WINDOW · NO STRICT ARTIFACT", "VENTANA TARDÍA · SIN ARTEFACTO ESTRICTO"]
      : ["LATE WINDOW · FROZEN SNAPSHOT", "VENTANA TARDÍA · CAPTURA CONGELADA"],
    ENTRY_CLOSED: ["MOO ENTRY CLOSED", "ENTRADA MOO CERRADA"],
    CROSS_COMPLETE: ["OPENING CROSS COMPLETE", "CRUCE DE APERTURA COMPLETO"],
  };
  return values[snapshot.lifecycle]
    ? copy(lang, ...values[snapshot.lifecycle]!)
    : snapshot.lifecycle.replaceAll("_", " ");
}

function decisionLabel(snapshot: MooDecisionSnapshot, lang: Language) {
  const values: Record<MooDecisionSnapshot["decision"], [string, string]> = {
    LONG_FAVORED: ["LONG FAVORED", "LARGO FAVORECIDO"],
    SHORT_FAVORED: ["SHORT FAVORED", "CORTO FAVORECIDO"],
    NO_TRADE: ["NO TRADE", "NO OPERAR"],
  };
  return copy(lang, ...values[snapshot.decision]);
}

function formatRemaining(deadline: MooDeadline, now: number, lang: Language) {
  const remaining = Math.max(0, deadline.at - now);
  if (deadline.passed || remaining === 0) return copy(lang, "Passed", "Vencido");
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours > 0 ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function deadlineCopy(label: MooDeadline["label"], lang: Language) {
  const values: Record<MooDeadline["label"], [string, string]> = {
    DECISION_FREEZE: ["Decision freeze · 09:24:30 ET", "Cierre de decisión · 09:24:30 ET"],
    MODIFY_CANCEL: ["Modify / cancel · 09:25 ET", "Modificar / cancelar · 09:25 ET"],
    FINAL_ENTRY: ["Final MOO entry · 09:28 ET", "Entrada MOO final · 09:28 ET"],
  };
  return copy(lang, ...values[label]);
}

function TicketCard({ ticket, snapshot, lang }: { ticket: MooTicket; snapshot: MooDecisionSnapshot; lang: Language }) {
  const isShort = ticket.side === "SHORT";
  const displayedRole = snapshot.decision === "NO_TRADE" ? "UNASSIGNED" : ticket.thirdRole;
  const fill = cents(ticket.actualFillCents) ?? cents(ticket.estimatedFillCents);
  const target = cents(ticket.rebasedTargetCents) ?? cents(ticket.estimatedTargetCents);
  const assignedDistance = cents(ticket.assignedDistanceCents);
  const pending = valueState(snapshot.predictedOpenState, lang);
  const shortability = ticket.shortability === "AVAILABLE"
    ? copy(lang, "Available", "Disponible")
    : ticket.shortability === "UNAVAILABLE"
      ? copy(lang, "Unavailable", "No disponible")
      : ticket.shortability === "UNCONFIRMED"
        ? copy(lang, "Unconfirmed · ticket blocked", "Sin confirmar · orden bloqueada")
        : copy(lang, "Not applicable", "No aplica");
  const unconfigured = copy(lang, "Not configured · use paper planner", "No configurado · use el planificador de prueba");
  const targetPending = copy(
    lang,
    "Pending · requires a selected side and completed range thirds",
    "Pendiente · requiere un lado seleccionado y tercios de rango completos",
  );

  return (
    <article className={`moo-ticket ${ticket.side.toLowerCase()} ${ticket.favored ? "favored" : ""}`} aria-label={copy(lang, `${ticket.side} MOO strict ticket`, `Orden MOO estricta ${isShort ? "corta" : "larga"}`)}>
      <header>
        <div>
          <span className="moo-overline">{ticket.side} MOO</span>
          <h3>{copy(lang, isShort ? "Short opening ticket" : "Long opening ticket", isShort ? "Orden corta de apertura" : "Orden larga de apertura")}</h3>
        </div>
        <div className="moo-ticket-badges">
          {ticket.favored ? <strong>{copy(lang, "FAVORED", "FAVORECIDA")}</strong> : null}
          <span>{displayedRole === "MAJOR" ? copy(lang, "MAJOR THIRD", "TERCIO MAYOR") : displayedRole === "MINOR" ? copy(lang, "MINOR THIRD", "TERCIO MENOR") : copy(lang, "UNASSIGNED", "SIN ASIGNAR")}</span>
        </div>
      </header>
      <div className="moo-ticket-prices">
        <div>
          <span>{ticket.actualFillCents != null ? copy(lang, "Broker fill", "Ejecución del bróker") : copy(lang, "Estimated fill", "Ejecución estimada")}</span>
          <strong>{fill ?? pending}</strong>
          <small>{ticket.actualFillCents != null ? copy(lang, "Actual account fill", "Ejecución real de la cuenta") : copy(lang, "Opening-cross estimate · not guaranteed", "Estimación del cruce · no garantizada")}</small>
        </div>
        <div>
          <span>{copy(lang, "Take profit", "Toma de ganancia")}</span>
          <strong>{target ?? pending}</strong>
          <small>{ticket.rebasedTargetCents != null ? copy(lang, "Rebased from broker fill", "Recalculado desde la ejecución") : copy(lang, "Provisional until fill", "Provisional hasta la ejecución")}</small>
        </div>
        <div>
          <span>{copy(lang, "Assigned move", "Movimiento asignado")}</span>
          <strong>{assignedDistance ?? pending}</strong>
          <small>{displayedRole === "MAJOR" ? copy(lang, "Major effective third", "Tercio efectivo mayor") : displayedRole === "MINOR" ? copy(lang, "Minor effective third", "Tercio efectivo menor") : copy(lang, "No strict side preference is assigned", "No hay una preferencia estricta asignada")}</small>
        </div>
      </div>
      <dl className="moo-ticket-risk">
        <div><dt>{copy(lang, "Order type", "Tipo de orden")}</dt><dd>MOO</dd></div>
        <div><dt>{copy(lang, "Target offset", "Distancia al objetivo")}</dt><dd>{cents(ticket.targetMoveCents) ?? targetPending}</dd></div>
        <div><dt>{copy(lang, "Stop offset", "Distancia al stop")}</dt><dd>{cents(ticket.stopOffsetCents) ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Quantity", "Cantidad")}</dt><dd>{ticket.quantity ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Account", "Cuenta")}</dt><dd>{ticket.accountLabel ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Reserve", "Reserva")}</dt><dd>{cents(ticket.reserveCents) ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Maximum loss", "Pérdida máxima")}</dt><dd>{cents(ticket.maximumLossCents) ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Time stop", "Stop por tiempo")}</dt><dd>{ticket.timeStop ?? unconfigured}</dd></div>
        {isShort ? <div className="moo-shortability"><dt>{copy(lang, "Shortability", "Disponibilidad para corto")}</dt><dd>{shortability}</dd></div> : null}
      </dl>
      <p className={`moo-ticket-state ${ticket.actionable ? "ready" : "blocked"}`}>
        {ticket.actionable ? copy(lang, "Strict ticket passed configured review gates", "La orden estricta aprobó los controles configurados") : copy(lang, "Preview only · not actionable", "Solo vista previa · no operable")}
      </p>
    </article>
  );
}

function PlanningFieldValue<T>({
  field,
  lang,
  format,
}: {
  field: MooPlanningField<T>;
  lang: Language;
  format: (value: T) => string;
}) {
  return (
    <div className={`moo-planning-field ${field.state.toLowerCase()}`}>
      <strong>{field.value == null ? "—" : format(field.value)}</strong>
      <span className="moo-field-state">{planningStateLabel(field.state, lang)}</span>
      <small>{fieldExplanation(field, lang)}</small>
      <div className="moo-field-provenance" aria-label={copy(lang, "Value sources", "Fuentes del valor")}>
        {field.provenance.slice(0, 3).map((item) => <span key={item}>{provenanceLabel(item, lang)}</span>)}
      </div>
    </div>
  );
}

function PaperSideConfiguration({
  side,
  config,
  lang,
  onChange,
}: {
  side: "LONG" | "SHORT";
  config: PaperSideConfig;
  lang: Language;
  onChange: <K extends keyof PaperSideConfig>(key: K, value: PaperSideConfig[K]) => void;
}) {
  const id = `moo-paper-${side.toLowerCase()}`;
  const sideName = side === "LONG" ? copy(lang, "Long", "Largo") : copy(lang, "Short", "Corto");
  return (
    <fieldset className={`moo-paper-side-config ${side.toLowerCase()}`}>
      <legend>{sideName} · {copy(lang, "paper risk inputs", "entradas de riesgo de prueba")}</legend>
      <p id={`${id}-help`}>{copy(lang, "This browser reuses your validated paper-risk profile for future dates. Never enter an API key or account number.", "Este navegador reutiliza su perfil validado de riesgo de prueba para fechas futuras. Nunca ingrese una clave API ni un número de cuenta.")}</p>
      <div className="moo-paper-input-grid">
        <label htmlFor={`${id}-mode`}><span>{copy(lang, "Quantity mode", "Modo de cantidad")}</span><select id={`${id}-mode`} value={config.quantityMode} onChange={(event) => onChange("quantityMode", event.target.value as MooQuantityMode)} aria-describedby={`${id}-help`}><option value="AUTO_RISK">{copy(lang, "Auto · risk budget", "Auto · presupuesto de riesgo")}</option><option value="MANUAL">{copy(lang, "Manual shares", "Acciones manuales")}</option></select></label>
        <label htmlFor={`${id}-stop`}><span>{copy(lang, "Stop offset · USD/share", "Distancia al stop · USD/acción")}</span><input id={`${id}-stop`} type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={config.stopOffset} onChange={(event) => onChange("stopOffset", event.target.value)} /></label>
        <label htmlFor={`${id}-risk`}><span>{copy(lang, "Risk budget · USD", "Presupuesto de riesgo · USD")}</span><input id={`${id}-risk`} type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="0.00" value={config.riskBudget} onChange={(event) => onChange("riskBudget", event.target.value)} /></label>
        <label htmlFor={`${id}-slippage`}><span>{copy(lang, "Slippage allowance · USD/share", "Margen de deslizamiento · USD/acción")}</span><input id={`${id}-slippage`} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={config.slippageAllowance} onChange={(event) => onChange("slippageAllowance", event.target.value)} /></label>
        <label htmlFor={`${id}-max`}><span>{copy(lang, "Maximum shares", "Máximo de acciones")}</span><input id={`${id}-max`} type="number" inputMode="numeric" min="1" step="1" placeholder="0" value={config.maxShares} onChange={(event) => onChange("maxShares", event.target.value)} /></label>
        {config.quantityMode === "MANUAL" ? <label htmlFor={`${id}-quantity`}><span>{copy(lang, "Manual quantity", "Cantidad manual")}</span><input id={`${id}-quantity`} type="number" inputMode="numeric" min="1" step="1" placeholder="0" value={config.manualQuantity} onChange={(event) => onChange("manualQuantity", event.target.value)} /></label> : null}
        <label htmlFor={`${id}-account`}><span>{copy(lang, "Paper account label", "Etiqueta de cuenta de prueba")}</span><input id={`${id}-account`} type="text" autoComplete="off" maxLength={40} placeholder={copy(lang, `${sideName} paper`, `Prueba ${sideName.toLowerCase()}`)} value={config.accountLabel} onChange={(event) => onChange("accountLabel", event.target.value)} /></label>
        <label htmlFor={`${id}-reserve`}><span>{copy(lang, "Cash reserve · USD", "Reserva de efectivo · USD")}</span><input id={`${id}-reserve`} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={config.reserve} onChange={(event) => onChange("reserve", event.target.value)} /></label>
        <label htmlFor={`${id}-time`}><span>{copy(lang, "Time stop", "Stop por tiempo")}</span><input id={`${id}-time`} type="text" maxLength={30} placeholder={copy(lang, "Example: 10:00 ET", "Ejemplo: 10:00 ET")} value={config.timeStop} onChange={(event) => onChange("timeStop", event.target.value)} /></label>
      </div>
    </fieldset>
  );
}

function paperTicketComplete(ticket: MooPlanningTicket) {
  return [
    ticket.estimatedFillCents,
    ticket.assignedDistanceCents,
    ticket.targetOffsetCents,
    ticket.provisionalTargetCents,
    ticket.stopOffsetCents,
    ticket.slippageAllowanceCents,
    ticket.riskBudgetCents,
    ticket.quantity,
    ticket.maximumLossCents,
    ticket.reserveCents,
    ticket.accountLabel,
    ticket.timeStop,
  ].every((field) => field.state === "READY");
}

function PaperPlanningTicketCard({
  ticket,
  lang,
  shortability,
}: {
  ticket: MooPlanningTicket;
  lang: Language;
  shortability: { ready: boolean; label: string; detail: string };
}) {
  const isShort = ticket.side === "SHORT";
  const role = ticket.thirdRole === "MAJOR"
    ? copy(lang, "MAJOR THIRD", "TERCIO MAYOR")
    : ticket.thirdRole === "MINOR"
      ? copy(lang, "MINOR THIRD", "TERCIO MENOR")
      : copy(lang, "UNASSIGNED", "SIN ASIGNAR");
  const configured = paperTicketComplete(ticket);
  return (
    <article className={`moo-paper-ticket ${ticket.side.toLowerCase()}`} aria-label={copy(lang, `${ticket.side} paper planning ticket`, `Orden de planificación de prueba ${isShort ? "corta" : "larga"}`)}>
      <header>
        <div><span className="moo-overline">{ticket.side} · {copy(lang, "PAPER SCENARIO", "ESCENARIO DE PRUEBA")}</span><h4>{copy(lang, isShort ? "Short planning ticket" : "Long planning ticket", isShort ? "Orden corta de planificación" : "Orden larga de planificación")}</h4></div>
        <span className={`moo-role-badge ${ticket.thirdRole.toLowerCase()}`}>{role}</span>
      </header>
      <div className="moo-paper-ticket-primary">
        <div><span>{copy(lang, "Research fill estimate", "Estimación de ejecución")}</span><PlanningFieldValue field={ticket.estimatedFillCents} lang={lang} format={(value) => cents(value) ?? "—"}/></div>
        <div><span>{copy(lang, "Provisional take profit", "Toma de ganancia provisional")}</span><PlanningFieldValue field={ticket.provisionalTargetCents} lang={lang} format={(value) => cents(value) ?? "—"}/></div>
        <div><span>{copy(lang, "Assigned move", "Movimiento asignado")}</span><PlanningFieldValue field={ticket.assignedDistanceCents} lang={lang} format={(value) => cents(value) ?? "—"}/></div>
      </div>
      <dl className="moo-paper-ticket-fields">
        <div><dt>{copy(lang, "Order type", "Tipo de orden")}</dt><dd>MOO · OPG</dd><small>{copy(lang, "LITERAL", "LITERAL")}</small></div>
        <div><dt>{copy(lang, "Target offset", "Distancia al objetivo")}</dt><dd>{cents(ticket.targetOffsetCents.value) ?? "—"}</dd><small>{copy(lang, "CALCULATED", "CALCULADO")} · {planningStateLabel(ticket.targetOffsetCents.state, lang)}</small></div>
        <div><dt>{copy(lang, "Stop offset", "Distancia al stop")}</dt><dd>{cents(ticket.stopOffsetCents.value) ?? "—"}</dd><small>{copy(lang, "USER", "USUARIO")} · {planningStateLabel(ticket.stopOffsetCents.state, lang)}</small></div>
        <div><dt>{copy(lang, "Slippage allowance", "Margen de deslizamiento")}</dt><dd>{cents(ticket.slippageAllowanceCents.value) ?? "—"}</dd><small>{copy(lang, "USER", "USUARIO")} · {planningStateLabel(ticket.slippageAllowanceCents.state, lang)}</small></div>
        <div><dt>{copy(lang, "Risk budget", "Presupuesto de riesgo")}</dt><dd>{cents(ticket.riskBudgetCents.value) ?? "—"}</dd><small>{copy(lang, "USER", "USUARIO")} · {planningStateLabel(ticket.riskBudgetCents.state, lang)}</small></div>
        <div><dt>{copy(lang, "Quantity", "Cantidad")}</dt><dd>{ticket.quantity.value ?? "—"}</dd><small>{copy(lang, "RISK RULE", "REGLA DE RIESGO")} · {planningStateLabel(ticket.quantity.state, lang)}</small></div>
        <div><dt>{copy(lang, "Account label", "Etiqueta de cuenta")}</dt><dd>{ticket.accountLabel.value ?? "—"}</dd><small>{copy(lang, "USER", "USUARIO")} · {planningStateLabel(ticket.accountLabel.state, lang)}</small></div>
        <div><dt>{copy(lang, "Cash reserve", "Reserva de efectivo")}</dt><dd>{cents(ticket.reserveCents.value) ?? "—"}</dd><small>{copy(lang, "USER", "USUARIO")} · {planningStateLabel(ticket.reserveCents.state, lang)}</small></div>
        <div><dt>{copy(lang, "Modeled maximum loss", "Pérdida máxima modelada")}</dt><dd>{cents(ticket.maximumLossCents.value) ?? "—"}</dd><small>{copy(lang, "CALCULATED", "CALCULADO")} · {planningStateLabel(ticket.maximumLossCents.state, lang)}</small></div>
        <div><dt>{copy(lang, "Time stop", "Stop por tiempo")}</dt><dd>{ticket.timeStop.value ?? "—"}</dd><small>{copy(lang, "USER", "USUARIO")} · {planningStateLabel(ticket.timeStop.state, lang)}</small></div>
        {isShort ? <div className="moo-paper-shortability reference"><dt>{copy(lang, "Indicative broker reference", "Referencia indicativa del bróker")}</dt><dd>{shortability.label}</dd><small>{shortability.detail}</small></div> : null}
      </dl>
      <p className="moo-paper-ticket-state"><b>{configured ? copy(lang, "PAPER INPUTS COMPLETE", "ENTRADAS DE PRUEBA COMPLETAS") : copy(lang, "PAPER INPUTS INCOMPLETE", "ENTRADAS DE PRUEBA INCOMPLETAS")}</b><span>{copy(lang, "Preview only · never submits an order", "Solo vista previa · nunca envía una orden")}</span></p>
    </article>
  );
}

function PaperPlanningPanel({
  snapshot,
  researchPreview,
  planning,
  initialBrokerStatus,
  brokerStatusUnavailable,
  nowMs,
  lang,
}: {
  snapshot: MooDecisionSnapshot;
  researchPreview: MooResearchPreview;
  planning?: MooPlanningInput;
  initialBrokerStatus?: BrokerStatusPayload | null;
  brokerStatusUnavailable: boolean;
  nowMs: number;
  lang: Language;
}) {
  const targetSession = planning?.targetSession ?? snapshot.targetSession;
  const storageKey = `aperture-moo-paper-planning:${targetSession}`;
  const [config, setConfig] = useState<PaperPlanningConfig>(() => storedPaperConfig(storageKey));
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatusPayload | null>(initialBrokerStatus ?? null);
  const [brokerState, setBrokerState] = useState<"LOADING" | "LIVE" | "PRIVATE" | "UNAVAILABLE">(initialBrokerStatus ? "LIVE" : "LOADING");

  useEffect(() => {
    try {
      window.localStorage.setItem(PAPER_PROFILE_STORAGE_KEY, JSON.stringify(config));
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Browser storage is optional; the visible paper calculator keeps working in memory.
    }
  }, [config, storageKey]);

  useEffect(() => {
    if (brokerStatusUnavailable) {
      return;
    }
    if (initialBrokerStatus) {
      return;
    }
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/moo/broker-status", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (response.status === 401 || response.status === 403) {
          setBrokerStatus(null);
          setBrokerState("PRIVATE");
          return;
        }
        if (!response.ok) throw new Error("broker status unavailable");
        const payload = await response.json() as BrokerStatusPayload;
        setBrokerStatus(payload);
        setBrokerState(payload.status === "live" || payload.status === "limited" ? "LIVE" : "UNAVAILABLE");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBrokerState("UNAVAILABLE");
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [brokerStatusUnavailable, initialBrokerStatus, targetSession]);

  const effectiveBrokerStatus = brokerStatusUnavailable ? null : initialBrokerStatus ?? brokerStatus;
  const effectiveBrokerState = brokerStatusUnavailable
    ? "UNAVAILABLE"
    : initialBrokerStatus
    ? initialBrokerStatus.status === "live" || initialBrokerStatus.status === "limited" ? "LIVE" : "UNAVAILABLE"
    : brokerState;

  const resolvedPreference: MooPaperPreference = config.preference === "RESEARCH"
    ? researchPreview.lean === "LONG_LEAN"
      ? "LONG_FAVORED"
      : researchPreview.lean === "SHORT_LEAN"
        ? "SHORT_FAVORED"
        : "UNASSIGNED"
    : config.preference;
  const researchAnchorCents = planning?.estimatedOpenCents ?? (researchPreview.median == null ? null : Math.round(researchPreview.median * 100));
  const paperSnapshot = useMemo(() => buildMooPlanningSnapshot({
    targetSession,
    researchAnchorCents,
    previousHighCents: planning?.previousHighCents ?? null,
    previousLowCents: planning?.previousLowCents ?? null,
    premarketHighCents: planning?.premarketHighCents ?? null,
    premarketLowCents: planning?.premarketLowCents ?? null,
    preference: resolvedPreference,
    takeProfitCushionCents: snapshot.takeProfitCushionCents,
    longRisk: sideRiskInput(config.long),
    shortRisk: sideRiskInput(config.short),
  }), [config, planning, researchAnchorCents, resolvedPreference, snapshot.takeProfitCushionCents, targetSession]);

  const updateSide = <K extends keyof PaperSideConfig>(side: "long" | "short", key: K, value: PaperSideConfig[K]) => {
    setConfig((current) => ({ ...current, [side]: { ...current[side], [key]: value } }));
  };
  const risksReady = paperTicketComplete(paperSnapshot.longTicket) && paperTicketComplete(paperSnapshot.shortTicket);
  const accountLabelsReady = paperSnapshot.longTicket.accountLabel.state === "READY" && paperSnapshot.shortTicket.accountLabel.state === "READY";
  const brokerReadiness = summarizeMooReadiness(snapshot, effectiveBrokerStatus);
  const brokerElapsedAgeMs = effectiveBrokerStatus == null
    ? null
    : Math.max(effectiveBrokerStatus.freshness.ageMs ?? 0, Math.max(0, nowMs - effectiveBrokerStatus.checkedAt));
  const brokerFreshnessEligible = effectiveBrokerStatus != null && ["fresh", "cached"].includes(effectiveBrokerStatus.freshness.state) &&
    brokerElapsedAgeMs != null && brokerElapsedAgeMs <= effectiveBrokerStatus.freshness.maxAgeMs;
  const borrowReferenceCurrent = effectiveBrokerStatus?.configured === true && effectiveBrokerStatus.status === "live" && brokerFreshnessEligible && brokerReadiness.broker.indicativeShortable === true;
  const borrowReady = borrowReferenceCurrent && brokerReadiness.broker.strictLocateReady;
  const indicativeBorrowDetail = brokerReadiness.broker.indicativeEasyToBorrow
    ? copy(
        lang,
        "Easy-to-borrow is indicative asset metadata only; it is not an account-specific or guaranteed locate.",
        "La clasificación de préstamo fácil es solo metadato indicativo del activo; no es una localización específica de la cuenta ni garantizada.",
      )
    : copy(
        lang,
        "Asset shortability is indicative only and does not guarantee a locate.",
        "La disponibilidad del activo para corto es solo indicativa y no garantiza una localización.",
      );
  const shortability = {
    ready: borrowReady,
    label: borrowReady
      ? copy(lang, "Fresh locate confirmed", "Localización reciente confirmada")
      : borrowReferenceCurrent
        ? copy(lang, "Indicative shortable · no guaranteed locate", "Corto indicativo · sin localización garantizada")
        : copy(lang, "Unconfirmed · blocked", "Sin confirmar · bloqueado"),
    detail: effectiveBrokerStatus?.status === "live" || effectiveBrokerStatus?.status === "limited"
      ? `${copy(lang, "Borrow status", "Estado de préstamo")}: ${effectiveBrokerStatus.borrowStatus ?? "—"} · ${indicativeBorrowDetail} · ${copy(lang, "checked", "consultado")} ${etDateTime(effectiveBrokerStatus.checkedAt, lang)}`
      : brokerStatusUnavailable
        ? copy(lang, "Dated broker metadata is diagnostic-only until Strict status refreshes.", "Los metadatos fechados del bróker son solo de diagnóstico hasta que se actualice el estado estricto.")
      : effectiveBrokerState === "PRIVATE"
        ? copy(lang, "Private authenticated broker check required.", "Se requiere una verificación privada autenticada del bróker.")
        : copy(lang, "No fresh broker borrow observation is available.", "No hay una observación reciente de préstamo del bróker."),
  };
  const gates = [
    { label: copy(lang, "Research anchor", "Ancla de investigación"), ready: paperSnapshot.researchAnchorCents.state === "READY", detail: fieldExplanation(paperSnapshot.researchAnchorCents, lang) },
    { label: copy(lang, "Both thirds", "Ambos tercios"), ready: paperSnapshot.majorThirdCents.state === "READY" && paperSnapshot.minorThirdCents.state === "READY", detail: copy(lang, "Requires previous-session and target-premarket highs/lows.", "Requiere máximos y mínimos de la sesión previa y la preapertura objetivo.") },
    { label: copy(lang, "Paper preference", "Preferencia de prueba"), ready: resolvedPreference !== "UNASSIGNED", detail: resolvedPreference === "UNASSIGNED" ? copy(lang, "No side assigned.", "Ningún lado asignado.") : copy(lang, "Major/minor paper roles assigned.", "Roles de prueba mayor/menor asignados.") },
    { label: copy(lang, "Risk inputs", "Entradas de riesgo"), ready: risksReady, detail: risksReady ? copy(lang, "Both paper configurations are complete.", "Ambas configuraciones de prueba están completas.") : copy(lang, "Complete the required fields below.", "Complete los campos requeridos abajo.") },
    { label: copy(lang, "Paper account labels", "Etiquetas de cuenta de prueba"), ready: accountLabelsReady, detail: accountLabelsReady ? copy(lang, "Both browser-local labels are set.", "Ambas etiquetas locales están definidas.") : copy(lang, "Labels only; never enter credentials.", "Solo etiquetas; nunca ingrese credenciales.") },
  ];
  const combinedLoss = paperSnapshot.longTicket.maximumLossCents.value != null && paperSnapshot.shortTicket.maximumLossCents.value != null
    ? paperSnapshot.longTicket.maximumLossCents.value + paperSnapshot.shortTicket.maximumLossCents.value
    : null;
  const preferenceHelp = config.preference === "RESEARCH"
    ? researchPreview.lean === "LONG_LEAN" || researchPreview.lean === "SHORT_LEAN"
      ? copy(lang, "The current non-actionable research lean assigns the paper thirds.", "El sesgo actual de investigación no operable asigna los tercios de prueba.")
      : copy(lang, "Research has no directional edge, so both paper thirds remain unassigned.", "La investigación no tiene ventaja direccional, por lo que ambos tercios permanecen sin asignar.")
    : copy(lang, "Manual paper scenario · not a model decision.", "Escenario manual de prueba · no es una decisión del modelo.");

  return (
    <details className="moo-paper-planner">
      <summary className="moo-paper-planner-head">
        <div><span className="moo-overline">{copy(lang, "OPTIONAL PAPER SIMULATION · BROWSER-LOCAL", "SIMULACIÓN DE PRUEBA OPCIONAL · LOCAL")}</span><h3 id="moo-paper-planner-title">{copy(lang, "Explore paper-risk scenarios", "Explore escenarios de riesgo de prueba")}</h3><p>{copy(lang, "This separate calculator cannot unlock Strict MOO or submit an order. Open it only to explore browser-local simulation inputs.", "Esta calculadora separada no puede habilitar MOO Estricto ni enviar una orden. Ábrala solo para explorar entradas de simulación guardadas en este navegador.")}</p></div>
        <div className="moo-paper-only-badge"><strong>{copy(lang, "PAPER ONLY", "SOLO PRUEBA")}</strong><span>{copy(lang, "Never actionable", "Nunca operable")}</span></div>
        <span className="moo-paper-disclosure"><span className="closed">{copy(lang, "Open simulation", "Abrir simulación")}</span><span className="open">{copy(lang, "Close simulation", "Cerrar simulación")}</span></span>
      </summary>

      <div className="moo-paper-planner-body" aria-labelledby="moo-paper-planner-title">

      <div className="moo-paper-gates" aria-label={copy(lang, "Paper planning completeness checklist", "Lista de integridad de la planificación de prueba")}>
        {gates.map((gate) => <div className={gate.ready ? "ready" : "blocked"} key={gate.label}><i aria-hidden="true"/><span><b>{gate.label}</b><small>{gate.detail}</small></span><strong>{gate.ready ? copy(lang, "READY", "LISTO") : copy(lang, "BLOCKED", "BLOQUEADO")}</strong></div>)}
      </div>

      <div className="moo-paper-formula-grid moo-live-input-grid" aria-label={copy(lang, "Live inputs used by the paper planner", "Entradas en vivo usadas por el planificador de prueba")}>
        <div><span>{copy(lang, "Prior official close", "Cierre oficial anterior")}</span><strong>{cents(planning?.priorOfficialCloseCents ?? null) ?? marketAbsence(planning?.marketStates?.priorClose, lang, ["Missing: prior close", "Falta: cierre anterior"])}</strong><small>{copy(lang, "Previous completed Nasdaq session", "Sesión Nasdaq completada anterior")}</small></div>
        <div><span>{copy(lang, "Current premarket price", "Precio actual de preapertura")}</span><strong>{cents(planning?.premarketCurrentCents ?? null) ?? marketAbsence(planning?.marketStates?.premarketCurrent, lang, ["Missing: premarket current", "Falta: precio actual de preapertura"])}</strong><small>{etDateTime(planning?.quoteObservedAt ?? null, lang)}</small></div>
        <div><span>{copy(lang, "Premarket high / low", "Máximo / mínimo de preapertura")}</span><strong>{cents(planning?.premarketHighCents ?? null) ?? marketAbsence(planning?.marketStates?.premarketHigh, lang, ["Missing high", "Falta máximo"])} / {cents(planning?.premarketLowCents ?? null) ?? marketAbsence(planning?.marketStates?.premarketLow, lang, ["Missing low", "Falta mínimo"])}</strong><small>{copy(lang, "Selected trading date only", "Solo la fecha de negociación seleccionada")}</small></div>
        <div><span>{copy(lang, "Premarket range", "Rango de preapertura")}</span><strong>{cents(paperSnapshot.premarketRangeCents.value) ?? copy(lang, "Incomplete high/low", "Máximo/mínimo incompleto")}</strong><small>{planningStateLabel(paperSnapshot.premarketRangeCents.state, lang)}</small></div>
        <div><span>{copy(lang, "Major / minor thirds", "Tercios mayor / menor")}</span><strong>{cents(paperSnapshot.majorThirdCents.value) ?? "—"} / {cents(paperSnapshot.minorThirdCents.value) ?? "—"}</strong><small>0.33 · ROUND_HALF_UP · +$0.01</small></div>
        <div><span>{copy(lang, "Quote source / freshness", "Fuente / vigencia de cotización")}</span><strong>{planning?.quoteSource ?? copy(lang, "Missing source", "Falta fuente")}</strong><small>{planning?.quoteFreshness ?? copy(lang, "Unavailable", "No disponible")} · {etDateTime(planning?.marketCheckedAt ?? null, lang)}</small></div>
      </div>

      <div className="moo-paper-preference">
        <label htmlFor="moo-paper-preference"><span>{copy(lang, "Paper preference", "Preferencia de prueba")}</span><select id="moo-paper-preference" value={config.preference} onChange={(event) => setConfig((current) => ({ ...current, preference: event.target.value as PlanningPreference }))} aria-describedby="moo-paper-preference-help"><option value="RESEARCH">{copy(lang, "Follow research lean", "Seguir sesgo de investigación")}</option><option value="LONG_FAVORED">{copy(lang, "Long-favored manual scenario", "Escenario manual favorable a largo")}</option><option value="SHORT_FAVORED">{copy(lang, "Short-favored manual scenario", "Escenario manual favorable a corto")}</option><option value="UNASSIGNED">{copy(lang, "Unassigned · compare only", "Sin asignar · solo comparar")}</option></select></label>
        <p id="moo-paper-preference-help">{preferenceHelp}</p>
        <div className="moo-paper-risk-total"><span>{copy(lang, "Combined modeled maximum loss", "Pérdida máxima modelada combinada")}</span><strong>{cents(combinedLoss) ?? "—"}</strong><small>{copy(lang, "Two paper accounts are not atomic; gaps, halts, fees and failed stops can exceed this amount.", "Dos cuentas de prueba no son atómicas; brechas, suspensiones, comisiones y stops fallidos pueden superar este monto.")}</small></div>
      </div>

      <div className="moo-paper-config-grid">
        <PaperSideConfiguration side="LONG" config={config.long} lang={lang} onChange={(key, value) => updateSide("long", key, value)}/>
        <PaperSideConfiguration side="SHORT" config={config.short} lang={lang} onChange={(key, value) => updateSide("short", key, value)}/>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {copy(
          lang,
          `Paper simulation ${risksReady && accountLabelsReady ? "inputs complete" : "inputs incomplete"}. Combined modeled maximum loss ${cents(combinedLoss) ?? "unavailable"}.`,
          `Simulación de prueba con entradas ${risksReady && accountLabelsReady ? "completas" : "incompletas"}. Pérdida máxima modelada combinada ${cents(combinedLoss) ?? "no disponible"}.`,
        )}
      </p>
      <div className="moo-paper-ticket-grid">
        <PaperPlanningTicketCard ticket={paperSnapshot.longTicket} lang={lang} shortability={shortability}/>
        <PaperPlanningTicketCard ticket={paperSnapshot.shortTicket} lang={lang} shortability={shortability}/>
      </div>

      <details className="moo-paper-why">
        <summary>{copy(lang, "Why these numbers?", "¿Por qué estos números?")}</summary>
        <div className="moo-paper-formula-grid">
          <div><span>{copy(lang, "Previous-session range / third", "Rango / tercio de sesión previa")}</span><strong>{cents(paperSnapshot.previousRangeCents.value) ?? "—"} / {cents(paperSnapshot.previousEffectiveThirdCents.value) ?? "—"}</strong><small>{planningStateLabel(paperSnapshot.previousEffectiveThirdCents.state, lang)}</small></div>
          <div><span>{copy(lang, "Target-premarket range / third", "Rango / tercio de preapertura objetivo")}</span><strong>{cents(paperSnapshot.premarketRangeCents.value) ?? "—"} / {cents(paperSnapshot.premarketEffectiveThirdCents.value) ?? "—"}</strong><small>{planningStateLabel(paperSnapshot.premarketEffectiveThirdCents.state, lang)}</small></div>
          <div><span>{copy(lang, "Major / minor candidates", "Candidatos mayor / menor")}</span><strong>{cents(paperSnapshot.majorThirdCents.value) ?? "—"} / {cents(paperSnapshot.minorThirdCents.value) ?? "—"}</strong><small>0.33 · ROUND_HALF_UP · +$0.01</small></div>
          <div><span>{copy(lang, "Target cushion", "Margen del objetivo")}</span><strong>{cents(paperSnapshot.takeProfitCushionCents.value) ?? "—"}</strong><small>{copy(lang, "Offset = assigned third − cushion, one-cent minimum.", "Distancia = tercio asignado − margen, mínimo de un centavo.")}</small></div>
          <div><span>{copy(lang, "Auto-size formula", "Fórmula de tamaño automático")}</span><strong>{copy(lang, "FLOOR(risk ÷ (stop + slippage))", "ENTERO(riesgo ÷ (stop + deslizamiento))")}</strong><small>{copy(lang, "Capped by maximum shares; buying power is never assumed.", "Limitado por el máximo de acciones; nunca se presume el poder adquisitivo.")}</small></div>
          <div><span>{copy(lang, "Planning data checked", "Datos de planificación consultados")}</span><strong>{etDateTime(planning?.marketCheckedAt ?? null, lang)}</strong><small>{copy(lang, "Research computed", "Investigación calculada")}: {etDateTime(planning?.computedAt ?? researchPreview.computedAt, lang)} · {copy(lang, "Broker checked", "Bróker consultado")}: {etDateTime(effectiveBrokerStatus?.checkedAt ?? null, lang)}</small></div>
        </div>
      </details>
      </div>
    </details>
  );
}

function sourceLabel(source: MooSourceHealth, lang: Language) {
  const state: Record<MooSourceHealth["state"], [string, string]> = {
    LIVE: ["LIVE", "EN VIVO"],
    DEGRADED: ["DEGRADED", "DEGRADADA"],
    DELAYED: ["DELAYED", "RETRASADA"],
    CLOSED: ["CLOSED", "CERRADA"],
    UNAVAILABLE: ["UNAVAILABLE", "NO DISPONIBLE"],
  };
  return copy(lang, ...state[source.state]);
}

function strictSourceName(source: MooSourceHealth, lang: Language) {
  const labels: Record<MooSourceHealth["id"], [string, string]> = {
    US: ["U.S. NVDA execution quote", "Cotización de ejecución de NVDA EE. UU."],
    NVD: ["German NVD optional model input", "Entrada opcional del modelo: NVD alemán"],
    FX: ["EUR/USD optional model input", "Entrada opcional del modelo: EUR/USD"],
    FUTURES: ["NQ futures optional model input", "Entrada opcional del modelo: futuros NQ"],
    NOII: ["Nasdaq NOII post-freeze monitoring", "Monitoreo NOII de Nasdaq posterior al cierre"],
  };
  const label = labels[source.id];
  if (!label) return source.label || source.id || copy(lang, "Unknown source", "Fuente desconocida");
  return copy(lang, label[0], label[1]);
}

function strictVenueName(source: MooSourceHealth, lang: Language) {
  if (!source.venue || lang === "en") return source.venue;
  const venues: Record<MooSourceHealth["id"], string> = {
    US: "Se requiere SIP consolidado",
    NVD: "Fuente directa autorizada del mercado no configurada",
    FX: "Fuente institucional de contado no configurada",
    FUTURES: "Autorización CME no configurada",
    NOII: "Autorización del Cruce de Apertura Nasdaq no configurada",
  };
  return venues[source.id];
}

function warningLabel(warning: string, lang: Language) {
  if (warning === "LAST_GOOD_SERVER_AUDIT_ONLY") return copy(lang, "The dated last-good server evaluation is shown for diagnosis only. All strict actionability is disabled until a current validation succeeds.", "La última evaluación fechada válida del servidor se muestra solo para diagnóstico. Toda operabilidad estricta queda deshabilitada hasta que una validación vigente tenga éxito.");
  if (lang === "en") return warning;
  if (/real-time entitlement is required/i.test(warning)) return "Se requiere una autorización de datos en tiempo real apta para ejecución.";
  if (/source is unavailable/i.test(warning)) return "Una fuente estricta requerida no está disponible.";
  if (/duplicate source-health/i.test(warning)) return "La captura contiene registros duplicados de estado de fuente y fue bloqueada.";
  if (/no actionable observation/i.test(warning)) return "La fuente estricta no tiene una observación operable.";
  if (/post-evaluation|clock-skewed|future/i.test(warning)) return "La marca de tiempo de una fuente no cumple el límite puntual y fue bloqueada.";
  if (/stale by/i.test(warning)) return "Una fuente estricta excede la política de vigencia.";
  if (/risk configurations/i.test(warning)) return "La configuración de riesgo estricta está incompleta o no es consistente.";
  if (/deadline|window has passed|late and locked/i.test(warning)) return "La ventana operativa estricta está cerrada; solo queda disponible la auditoría.";
  return "El sistema estricto permanece bloqueado por una validación de seguridad del servidor.";
}

function entitlementLabel(source: MooSourceHealth, lang: Language) {
  const labels: Record<MooSourceHealth["entitlement"], [string, string]> = {
    REALTIME: ["Real-time entitled", "Tiempo real autorizado"],
    DELAYED: ["Delayed entitlement", "Autorización retrasada"],
    LIMITED: ["Limited coverage", "Cobertura limitada"],
    NOT_ENTITLED: ["API REQUIRED · execution entitlement", "API REQUERIDA · autorización de ejecución"],
    UNAVAILABLE: ["Unavailable", "No disponible"],
  };
  return copy(lang, ...labels[source.entitlement]);
}

function planningStatusLabel(status: MooPlanningSource["status"], lang: Language) {
  const values: Record<MooPlanningSource["status"], [string, string]> = {
    LIVE: ["LIVE", "EN VIVO"],
    LIMITED: ["LIMITED", "LIMITADA"],
    PENDING: ["PENDING", "PENDIENTE"],
    CLOSED: ["CLOSED", "CERRADO"],
    API_REQUIRED: ["API REQUIRED", "API REQUERIDA"],
    UNAVAILABLE: ["UNAVAILABLE", "NO DISPONIBLE"],
  };
  return copy(lang, ...values[status]);
}

function MooPlanningSourceStrip({ sources, lang }: { sources: MooPlanningSource[]; lang: Language }) {
  return (
    <div className="moo-planning-sources">
      {sources.map((source) => (
        <article className={`moo-planning-source ${source.status.toLowerCase()}`} key={source.id}>
          <div className="moo-source-head"><i aria-hidden="true"/><strong>{source.label}</strong><span>{planningStatusLabel(source.status, lang)}</span></div>
          <p>{source.provider}</p>
          <small>{source.detail}</small>
          <div className="moo-source-times"><time dateTime={isoDateTime(source.observedAt)}>{copy(lang, "Observed", "Observado")}: {etDateTime(source.observedAt, lang)}</time><time dateTime={isoDateTime(source.checkedAt)}>{copy(lang, "Checked", "Consultado")}: {etDateTime(source.checkedAt, lang)}</time></div>
        </article>
      ))}
    </div>
  );
}

export function MooSourceStrip({ sources, lang, expanded = false }: { sources: MooSourceHealth[]; lang: Language; expanded?: boolean }) {
  return (
    <div className={`moo-sources ${expanded ? "expanded" : ""}`}>
      {sources.map((source) => (
        <article className={`moo-source ${source.state.toLowerCase()}`} key={source.id}>
          <div className="moo-source-head"><i aria-hidden="true"/><strong>{strictSourceName(source, lang)}</strong><span>{sourceLabel(source, lang)}</span></div>
          <p>{source.provider ?? copy(lang, "Provider not configured", "Proveedor no configurado")}{source.venue ? ` · ${strictVenueName(source, lang)}` : ""}</p>
          <small>{entitlementLabel(source, lang)}</small>
          {expanded ? <div className="moo-source-times"><time dateTime={isoDateTime(source.observedAt)}>{copy(lang, "Observed", "Observado")}: {etDateTime(source.observedAt, lang)}</time><time dateTime={isoDateTime(source.checkedAt)}>{copy(lang, "Checked", "Consultado")}: {etDateTime(source.checkedAt, lang)}</time><span>{copy(lang, "Age", "Edad")}: {source.ageMs == null ? "—" : `${Math.round(source.ageMs / 1000)}s`}</span></div> : null}
        </article>
      ))}
    </div>
  );
}

function MooSourceGroup({
  sources,
  readiness,
  lang,
  kind,
  title,
  description,
  collapsible = false,
}: {
  sources: MooSourceHealth[];
  readiness: MooReadinessGroup;
  lang: Language;
  kind: "required" | "optional" | "monitoring";
  title: string;
  description: string;
  collapsible?: boolean;
}) {
  if (!sources.length && readiness.total === 0) return null;
  const connected = kind === "required" ? readiness.ready : readiness.available;
  const countLabel = kind === "required"
    ? copy(lang, `${connected}/${readiness.total} required ready`, `${connected}/${readiness.total} requeridas listas`)
    : copy(lang, `${connected}/${readiness.total} available`, `${connected}/${readiness.total} disponibles`);
  const countTone = connected === readiness.total ? "ready" : kind === "required" ? "blocked" : "degraded";
  const heading = (
    <div className="moo-source-group-heading">
      <div><span className="moo-overline">{title}</span><strong>{description}</strong></div>
      <span className={`moo-source-group-count ${countTone}`}>{countLabel}</span>
    </div>
  );
  const hasInvalidRecords = readiness.items.some((item) => !item.present || item.duplicate);
  const cards = (
    <>
      {sources.length ? <MooSourceStrip sources={sources} lang={lang} expanded/> : null}
      {hasInvalidRecords ? <p className="moo-source-group-empty">{copy(lang, "One or more expected source-health records are missing or duplicated. Strict readiness remains blocked.", "Faltan o están duplicados uno o más registros esperados de estado de fuente. La preparación estricta permanece bloqueada.")}</p> : null}
    </>
  );

  return collapsible ? (
    <details className={`moo-source-group ${kind}`}>
      <summary>{heading}</summary>
      {cards}
    </details>
  ) : (
    <section className={`moo-source-group ${kind}`} aria-label={title}>
      {heading}
      {cards}
    </section>
  );
}

function strictSurfaceState(readiness: MooReadinessSummary) {
  if (readiness.dominantBlockerCode === "DATA_PENDING") return "loading" as const;
  if (readiness.dominantBlockerCode === "STALE_US_QUOTE") return "stale" as const;
  if (readiness.dominantBlockerCode === "FEED_NOT_ENTITLED") return "error" as const;
  if (readiness.dominantBlockerCode === "NONE") return "ready" as const;
  return "blocked" as const;
}

function strictStateLabel(state: ReturnType<typeof strictSurfaceState>, lang: Language) {
  const labels: Record<ReturnType<typeof strictSurfaceState>, [string, string]> = {
    loading: ["WAITING FOR VERIFIED DATA", "ESPERANDO DATOS VERIFICADOS"],
    stale: ["STALE · DO NOT ACT", "DATOS VENCIDOS · NO ACTUAR"],
    error: ["REQUIRED CONNECTION BLOCKED", "CONEXIÓN REQUERIDA BLOQUEADA"],
    ready: ["STRICT REVIEW STATE", "ESTADO DE REVISIÓN ESTRICTA"],
    blocked: ["BLOCKED · NO TRADE", "BLOQUEADO · NO OPERAR"],
  };
  return copy(lang, ...labels[state]);
}

function blockerLabel(code: MooDominantBlockerCode, lang: Language) {
  const labels: Record<MooDominantBlockerCode, [string, string]> = {
    MARKET_CLOSED: ["Market closed", "Mercado cerrado"],
    TARGET_SESSION_NOT_STARTED: ["Selected session has not started", "La sesión seleccionada todavía no ha comenzado"],
    DATA_PENDING: ["Critical data pending", "Datos críticos pendientes"],
    STALE_US_QUOTE: ["U.S. quote is stale", "La cotización de EE. UU. está vencida"],
    FEED_NOT_ENTITLED: ["Required feed not entitled", "Fuente requerida sin autorización"],
    MODEL_NOT_TRAINED: ["Opening model not trained", "Modelo de apertura no entrenado"],
    LOW_DATA_QUALITY: ["Data quality below the safety gate", "Calidad de datos bajo el límite de seguridad"],
    LOW_CONFIDENCE: ["Direction confidence below the strict threshold", "Confianza direccional bajo el umbral estricto"],
    NO_EDGE: ["Model found no qualified edge", "El modelo no encontró una ventaja calificada"],
    SHORTABILITY_UNCONFIRMED: ["Shortability is unconfirmed", "Disponibilidad para corto sin confirmar"],
    RISK_POLICY_UNCONFIGURED: ["Strict risk policy is not configured", "La política estricta de riesgo no está configurada"],
    NONE: ["No blocker detected", "No se detectó ningún bloqueo"],
  };
  return copy(lang, ...labels[code]);
}

function blockerDetail(code: MooDominantBlockerCode, lang: Language) {
  const details: Record<MooDominantBlockerCode, [string, string]> = {
    MARKET_CLOSED: ["The selected execution window is closed. Review the preserved audit state or choose another valid session.", "La ventana de ejecución seleccionada está cerrada. Revise el estado de auditoría conservado o elija otra sesión válida."],
    TARGET_SESSION_NOT_STARTED: ["Planning context may appear now, but strict inputs cannot qualify before the selected session begins.", "El contexto de planificación puede aparecer ahora, pero las entradas estrictas no pueden calificar antes de que comience la sesión seleccionada."],
    DATA_PENDING: ["The gate is waiting for a point-in-time model input or required source observation. No current data is backfilled into the decision.", "El control espera una entrada puntual del modelo o una observación de una fuente requerida. No se reutilizan datos actuales en la decisión."],
    STALE_US_QUOTE: ["The required U.S. observation is delayed or too old for the strict freshness policy.", "La observación requerida de EE. UU. está retrasada o es demasiado antigua para la política estricta de vigencia."],
    FEED_NOT_ENTITLED: ["A source required now lacks execution-grade entitlement. Research coverage does not satisfy this gate.", "Una fuente requerida ahora no tiene autorización apta para ejecución. La cobertura de investigación no cumple este control."],
    MODEL_NOT_TRAINED: ["No trained, versioned point-in-time opening model is available for this strict decision.", "No hay un modelo de apertura puntual, entrenado y versionado para esta decisión estricta."],
    LOW_DATA_QUALITY: ["The verified feature snapshot does not meet the configured quality threshold.", "La captura verificada de variables no cumple el umbral de calidad configurado."],
    LOW_CONFIDENCE: ["The calibrated directional confidence does not clear the strict decision threshold.", "La confianza direccional calibrada no supera el umbral de decisión estricta."],
    NO_EDGE: ["A calibrated commissioned model found no directional edge after its configured thresholds and costs. NO TRADE is the intended result.", "Un modelo calibrado y habilitado no encontró una ventaja direccional después de sus umbrales y costos configurados. NO OPERAR es el resultado previsto."],
    SHORTABILITY_UNCONFIRMED: ["A short-side decision requires an account-specific locate; indicative asset metadata is not enough.", "Una decisión de corto requiere una localización específica de la cuenta; los metadatos indicativos del activo no son suficientes."],
    RISK_POLICY_UNCONFIGURED: ["Strict ticket risk limits and distinct account labels have not passed the shared risk policy.", "Los límites de riesgo de las órdenes estrictas y las etiquetas de cuenta distintas no han aprobado la política de riesgo compartida."],
    NONE: ["All configured decision gates passed. This surface remains review-only and does not submit an order.", "Todos los controles de decisión configurados se aprobaron. Esta superficie sigue siendo solo para revisión y no envía una orden."],
  };
  return copy(lang, ...details[code]);
}

function commissionLabel(state: MooStrictCommissionState, lang: Language) {
  const labels: Record<MooStrictCommissionState, [string, string]> = {
    NOT_COMMISSIONED: ["STRICT MODEL NOT COMMISSIONED", "MODELO ESTRICTO NO HABILITADO"],
    COMMISSIONED_BLOCKED: ["COMMISSIONED · BLOCKED", "HABILITADO · BLOQUEADO"],
    COMMISSIONED_NO_TRADE: ["COMMISSIONED · NO TRADE", "HABILITADO · NO OPERAR"],
    COMMISSIONED_READY: ["COMMISSIONED · REVIEW READY", "HABILITADO · LISTO PARA REVISIÓN"],
  };
  return copy(lang, ...labels[state]);
}

function stateNotice(state: ReturnType<typeof strictSurfaceState>, lang: Language) {
  if (state === "loading") return copy(lang, "Waiting for a new verified observation. Values stay unavailable until the same-session checks finish.", "Esperando una nueva observación verificada. Los valores permanecen no disponibles hasta que terminen las verificaciones de la misma sesión.");
  if (state === "stale") return copy(lang, "The last required observation is retained for diagnosis but is not eligible for a strict decision.", "La última observación requerida se conserva para diagnóstico, pero no es válida para una decisión estricta.");
  if (state === "error") return copy(lang, "One or more required-now connections are unavailable or not entitled. Optional research feeds cannot replace them.", "Una o más conexiones requeridas ahora no están disponibles o autorizadas. Las fuentes opcionales de investigación no pueden sustituirlas.");
  return null;
}

export function MooDecisionSurface({ snapshot, planningSources, planning, brokerReference, commissioning, lang }: { snapshot: MooDecisionSnapshot; planningSources: MooPlanningSourceList; planning?: MooPlanningInput; brokerReference?: BrokerStatusPayload | null; commissioning?: MooCommissioningEvidence | null; lang: Language }) {
  const [clock, setClock] = useState(() => ({ snapshotId: snapshot.snapshotId, elapsedMs: 0 }));
  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => setClock({
      snapshotId: snapshot.snapshotId,
      elapsedMs: Math.max(0, performance.now() - startedAt),
    }), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot.snapshotId]);
  const elapsedMs = clock.snapshotId === snapshot.snapshotId ? clock.elapsedMs : 0;
  const now = snapshot.generatedAt + elapsedMs;
  const deadlines = useMemo(() => snapshot.deadlines.slice().sort((a, b) => a.at - b.at), [snapshot.deadlines]);
  const predicted = cents(snapshot.predictedOfficialOpenCents) ?? valueState(snapshot.predictedOpenState, lang);
  const decisionTone = snapshot.decision === "LONG_FAVORED" ? "long" : snapshot.decision === "SHORT_FAVORED" ? "short" : "no-trade";
  const researchPreview = planningSources.researchPreview ?? {
    low: null,
    median: null,
    high: null,
    lean: "UNAVAILABLE" as const,
    directionBps: null,
    computedAt: null,
    reason: copy(lang, "Selected-session research is loading.", "La investigación de la sesión seleccionada está cargando."),
  };
  const planningInput = planning ?? planningSources.planningInput;
  const diagnosticOnly = snapshot.warnings.includes("LAST_GOOD_SERVER_AUDIT_ONLY");
  const currentBrokerReference = diagnosticOnly ? null : brokerReference;
  const readiness = summarizeMooReadiness(snapshot, currentBrokerReference ?? undefined);
  const requiredSourceIds = new Set(readiness.sourceGroups.requiredNow.items.map((source) => source.id));
  const optionalSourceIds = new Set(readiness.sourceGroups.optionalResearch.items.map((source) => source.id));
  const monitoringSourceIds = new Set(readiness.sourceGroups.postFreezeMonitoring.items.map((source) => source.id));
  const requiredSources = snapshot.sources.filter((source) => requiredSourceIds.has(source.id));
  const optionalSources = snapshot.sources.filter((source) => optionalSourceIds.has(source.id));
  const monitoringSources = snapshot.sources.filter((source) => monitoringSourceIds.has(source.id));
  const surfaceState = strictSurfaceState(readiness);
  const notice = stateNotice(surfaceState, lang);
  const strictCommissioned = commissioning != null && commissioning.executionMode !== "NOT_COMMISSIONED";
  const hasFrozenArtifact = snapshot.frozenAt != null && commissioning?.artifactValidated === true;
  const decisionFreezeAt = deadlines.find((deadline) => deadline.label === "DECISION_FREEZE")?.at ?? snapshot.actionCutoffAt;
  const modelReady = strictCommissioned && commissioning?.modelPromoted === true && Boolean(snapshot.modelVersion?.trim() && snapshot.featureSchemaVersion?.trim());
  const featureSnapshotReady = hasFrozenArtifact && Boolean(snapshot.featureSnapshotId?.trim());
  const dataQualityReady = snapshot.dataQualityScore != null;
  const favoredTicket = snapshot.decision === "LONG_FAVORED"
    ? snapshot.longTicket
    : snapshot.decision === "SHORT_FAVORED"
      ? snapshot.shortTicket
      : null;
  const riskReady = strictCommissioned && hasFrozenArtifact && Boolean(commissioning?.riskPolicyVersion?.trim()) && favoredTicket?.actionable === true;
  const commissioningItems = [
    {
      id: "execution-feed",
      state: readiness.requiredReady === readiness.requiredTotal && readiness.requiredTotal > 0 ? "ready" : "blocked",
      title: copy(lang, "Execution market data", "Datos de mercado de ejecución"),
      value: `${readiness.requiredReady}/${readiness.requiredTotal} ${copy(lang, "required ready", "requeridas listas")}`,
      detail: readiness.requiredReady === readiness.requiredTotal && readiness.requiredTotal > 0
        ? copy(lang, "The active strict policy has qualified, current inputs.", "La política estricta activa tiene entradas calificadas y vigentes.")
        : copy(lang, "A licensed consolidated U.S. feed must be received and time-qualified by the server.", "El servidor debe recibir y validar temporalmente una fuente consolidada de EE. UU. con licencia."),
    },
    {
      id: "model",
      state: modelReady ? "ready" : "blocked",
      title: copy(lang, "Promoted point-in-time model", "Modelo puntual promovido"),
      value: modelReady ? snapshot.modelVersion! : copy(lang, "Not commissioned", "No habilitado"),
      detail: modelReady
        ? `${copy(lang, "Server-reported model / feature schema", "Modelo / esquema de variables informado por el servidor")}: ${snapshot.featureSchemaVersion}. ${copy(lang, "Artifact validation remains authoritative.", "La validación del artefacto sigue siendo la autoridad.")}`
        : copy(lang, "Requires walk-forward evidence, costs, baselines, calibration and an approved promotion record.", "Requiere evidencia progresiva, costos, referencias, calibración y un registro de promoción aprobado."),
    },
    {
      id: "feature-snapshot",
      state: featureSnapshotReady && dataQualityReady ? "ready" : "blocked",
      title: copy(lang, "Feature snapshot & quality", "Captura de variables y calidad"),
      value: featureSnapshotReady ? snapshot.featureSnapshotId! : copy(lang, "No immutable snapshot", "Sin captura inmutable"),
      detail: dataQualityReady
        ? `${copy(lang, "Qualified data score", "Puntuación de datos calificados")}: ${snapshot.dataQualityScore}/100`
        : copy(lang, "Created only from same-session values available at or before the decision cutoff.", "Se crea solo con valores de la misma sesión disponibles antes o en el límite de decisión."),
    },
    {
      id: "freeze",
      state: hasFrozenArtifact ? "ready" : now < decisionFreezeAt ? "waiting" : "blocked",
      title: copy(lang, "Immutable decision freeze", "Cierre de decisión inmutable"),
      value: hasFrozenArtifact
        ? etDateTime(snapshot.frozenAt, lang)
        : now < decisionFreezeAt
          ? copy(lang, "Scheduled", "Programado")
          : copy(lang, "Missed or unavailable", "Omitido o no disponible"),
      detail: hasFrozenArtifact
        ? copy(lang, "Post-freeze monitoring cannot rewrite this artifact.", "El monitoreo posterior no puede reescribir este artefacto.")
        : `${copy(lang, "Cutoff", "Límite")}: ${etDateTime(decisionFreezeAt, lang)}`,
    },
    {
      id: "risk",
      state: riskReady ? "ready" : "blocked",
      title: copy(lang, "Strict risk policy", "Política estricta de riesgo"),
      value: riskReady ? copy(lang, "Favored ticket complete", "Orden favorecida completa") : copy(lang, "Not configured", "No configurada"),
      detail: riskReady
        ? copy(lang, "Size, stop, reserve, maximum loss and time stop are bound to the frozen artifact.", "Tamaño, stop, reserva, pérdida máxima y límite de tiempo están vinculados al artefacto congelado.")
        : copy(lang, "Paper-planner values are browser-local and can never populate this strict policy.", "Los valores del planificador de prueba son locales al navegador y nunca pueden completar esta política estricta."),
    },
    {
      id: "broker",
      state: snapshot.decision !== "SHORT_FAVORED" ? "waiting" : readiness.broker.strictLocateReady ? "ready" : "blocked",
      title: copy(lang, "Broker & locate controls", "Controles de bróker y localización"),
      value: snapshot.decision !== "SHORT_FAVORED"
        ? snapshot.decision === "LONG_FAVORED"
          ? copy(lang, "Short locate not applicable to LONG", "La localización corta no aplica a LARGO")
          : copy(lang, "Activates only for a SHORT decision", "Se activa solo para una decisión CORTA")
        : readiness.broker.strictLocateReady
          ? copy(lang, "Account-specific locate proof present", "Prueba de localización específica de la cuenta presente")
          : copy(lang, "Short locate not proven", "Localización para corto no comprobada"),
      detail: copy(lang, "Asset metadata is only indicative; a short ticket needs fresh account-, symbol- and quantity-specific proof.", "Los metadatos del activo son solo indicativos; una orden corta necesita prueba reciente específica de cuenta, símbolo y cantidad."),
    },
  ] as const;

  return (
    <section className={`moo-decision-surface panel ${decisionTone} state-${surfaceState}`} aria-labelledby="moo-decision-title" aria-busy={surfaceState === "loading"}>
      <header className="moo-decision-head">
        <div>
          <span className="moo-overline">NVDA · {copy(lang, "MOO OPENING DECISION", "DECISIÓN DE APERTURA MOO")}</span>
          <h2 id="moo-decision-title">{targetDate(snapshot.targetSession, lang)}</h2>
          <p>{copy(lang, "Nasdaq Opening Cross · research and paper use only", "Cruce de Apertura Nasdaq · solo investigación y prueba")}</p>
        </div>
        <div className="moo-lifecycle-stack">
          <strong>{lifecycleLabel(snapshot, lang)}</strong>
          <span>{copy(lang, "Snapshot", "Captura")} {snapshot.snapshotId}</span>
          <time dateTime={isoDateTime(snapshot.generatedAt)}>{copy(lang, "Evaluated", "Evaluada")} {etDateTime(snapshot.generatedAt, lang)}</time>
        </div>
      </header>

      <section className={`moo-gate-command ${surfaceState}`} role="status" aria-live="polite" aria-atomic="true" aria-label={copy(lang, "Strict MOO gate status", "Estado del control MOO Estricto")}>
        <div className="moo-gate-decision">
          <span>{copy(lang, "STRICT GATE STATUS", "ESTADO DEL CONTROL ESTRICTO")}</span>
          <strong>{decisionLabel(snapshot, lang)}</strong>
          <b>{strictStateLabel(surfaceState, lang)}</b>
        </div>
        <div className="moo-gate-blocker">
          <span>{copy(lang, "DOMINANT BLOCKER", "BLOQUEO PRINCIPAL")}</span>
          <strong>{blockerLabel(readiness.dominantBlockerCode, lang)}</strong>
          <p>{blockerDetail(readiness.dominantBlockerCode, lang)}</p>
        </div>
        <div className="moo-gate-required">
          <span>{copy(lang, "REQUIRED NOW", "REQUERIDAS AHORA")}</span>
          <strong>{readiness.requiredReady}/{readiness.requiredTotal}</strong>
          <p>{copy(lang, "Only required-now sources count toward this denominator.", "Solo las fuentes requeridas ahora cuentan en este denominador.")}</p>
        </div>
        <div className="moo-gate-artifact">
          <span>{copy(lang, "STRICT ARTIFACT", "ARTEFACTO ESTRICTO")}</span>
          <strong>{hasFrozenArtifact ? copy(lang, "VALIDATED", "VALIDADO") : copy(lang, "NOT VALIDATED", "NO VALIDADO")}</strong>
          <p>{commissionLabel(readiness.strictCommissionState, lang)} · {readiness.connectionMode === "REST_POLLING" ? copy(lang, "REST polling", "sondeo REST") : readiness.connectionMode}</p>
          <small>{hasFrozenArtifact ? etDateTime(snapshot.frozenAt, lang) : copy(lang, "No server-validated immutable strict artifact is available.", "No hay un artefacto estricto inmutable validado por el servidor.")}</small>
        </div>
      </section>

      {notice ? <div className={`moo-state-notice ${surfaceState}`} role={surfaceState === "loading" ? "status" : "alert"}>{notice}</div> : null}

      <section className={`moo-research-preview ${researchPreview.lean.toLowerCase()}`} aria-label={copy(lang, "Selected-session research preview", "Vista previa de investigación de la sesión seleccionada")}>
        <div className="moo-preview-heading">
          <span>{copy(lang, "SELECTED-SESSION RESEARCH PREVIEW · NON-ACTIONABLE", "VISTA PREVIA DE INVESTIGACIÓN · NO OPERABLE")}</span>
          <time dateTime={isoDateTime(researchPreview.computedAt)}>{copy(lang, "Computed", "Calculada")}: {etDateTime(researchPreview.computedAt, lang)}</time>
        </div>
        <div className="moo-preview-grid">
          <div className="moo-preview-range"><span>{copy(lang, "Expected opening range", "Rango de apertura esperado")}</span><strong>{money(researchPreview.low)}–{money(researchPreview.high)}</strong></div>
          <div className="moo-preview-central"><span>{copy(lang, "Central estimate", "Estimación central")}</span><strong>{money(researchPreview.median)}</strong></div>
          <div className="moo-preview-lean"><span>{copy(lang, "Research lean", "Sesgo de investigación")}</span><strong>{researchPreview.lean === "LONG_LEAN" ? copy(lang, "LONG LEAN", "SESGO LARGO") : researchPreview.lean === "SHORT_LEAN" ? copy(lang, "SHORT LEAN", "SESGO CORTO") : researchPreview.lean === "NO_EDGE" ? copy(lang, "NO EDGE", "SIN VENTAJA") : copy(lang, "PENDING", "PENDIENTE")}</strong><small>{researchPreview.directionBps == null ? copy(lang, "No validated signed shift", "Sin cambio firmado validado") : `${researchPreview.directionBps >= 0 ? "+" : ""}${researchPreview.directionBps.toFixed(1)} ${copy(lang, "bp signed shift", "pb de cambio con signo")}`}</small></div>
        </div>
        <p>{researchPreview.reason}</p>
      </section>

      <div className="moo-primary-grid">
        <div className="moo-open-price">
          <span>{copy(lang, "Predicted Official Open", "Apertura Oficial Predicha")}</span>
          <strong>{predicted}</strong>
          <small>{copy(lang, "One point estimate · not a guaranteed fill", "Estimación puntual · ejecución no garantizada")}</small>
        </div>
        <div className={`moo-primary-decision ${decisionTone}`}>
          <span>{copy(lang, "Decision", "Decisión")}</span>
          <strong>{decisionLabel(snapshot, lang)}</strong>
          <p>{blockerLabel(readiness.dominantBlockerCode, lang)}</p>
          <small>{snapshot.confidencePct == null ? copy(lang, "Confidence unavailable · model uncalibrated", "Confianza no disponible · modelo sin calibrar") : `${copy(lang, "Calibrated confidence", "Confianza calibrada")} ${snapshot.confidencePct.toFixed(0)}%`}</small>
        </div>
        <div className="moo-deadlines" aria-label={copy(lang, "MOO deadlines", "Plazos MOO")}>
          {deadlines.map((deadline) => (
            <div className={deadline.passed || deadline.at <= now ? "passed" : "active"} key={deadline.label}>
              <span>{deadlineCopy(deadline.label, lang)}</span>
              <strong aria-hidden="true">{formatRemaining(deadline, now, lang)}</strong>
              <time dateTime={new Date(deadline.at).toISOString()}>{etDateTime(deadline.at, lang)}</time>
            </div>
          ))}
        </div>
      </div>

      <div className="moo-audit-strip">
        <span><b>{copy(lang, "Freeze", "Cierre")}</b>{snapshot.frozenAt == null ? copy(lang, "Not frozen", "No congelada") : etDateTime(snapshot.frozenAt, lang)}</span>
        <span><b>{copy(lang, "Model", "Modelo")}</b>{snapshot.modelVersion ?? copy(lang, "Not trained", "No entrenado")}</span>
        <span><b>{copy(lang, "Feature snapshot", "Captura de variables")}</b>{snapshot.featureSnapshotId ?? copy(lang, "Not available", "No disponible")}</span>
        <span><b>{copy(lang, "Data quality", "Calidad de datos")}</b>{snapshot.dataQualityScore == null ? copy(lang, "Unavailable", "No disponible") : `${snapshot.dataQualityScore}/100`}</span>
        <span><b>{copy(lang, "Third rule", "Regla de tercios")}</b>{snapshot.thirdPercentBasisPoints === 3300 ? "0.33" : "1/3"} · ROUND_HALF_UP · +$0.01</span>
        <span><b>{copy(lang, "TP cushion", "Margen de objetivo")}</b>{cents(snapshot.takeProfitCushionCents)}</span>
      </div>

      <section className="moo-commissioning" aria-labelledby="moo-commissioning-title">
        <div className="moo-commissioning-head">
          <div><span className="moo-overline">{copy(lang, "WHY VALUES ARE PENDING", "POR QUÉ HAY VALORES PENDIENTES")}</span><strong id="moo-commissioning-title">{copy(lang, "Strict commissioning path", "Ruta de habilitación estricta")}</strong></div>
          <p>{copy(lang, "Every empty execution field maps to an explicit prerequisite. The gate displays the latest valid state, but it never invents a price, entitlement, model result or broker guarantee.", "Cada campo de ejecución vacío corresponde a un requisito explícito. El control muestra el último estado válido, pero nunca inventa un precio, autorización, resultado del modelo ni garantía del bróker.")}</p>
        </div>
        <div className="moo-commissioning-grid">
          {commissioningItems.map((item) => (
            <article className={item.state} key={item.id}>
              <div><i aria-hidden="true"/><span>{item.state === "ready" ? copy(lang, "READY", "LISTO") : item.state === "waiting" ? copy(lang, "LIFECYCLE", "CICLO") : copy(lang, "REQUIRED", "REQUERIDO")}</span></div>
              <h3>{item.title}</h3>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {snapshot.lifecycle === "CROSS_COMPLETE" ? (
        <div className="moo-cross-result">
          <div><span>{hasFrozenArtifact ? copy(lang, "Frozen prediction", "Predicción congelada") : copy(lang, "Strict prediction", "Predicción estricta")}</span><strong>{predicted}</strong></div>
          <div><span>{copy(lang, "Actual Nasdaq Official Open", "Apertura Oficial Nasdaq Real")}</span><strong>{cents(snapshot.actualOfficialOpenCents) ?? copy(lang, "Pending", "Pendiente")}</strong></div>
          <div><span>{copy(lang, "Prediction error", "Error de predicción")}</span><strong>{cents(snapshot.predictionErrorCents) ?? copy(lang, "Pending", "Pendiente")}</strong></div>
        </div>
      ) : null}

      <section className="moo-entitlement-stack" aria-labelledby="moo-entitlements-title">
        <div className="moo-health-head">
          <div><span className="moo-overline">{copy(lang, "SOURCE ENTITLEMENTS", "AUTORIZACIONES DE FUENTE")}</span><strong id="moo-entitlements-title">{copy(lang, "Required, optional and monitoring connections", "Conexiones requeridas, opcionales y de monitoreo")}</strong></div>
          <p>{copy(lang, "Only Required now sources affect the readiness count. Optional research and post-freeze monitoring remain visible but cannot silently become execution gates.", "Solo las fuentes Requeridas ahora afectan el conteo de preparación. La investigación opcional y el monitoreo posterior al cierre permanecen visibles, pero no pueden convertirse silenciosamente en controles de ejecución.")}</p>
        </div>
        <MooSourceGroup sources={requiredSources} readiness={readiness.sourceGroups.requiredNow} lang={lang} kind="required" title={copy(lang, "REQUIRED NOW", "REQUERIDAS AHORA")} description={copy(lang, "Execution-grade inputs in the active strict policy", "Entradas aptas para ejecución en la política estricta activa")}/>
        <MooSourceGroup sources={optionalSources} readiness={readiness.sourceGroups.optionalResearch} lang={lang} kind="optional" title={copy(lang, "OPTIONAL RESEARCH", "INVESTIGACIÓN OPCIONAL")} description={copy(lang, "Context only · excluded from the required denominator", "Solo contexto · excluido del denominador requerido")} collapsible/>
        <MooSourceGroup sources={monitoringSources} readiness={readiness.sourceGroups.postFreezeMonitoring} lang={lang} kind="monitoring" title={copy(lang, "POST-FREEZE MONITORING", "MONITOREO POSTERIOR AL CIERRE")} description={copy(lang, "Visible after the cutoff · cannot rewrite a strict artifact", "Visible después del límite · no puede reescribir un artefacto estricto")} collapsible/>
      </section>

      <div className="moo-health-head moo-strict-ticket-head">
        <div><span className="moo-overline">{hasFrozenArtifact ? copy(lang, "STRICT FROZEN TICKETS", "ÓRDENES ESTRICTAS CONGELADAS") : copy(lang, "STRICT TICKET READINESS", "PREPARACIÓN DE ÓRDENES ESTRICTAS")}</span><strong>{copy(lang, "Execution fields remain fail-closed", "Los campos de ejecución permanecen bloqueados por seguridad")}</strong></div>
        <p>{hasFrozenArtifact ? copy(lang, "These fields come from the immutable strict artifact and remain review-only here.", "Estos campos provienen del artefacto estricto inmutable y aquí siguen siendo solo para revisión.") : copy(lang, "No frozen strict ticket is published. Paper simulation below never replaces a trained point-in-time model, entitlement or broker fill.", "No se publica una orden estricta congelada. La simulación de prueba de abajo nunca sustituye un modelo puntual entrenado, una autorización ni una ejecución del bróker.")}</p>
      </div>
      <div className="moo-ticket-grid moo-strict-ticket-grid">
        <TicketCard ticket={snapshot.longTicket} snapshot={snapshot} lang={lang}/>
        <TicketCard ticket={snapshot.shortTicket} snapshot={snapshot} lang={lang}/>
      </div>

      <PaperPlanningPanel key={planningInput?.targetSession ?? snapshot.targetSession} snapshot={snapshot} researchPreview={researchPreview} planning={planningInput} initialBrokerStatus={currentBrokerReference} brokerStatusUnavailable={diagnosticOnly} nowMs={now} lang={lang}/>

      <section className="moo-planning-band" aria-labelledby="moo-planning-title">
        <div className="moo-health-head">
          <div><span className="moo-overline">{copy(lang, "PLANNING / RESEARCH SOURCES", "FUENTES DE PLANIFICACIÓN / INVESTIGACIÓN")}</span><strong id="moo-planning-title">{copy(lang, "Available context for the selected session", "Contexto disponible para la sesión seleccionada")}</strong></div>
          <p>{copy(lang, "These rows may inform a non-actionable preview. They do not satisfy strict execution entitlements.", "Estas filas pueden informar una vista previa no operable. No cumplen las autorizaciones estrictas de ejecución.")}</p>
        </div>
        <MooPlanningSourceStrip sources={planningSources} lang={lang}/>
      </section>

      {snapshot.warnings.length ? <div className="moo-warnings">{snapshot.warnings.map((warning) => <p key={warning}>{warningLabel(warning, lang)}</p>)}</div> : null}
    </section>
  );
}

export function MooDataHealthPanel({ snapshot, brokerReference, lang }: { snapshot: MooDecisionSnapshot; brokerReference?: BrokerStatusPayload | null; lang: Language }) {
  const diagnosticOnly = snapshot.warnings.includes("LAST_GOOD_SERVER_AUDIT_ONLY");
  const readiness = summarizeMooReadiness(snapshot, diagnosticOnly ? undefined : brokerReference ?? undefined);
  const requiredSourceIds = new Set(readiness.sourceGroups.requiredNow.items.map((source) => source.id));
  const optionalSourceIds = new Set(readiness.sourceGroups.optionalResearch.items.map((source) => source.id));
  const monitoringSourceIds = new Set(readiness.sourceGroups.postFreezeMonitoring.items.map((source) => source.id));
  const requiredSources = snapshot.sources.filter((source) => requiredSourceIds.has(source.id));
  const optionalSources = snapshot.sources.filter((source) => optionalSourceIds.has(source.id));
  const monitoringSources = snapshot.sources.filter((source) => monitoringSourceIds.has(source.id));
  const surfaceState = strictSurfaceState(readiness);
  const notice = stateNotice(surfaceState, lang);
  return (
    <section className="moo-data-health-view" aria-labelledby="strict-moo-health-title">
      <div className="library-hero">
        <div>
          <span className="moo-overline">{copy(lang, "STRICT EXECUTION GATE", "CONTROL DE EJECUCIÓN ESTRICTO")}</span>
          <h2 id="strict-moo-health-title">{copy(lang, "Strict MOO execution entitlements", "Autorizaciones de ejecución MOO estrictas")}</h2>
          <p>{copy(lang, "These institutional requirements are separate from the working Full Dashboard research APIs above. A blocked source here does not mean the research dashboard is offline.", "Estos requisitos institucionales son independientes de las APIs de investigación activas del Panel Completo. Una fuente bloqueada aquí no significa que el panel de investigación esté fuera de servicio.")}</p>
        </div>
        <div className={`moo-health-summary ${surfaceState}`}><strong>{readiness.requiredReady}/{readiness.requiredTotal}</strong><span>{copy(lang, "required-now feeds ready", "fuentes requeridas ahora listas")}</span></div>
      </div>
      <article className={`panel moo-health-panel state-${surfaceState}`} aria-busy={surfaceState === "loading"}>
        <div className="moo-health-status" role="status" aria-live="polite" aria-atomic="true"><strong>{decisionLabel(snapshot, lang)}</strong><span>{strictStateLabel(surfaceState, lang)} · {blockerLabel(readiness.dominantBlockerCode, lang)}</span><time dateTime={isoDateTime(snapshot.generatedAt)}>{copy(lang, "Evaluated", "Evaluada")}: {etDateTime(snapshot.generatedAt, lang)}</time></div>
        {notice ? <div className={`moo-state-notice ${surfaceState}`} role={surfaceState === "loading" ? "status" : "alert"}>{notice}</div> : null}
        <div className="moo-health-source-groups">
          <MooSourceGroup sources={requiredSources} readiness={readiness.sourceGroups.requiredNow} lang={lang} kind="required" title={copy(lang, "REQUIRED NOW", "REQUERIDAS AHORA")} description={copy(lang, "Only these sources affect strict readiness", "Solo estas fuentes afectan la preparación estricta")}/>
          <MooSourceGroup sources={optionalSources} readiness={readiness.sourceGroups.optionalResearch} lang={lang} kind="optional" title={copy(lang, "OPTIONAL RESEARCH", "INVESTIGACIÓN OPCIONAL")} description={copy(lang, "Visible context · not an execution gate", "Contexto visible · no es un control de ejecución")} collapsible/>
          <MooSourceGroup sources={monitoringSources} readiness={readiness.sourceGroups.postFreezeMonitoring} lang={lang} kind="monitoring" title={copy(lang, "POST-FREEZE MONITORING", "MONITOREO POSTERIOR AL CIERRE")} description={copy(lang, "Cannot rewrite the strict artifact", "No puede reescribir el artefacto estricto")} collapsible/>
        </div>
      </article>
    </section>
  );
}
