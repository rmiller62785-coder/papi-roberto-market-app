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
  previousHighCents: number | null;
  previousLowCents: number | null;
  premarketHighCents: number | null;
  premarketLowCents: number | null;
  computedAt: number | null;
  marketCheckedAt: number | null;
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
type BrokerStatusPayload = {
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

const emptySideConfig = (): PaperSideConfig => ({
  quantityMode: "AUTO_RISK",
  stopOffset: "",
  riskBudget: "",
  slippageAllowance: "",
  maxShares: "",
  manualQuantity: "",
  accountLabel: "",
  reserve: "",
  timeStop: "",
});

const emptyPaperConfig = (): PaperPlanningConfig => ({
  preference: "RESEARCH",
  long: emptySideConfig(),
  short: emptySideConfig(),
});

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
    const stored = window.sessionStorage.getItem(storageKey);
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
    PENDING: ["Pending", "Pendiente"],
    UNAVAILABLE: ["Unavailable", "No disponible"],
    INSUFFICIENT_BARS: ["Insufficient bars", "Velas insuficientes"],
  };
  return copy(lang, ...values[state]);
}

function blockReason(snapshot: MooDecisionSnapshot, lang: Language) {
  const values: Partial<Record<MooDecisionSnapshot["blockReason"], [string, string]>> = {
    MARKET_CLOSED: ["Market closed", "Mercado cerrado"],
    TARGET_SESSION_NOT_STARTED: ["Selected session has not started", "La sesión seleccionada todavía no ha comenzado"],
    DATA_PENDING: ["Critical data pending", "Datos críticos pendientes"],
    STALE_US_QUOTE: ["U.S. quote is stale", "La cotización de EE. UU. está vencida"],
    FEED_NOT_ENTITLED: ["Required feed not entitled", "Fuente requerida sin autorización"],
    MODEL_NOT_TRAINED: ["Opening model not trained", "Modelo de apertura no entrenado"],
    LOW_DATA_QUALITY: ["Data quality below the safety gate", "Calidad de datos bajo el límite de seguridad"],
    LOW_CONFIDENCE: ["Direction confidence below 60%", "Confianza direccional menor de 60 %"],
    SHORTABILITY_UNCONFIRMED: ["Shortability is unconfirmed", "Disponibilidad para corto sin confirmar"],
    NONE: ["All decision gates passed", "Todos los controles aprobados"],
  };
  return values[snapshot.blockReason]
    ? copy(lang, ...values[snapshot.blockReason]!)
    : snapshot.blockReason.replaceAll("_", " ");
}

function lifecycleLabel(snapshot: MooDecisionSnapshot, lang: Language) {
  const values: Partial<Record<MooDecisionSnapshot["lifecycle"], [string, string]>> = {
    MARKET_CLOSED: ["MARKET CLOSED", "MERCADO CERRADO"],
    FUTURE_SESSION: ["FUTURE SESSION · PLANNING", "SESIÓN FUTURA · PLANIFICACIÓN"],
    PREPARING: ["PREPARING", "PREPARANDO"],
    READY: ["LOCKABLE", "LISTO PARA BLOQUEAR"],
    FROZEN: ["MOO LOCKED · MONITORING ONLY", "MOO BLOQUEADA · SOLO MONITOREO"],
    LATE_LOCKED: ["LATE ORDER WINDOW · LOCKED IF ENTERED", "VENTANA TARDÍA · BLOQUEADA AL ENTRAR"],
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
        <div><dt>{copy(lang, "Target offset", "Distancia al objetivo")}</dt><dd>{cents(ticket.targetMoveCents) ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Stop offset", "Distancia al stop")}</dt><dd>{cents(ticket.stopOffsetCents) ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Quantity", "Cantidad")}</dt><dd>{ticket.quantity ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Account", "Cuenta")}</dt><dd>{ticket.accountLabel ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Reserve", "Reserva")}</dt><dd>{cents(ticket.reserveCents) ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Maximum loss", "Pérdida máxima")}</dt><dd>{cents(ticket.maximumLossCents) ?? unconfigured}</dd></div>
        <div><dt>{copy(lang, "Time stop", "Stop por tiempo")}</dt><dd>{ticket.timeStop ?? unconfigured}</dd></div>
        {isShort ? <div className="moo-shortability"><dt>{copy(lang, "Shortability", "Disponibilidad para corto")}</dt><dd>{shortability}</dd></div> : null}
      </dl>
      <p className={`moo-ticket-state ${ticket.actionable ? "ready" : "blocked"}`}>
        {ticket.actionable ? copy(lang, "Paper ticket ready for review", "Orden de prueba lista para revisión") : copy(lang, "Preview only · not actionable", "Solo vista previa · no operable")}
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
      <p id={`${id}-help`}>{copy(lang, "Numeric values are stored only in this browser session. Never enter an API key or account number.", "Los valores numéricos se guardan solo en esta sesión del navegador. Nunca ingrese una clave API ni un número de cuenta.")}</p>
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
        {isShort ? <div className={`moo-paper-shortability ${shortability.ready ? "ready" : "blocked"}`}><dt>{copy(lang, "Broker shortability", "Disponibilidad del bróker para corto")}</dt><dd>{shortability.label}</dd><small>{shortability.detail}</small></div> : null}
      </dl>
      <p className="moo-paper-ticket-state"><b>{configured ? copy(lang, "PAPER INPUTS COMPLETE", "ENTRADAS DE PRUEBA COMPLETAS") : copy(lang, "PAPER INPUTS INCOMPLETE", "ENTRADAS DE PRUEBA INCOMPLETAS")}</b><span>{copy(lang, "Preview only · never submits an order", "Solo vista previa · nunca envía una orden")}</span></p>
    </article>
  );
}

function PaperPlanningPanel({
  snapshot,
  researchPreview,
  planning,
  lang,
}: {
  snapshot: MooDecisionSnapshot;
  researchPreview: MooResearchPreview;
  planning?: MooPlanningInput;
  lang: Language;
}) {
  const targetSession = planning?.targetSession ?? snapshot.targetSession;
  const storageKey = `aperture-moo-paper-planning:${targetSession}`;
  const [config, setConfig] = useState<PaperPlanningConfig>(() => storedPaperConfig(storageKey));
  const [brokerStatus, setBrokerStatus] = useState<BrokerStatusPayload | null>(null);
  const [brokerState, setBrokerState] = useState<"LOADING" | "LIVE" | "PRIVATE" | "UNAVAILABLE">("LOADING");

  useEffect(() => {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(config));
    } catch {
      // Session storage is optional; the visible paper calculator keeps working in memory.
    }
  }, [config, storageKey]);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/moo/broker-status", { cache: "no-store", signal: controller.signal });
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
        setBrokerStatus(null);
        setBrokerState("UNAVAILABLE");
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [targetSession]);

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
  const strictExecutionReady = snapshot.blockReason === "NONE" && snapshot.decision !== "NO_TRADE" && (snapshot.longTicket.actionable || snapshot.shortTicket.actionable);
  const risksReady = paperTicketComplete(paperSnapshot.longTicket) && paperTicketComplete(paperSnapshot.shortTicket);
  const accountLabelsReady = paperSnapshot.longTicket.accountLabel.state === "READY" && paperSnapshot.shortTicket.accountLabel.state === "READY";
  const brokerFreshnessEligible = brokerStatus != null && ["fresh", "cached"].includes(brokerStatus.freshness.state) && brokerStatus.freshness.ageMs != null && brokerStatus.freshness.ageMs <= brokerStatus.freshness.maxAgeMs;
  const borrowReferenceCurrent = brokerStatus?.configured === true && brokerStatus.status === "live" && brokerFreshnessEligible && brokerStatus.shortable === true;
  const borrowReady = borrowReferenceCurrent && brokerStatus?.locateGuaranteed === true;
  const shortability = {
    ready: borrowReady,
    label: borrowReady
      ? copy(lang, "Fresh locate confirmed", "Localización reciente confirmada")
      : borrowReferenceCurrent
        ? copy(lang, "Indicative shortable · locate unconfirmed", "Corto indicativo · localización sin confirmar")
        : copy(lang, "Unconfirmed · blocked", "Sin confirmar · bloqueado"),
    detail: brokerStatus?.status === "live" || brokerStatus?.status === "limited"
      ? `${copy(lang, "Borrow status", "Estado de préstamo")}: ${brokerStatus.borrowStatus ?? "—"} · ${copy(lang, "checked", "consultado")} ${etDateTime(brokerStatus.checkedAt, lang)}`
      : brokerState === "PRIVATE"
        ? copy(lang, "Private authenticated broker check required.", "Se requiere una verificación privada autenticada del bróker.")
        : copy(lang, "No fresh broker borrow observation is available.", "No hay una observación reciente de préstamo del bróker."),
  };
  const gates = [
    { label: copy(lang, "Research anchor", "Ancla de investigación"), ready: paperSnapshot.researchAnchorCents.state === "READY", detail: fieldExplanation(paperSnapshot.researchAnchorCents, lang) },
    { label: copy(lang, "Both thirds", "Ambos tercios"), ready: paperSnapshot.majorThirdCents.state === "READY" && paperSnapshot.minorThirdCents.state === "READY", detail: copy(lang, "Requires previous-session and target-premarket highs/lows.", "Requiere máximos y mínimos de la sesión previa y la preapertura objetivo.") },
    { label: copy(lang, "Paper preference", "Preferencia de prueba"), ready: resolvedPreference !== "UNASSIGNED", detail: resolvedPreference === "UNASSIGNED" ? copy(lang, "No side assigned.", "Ningún lado asignado.") : copy(lang, "Major/minor paper roles assigned.", "Roles de prueba mayor/menor asignados.") },
    { label: copy(lang, "Risk inputs", "Entradas de riesgo"), ready: risksReady, detail: risksReady ? copy(lang, "Both paper configurations are complete.", "Ambas configuraciones de prueba están completas.") : copy(lang, "Complete the required fields below.", "Complete los campos requeridos abajo.") },
    { label: copy(lang, "Paper account labels", "Etiquetas de cuenta de prueba"), ready: accountLabelsReady, detail: accountLabelsReady ? copy(lang, "Both browser-local labels are set.", "Ambas etiquetas locales están definidas.") : copy(lang, "Labels only; never enter credentials.", "Solo etiquetas; nunca ingrese credenciales.") },
    { label: copy(lang, "Broker asset reference", "Referencia de activo del bróker"), ready: borrowReferenceCurrent, detail: borrowReferenceCurrent ? copy(lang, "Fresh indicative NVDA asset status received.", "Se recibió un estado indicativo reciente del activo NVDA.") : copy(lang, "Fresh broker asset status is unavailable.", "El estado reciente del activo del bróker no está disponible.") },
    { label: copy(lang, "Shortability", "Disponibilidad para corto"), ready: borrowReady, detail: shortability.detail },
    { label: copy(lang, "Strict execution", "Ejecución estricta"), ready: strictExecutionReady, detail: copy(lang, "Ready only when the frozen strict decision and every applicable execution gate pass; visible diagnostics are not treated as entitlements.", "Listo solo cuando la decisión estricta congelada y todos los controles de ejecución aplicables se aprueban; los diagnósticos visibles no se tratan como autorizaciones.") },
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
    <section className="moo-paper-planner" aria-labelledby="moo-paper-planner-title">
      <header className="moo-paper-planner-head">
        <div><span className="moo-overline">{copy(lang, "PAPER PLANNING TICKETS · BROWSER-LOCAL", "ÓRDENES DE PLANIFICACIÓN DE PRUEBA · LOCALES")}</span><h3 id="moo-paper-planner-title">{copy(lang, "Configure and explain both MOO scenarios", "Configure y explique ambos escenarios MOO")}</h3><p>{copy(lang, "This calculator fills research and risk fields without changing the frozen Strict MOO decision. It cannot submit an order.", "Esta calculadora completa campos de investigación y riesgo sin cambiar la decisión MOO Estricta congelada. No puede enviar una orden.")}</p></div>
        <div className="moo-paper-only-badge"><strong>{copy(lang, "PAPER ONLY", "SOLO PRUEBA")}</strong><span>{copy(lang, "Never actionable", "Nunca operable")}</span></div>
      </header>

      <div className="moo-paper-gates" aria-label={copy(lang, "Planning and execution gate checklist", "Lista de controles de planificación y ejecución")}>
        {gates.map((gate) => <div className={gate.ready ? "ready" : "blocked"} key={gate.label}><i aria-hidden="true"/><span><b>{gate.label}</b><small>{gate.detail}</small></span><strong>{gate.ready ? copy(lang, "READY", "LISTO") : copy(lang, "BLOCKED", "BLOQUEADO")}</strong></div>)}
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

      <div className="moo-paper-ticket-grid" role="status" aria-live="polite" aria-atomic="false">
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
          <div><span>{copy(lang, "Planning data checked", "Datos de planificación consultados")}</span><strong>{etDateTime(planning?.marketCheckedAt ?? null, lang)}</strong><small>{copy(lang, "Research computed", "Investigación calculada")}: {etDateTime(planning?.computedAt ?? researchPreview.computedAt, lang)} · {copy(lang, "Broker checked", "Bróker consultado")}: {etDateTime(brokerStatus?.checkedAt ?? null, lang)}</small></div>
        </div>
      </details>
    </section>
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
          <div className="moo-source-times"><time>{copy(lang, "Observed", "Observado")}: {etDateTime(source.observedAt, lang)}</time><time>{copy(lang, "Checked", "Consultado")}: {etDateTime(source.checkedAt, lang)}</time></div>
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
          <div className="moo-source-head"><i aria-hidden="true"/><strong>{source.label}</strong><span>{sourceLabel(source, lang)}</span></div>
          <p>{source.provider ?? copy(lang, "Provider not configured", "Proveedor no configurado")}{source.venue ? ` · ${source.venue}` : ""}</p>
          <small>{entitlementLabel(source, lang)}</small>
          {expanded ? <div className="moo-source-times"><time>{copy(lang, "Observed", "Observado")}: {etDateTime(source.observedAt, lang)}</time><time>{copy(lang, "Checked", "Consultado")}: {etDateTime(source.checkedAt, lang)}</time><span>{copy(lang, "Age", "Edad")}: {source.ageMs == null ? "—" : `${Math.round(source.ageMs / 1000)}s`}</span></div> : null}
        </article>
      ))}
    </div>
  );
}

export function MooDecisionSurface({ snapshot, planningSources, planning, lang }: { snapshot: MooDecisionSnapshot; planningSources: MooPlanningSourceList; planning?: MooPlanningInput; lang: Language }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
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

  return (
    <section className={`moo-decision-surface panel ${decisionTone}`} aria-labelledby="moo-decision-title">
      <header className="moo-decision-head">
        <div>
          <span className="moo-overline">NVDA · {copy(lang, "MOO OPENING DECISION", "DECISIÓN DE APERTURA MOO")}</span>
          <h2 id="moo-decision-title">{targetDate(snapshot.targetSession, lang)}</h2>
          <p>{copy(lang, "Nasdaq Opening Cross · research and paper use only", "Cruce de Apertura Nasdaq · solo investigación y prueba")}</p>
        </div>
        <div className="moo-lifecycle-stack">
          <strong>{lifecycleLabel(snapshot, lang)}</strong>
          <span>{copy(lang, "Snapshot", "Captura")} {snapshot.snapshotId}</span>
          <time>{copy(lang, "Generated", "Generada")} {etDateTime(snapshot.generatedAt, lang)}</time>
        </div>
      </header>

      <section className={`moo-research-preview ${researchPreview.lean.toLowerCase()}`} aria-label={copy(lang, "Selected-session research preview", "Vista previa de investigación de la sesión seleccionada")}>
        <div className="moo-preview-heading">
          <span>{copy(lang, "SELECTED-SESSION RESEARCH PREVIEW · NON-ACTIONABLE", "VISTA PREVIA DE INVESTIGACIÓN · NO OPERABLE")}</span>
          <time>{copy(lang, "Computed", "Calculada")}: {etDateTime(researchPreview.computedAt, lang)}</time>
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
          <strong aria-live="polite">{decisionLabel(snapshot, lang)}</strong>
          <p>{blockReason(snapshot, lang)}</p>
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
        <span><b>{copy(lang, "Data quality", "Calidad de datos")}</b>{snapshot.dataQualityScore == null ? copy(lang, "Unavailable", "No disponible") : `${snapshot.dataQualityScore}/100`}</span>
        <span><b>{copy(lang, "Third rule", "Regla de tercios")}</b>{snapshot.thirdPercentBasisPoints === 3300 ? "0.33" : "1/3"} · ROUND_HALF_UP · +$0.01</span>
        <span><b>{copy(lang, "TP cushion", "Margen de objetivo")}</b>{cents(snapshot.takeProfitCushionCents)}</span>
      </div>

      <PaperPlanningPanel key={planningInput?.targetSession ?? snapshot.targetSession} snapshot={snapshot} researchPreview={researchPreview} planning={planningInput} lang={lang}/>

      <section className="moo-planning-band" aria-labelledby="moo-planning-title">
        <div className="moo-health-head">
          <div><span className="moo-overline">{copy(lang, "PLANNING / RESEARCH SOURCES", "FUENTES DE PLANIFICACIÓN / INVESTIGACIÓN")}</span><strong id="moo-planning-title">{copy(lang, "Available context for the selected session", "Contexto disponible para la sesión seleccionada")}</strong></div>
          <p>{copy(lang, "These rows may inform a non-actionable preview. They do not satisfy strict execution entitlements.", "Estas filas pueden informar una vista previa no operable. No cumplen las autorizaciones estrictas de ejecución.")}</p>
        </div>
        <MooPlanningSourceStrip sources={planningSources} lang={lang}/>
      </section>

      {snapshot.lifecycle === "CROSS_COMPLETE" ? (
        <div className="moo-cross-result">
          <div><span>{copy(lang, "Frozen prediction", "Predicción congelada")}</span><strong>{predicted}</strong></div>
          <div><span>{copy(lang, "Actual Nasdaq Official Open", "Apertura Oficial Nasdaq Real")}</span><strong>{cents(snapshot.actualOfficialOpenCents) ?? copy(lang, "Pending", "Pendiente")}</strong></div>
          <div><span>{copy(lang, "Prediction error", "Error de predicción")}</span><strong>{cents(snapshot.predictionErrorCents) ?? copy(lang, "Pending", "Pendiente")}</strong></div>
        </div>
      ) : null}

      <div className="moo-health-head moo-strict-ticket-head">
        <div><span className="moo-overline">{copy(lang, "STRICT FROZEN TICKETS", "ÓRDENES ESTRICTAS CONGELADAS")}</span><strong>{copy(lang, "Execution fields remain fail-closed", "Los campos de ejecución permanecen bloqueados por seguridad")}</strong></div>
        <p>{copy(lang, "Paper planning values above never replace a trained point-in-time model, execution entitlement, or broker fill.", "Los valores de planificación de prueba de arriba nunca sustituyen un modelo puntual entrenado, una autorización de ejecución ni una ejecución del bróker.")}</p>
      </div>
      <div className="moo-ticket-grid moo-strict-ticket-grid">
        <TicketCard ticket={snapshot.longTicket} snapshot={snapshot} lang={lang}/>
        <TicketCard ticket={snapshot.shortTicket} snapshot={snapshot} lang={lang}/>
      </div>

      <div className="moo-health-head">
        <div><span className="moo-overline">{copy(lang, "SOURCE ENTITLEMENTS", "AUTORIZACIONES DE FUENTE")}</span><strong>{copy(lang, "Critical feeds gate every ticket", "Las fuentes críticas controlan cada orden")}</strong></div>
        <p>{copy(lang, "API REQUIRED means an execution-grade entitlement is still missing. Observation time and API check time are different facts.", "API REQUERIDA significa que todavía falta una autorización apta para ejecución. La hora de observación y la hora de consulta son datos distintos.")}</p>
      </div>
      <MooSourceStrip sources={snapshot.sources} lang={lang}/>
      {snapshot.warnings.length ? <div className="moo-warnings">{snapshot.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
    </section>
  );
}

export function MooDataHealthPanel({ snapshot, lang }: { snapshot: MooDecisionSnapshot; lang: Language }) {
  return (
    <section className="moo-data-health-view" aria-labelledby="strict-moo-health-title">
      <div className="library-hero">
        <div>
          <span className="moo-overline">{copy(lang, "STRICT EXECUTION GATE", "CONTROL DE EJECUCIÓN ESTRICTO")}</span>
          <h2 id="strict-moo-health-title">{copy(lang, "Strict MOO execution entitlements", "Autorizaciones de ejecución MOO estrictas")}</h2>
          <p>{copy(lang, "These institutional requirements are separate from the working Full Dashboard research APIs above. A blocked source here does not mean the research dashboard is offline.", "Estos requisitos institucionales son independientes de las APIs de investigación activas del Panel Completo. Una fuente bloqueada aquí no significa que el panel de investigación esté fuera de servicio.")}</p>
        </div>
        <div className="moo-health-summary"><strong>{snapshot.sources.filter((source) => source.state === "LIVE").length}/{snapshot.sources.length}</strong><span>{copy(lang, "execution feeds ready", "fuentes de ejecución listas")}</span></div>
      </div>
      <article className="panel moo-health-panel">
        <div className="moo-health-status"><strong>{decisionLabel(snapshot, lang)}</strong><span>{blockReason(snapshot, lang)}</span><time>{copy(lang, "Snapshot generated", "Captura generada")}: {etDateTime(snapshot.generatedAt, lang)}</time></div>
        <MooSourceStrip sources={snapshot.sources} lang={lang} expanded/>
      </article>
    </section>
  );
}
