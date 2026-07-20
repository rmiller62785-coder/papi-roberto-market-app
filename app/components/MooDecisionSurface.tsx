"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  MooDeadline,
  MooDecisionSnapshot,
  MooSourceHealth,
  MooTicket,
  MooValueState,
} from "../moo-contract";

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

export type MooPlanningSourceList = MooPlanningSource[] & { researchPreview?: MooResearchPreview };

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
  const unconfigured = copy(lang, "Not configured", "No configurado");

  return (
    <article className={`moo-ticket ${ticket.side.toLowerCase()} ${ticket.favored ? "favored" : ""}`} aria-label={`${ticket.side} MOO`}>
      <header>
        <div>
          <span className="moo-overline">{ticket.side} MOO</span>
          <h3>{copy(lang, isShort ? "Short opening ticket" : "Long opening ticket", isShort ? "Orden corta de apertura" : "Orden larga de apertura")}</h3>
        </div>
        <div className="moo-ticket-badges">
          {ticket.favored ? <strong>{copy(lang, "FAVORED", "FAVORECIDA")}</strong> : null}
          <span>{ticket.thirdRole === "MAJOR" ? copy(lang, "MAJOR THIRD", "TERCIO MAYOR") : copy(lang, "MINOR THIRD", "TERCIO MENOR")}</span>
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
          <small>{ticket.thirdRole === "MAJOR" ? copy(lang, "Major effective third", "Tercio efectivo mayor") : copy(lang, "Minor effective third", "Tercio efectivo menor")}</small>
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

export function MooDecisionSurface({ snapshot, planningSources, lang }: { snapshot: MooDecisionSnapshot; planningSources: MooPlanningSourceList; lang: Language }) {
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

      <div className="moo-ticket-grid">
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
