"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  MooDecisionSnapshot,
  MooSourceHealth,
  MooTicket,
  MooValueState,
} from "../moo-contract";
import type { MooSystemStatus } from "../moo-system-status";
import { StrictMooJourney, type StrictMooCommissioningEvidence } from "./StrictMooJourney";
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
  type MooReadinessGroup,
  type MooReadinessSummary,
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

export type MooCommissioningEvidence = StrictMooCommissioningEvidence;

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
  if (source.id === "US" && source.coverage === "CONSOLIDATED_SIP") {
    return "SIP consolidado de EE. UU.";
  }
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

export function MooDecisionSurface({ snapshot, planningSources, planning, brokerReference, commissioning, transport, statusEvaluatedAt, lang }: { snapshot: MooDecisionSnapshot; planningSources: MooPlanningSourceList; planning?: MooPlanningInput; brokerReference?: BrokerStatusPayload | null; commissioning?: MooCommissioningEvidence | null; transport?: MooSystemStatus["transport"] | null; statusEvaluatedAt?: number | null; lang: Language }) {
  const evaluatedAt = statusEvaluatedAt ?? commissioning?.statusEvaluatedAt;
  const clockAnchor = evaluatedAt != null && Number.isFinite(evaluatedAt)
    ? evaluatedAt
    : snapshot.generatedAt;
  const clockKey = `${snapshot.snapshotId}:${clockAnchor}`;
  const [clock, setClock] = useState(() => ({ key: clockKey, elapsedMs: 0 }));
  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => setClock({
      key: clockKey,
      elapsedMs: Math.max(0, performance.now() - startedAt),
    }), 1000);
    return () => window.clearInterval(timer);
  }, [clockKey]);
  const elapsedMs = clock.key === clockKey ? clock.elapsedMs : 0;
  const now = clockAnchor + elapsedMs;
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
  const hasFrozenArtifact = snapshot.frozenAt != null && commissioning?.artifactValidated === true;

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
          <time dateTime={isoDateTime(snapshot.generatedAt)}>{copy(lang, "Snapshot generated", "Captura generada")} {etDateTime(snapshot.generatedAt, lang)}</time>
        </div>
      </header>

      <StrictMooJourney
        snapshot={snapshot}
        transport={transport}
        commissioning={commissioning}
        statusUnavailable={diagnosticOnly}
        nowMs={now}
        evaluatedAt={clockAnchor}
        lang={lang}
      />

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

      <details className="strict-audit-details">
        <summary>
          <span><span className="moo-overline">{copy(lang, "DETAILED STRICT AUDIT", "AUDITORÍA ESTRICTA DETALLADA")}</span><strong>{copy(lang, "Source entitlements and strict ticket fields", "Autorizaciones de fuente y campos de orden estricta")}</strong></span>
          <small>{copy(lang, "Expand review evidence", "Ampliar evidencia de revisión")}</small>
        </summary>
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
      </details>

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

export function MooDataHealthPanel({ snapshot, brokerReference, commissioning, transport, statusEvaluatedAt, lang }: { snapshot: MooDecisionSnapshot; brokerReference?: BrokerStatusPayload | null; commissioning?: MooCommissioningEvidence | null; transport?: MooSystemStatus["transport"] | null; statusEvaluatedAt?: number | null; lang: Language }) {
  const diagnosticOnly = snapshot.warnings.includes("LAST_GOOD_SERVER_AUDIT_ONLY");
  const readiness = summarizeMooReadiness(snapshot, diagnosticOnly ? undefined : brokerReference ?? undefined);
  const requiredSourceIds = new Set(readiness.sourceGroups.requiredNow.items.map((source) => source.id));
  const optionalSourceIds = new Set(readiness.sourceGroups.optionalResearch.items.map((source) => source.id));
  const monitoringSourceIds = new Set(readiness.sourceGroups.postFreezeMonitoring.items.map((source) => source.id));
  const requiredSources = snapshot.sources.filter((source) => requiredSourceIds.has(source.id));
  const optionalSources = snapshot.sources.filter((source) => optionalSourceIds.has(source.id));
  const monitoringSources = snapshot.sources.filter((source) => monitoringSourceIds.has(source.id));
  const surfaceState = strictSurfaceState(readiness);
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
        <StrictMooJourney snapshot={snapshot} transport={transport} commissioning={commissioning} statusUnavailable={diagnosticOnly} nowMs={statusEvaluatedAt ?? commissioning?.statusEvaluatedAt ?? snapshot.generatedAt} evaluatedAt={statusEvaluatedAt ?? commissioning?.statusEvaluatedAt ?? snapshot.generatedAt} lang={lang}/>
        {snapshot.warnings.length ? <div className="moo-warnings" role="alert">{snapshot.warnings.map((warning) => <p key={warning}>{warningLabel(warning, lang)}</p>)}</div> : null}
        <div className="moo-health-source-groups">
          <MooSourceGroup sources={requiredSources} readiness={readiness.sourceGroups.requiredNow} lang={lang} kind="required" title={copy(lang, "REQUIRED NOW", "REQUERIDAS AHORA")} description={copy(lang, "Only these sources affect strict readiness", "Solo estas fuentes afectan la preparación estricta")}/>
          <MooSourceGroup sources={optionalSources} readiness={readiness.sourceGroups.optionalResearch} lang={lang} kind="optional" title={copy(lang, "OPTIONAL RESEARCH", "INVESTIGACIÓN OPCIONAL")} description={copy(lang, "Visible context · not an execution gate", "Contexto visible · no es un control de ejecución")} collapsible/>
          <MooSourceGroup sources={monitoringSources} readiness={readiness.sourceGroups.postFreezeMonitoring} lang={lang} kind="monitoring" title={copy(lang, "POST-FREEZE MONITORING", "MONITOREO POSTERIOR AL CIERRE")} description={copy(lang, "Cannot rewrite the strict artifact", "No puede reescribir el artefacto estricto")} collapsible/>
        </div>
      </article>
    </section>
  );
}
