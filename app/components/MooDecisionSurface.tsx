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

const copy = (lang: Language, en: string, es: string) => (lang === "es" ? es : en);

function cents(value: number | null) {
  return value == null || !Number.isFinite(value) ? null : `$${(value / 100).toFixed(2)}`;
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
  const values: Record<MooDecisionSnapshot["blockReason"], [string, string]> = {
    MARKET_CLOSED: ["Market closed", "Mercado cerrado"],
    DATA_PENDING: ["Critical data pending", "Datos críticos pendientes"],
    STALE_US_QUOTE: ["U.S. quote is stale", "La cotización de EE. UU. está vencida"],
    FEED_NOT_ENTITLED: ["Required feed not entitled", "Fuente requerida sin autorización"],
    MODEL_NOT_TRAINED: ["Opening model not trained", "Modelo de apertura no entrenado"],
    LOW_DATA_QUALITY: ["Data quality below the safety gate", "Calidad de datos bajo el límite de seguridad"],
    LOW_CONFIDENCE: ["Direction confidence below 60%", "Confianza direccional menor de 60 %"],
    SHORTABILITY_UNCONFIRMED: ["Shortability is unconfirmed", "Disponibilidad para corto sin confirmar"],
    NONE: ["All decision gates passed", "Todos los controles aprobados"],
  };
  return copy(lang, ...values[snapshot.blockReason]);
}

function lifecycleLabel(snapshot: MooDecisionSnapshot, lang: Language) {
  const values: Record<MooDecisionSnapshot["lifecycle"], [string, string]> = {
    MARKET_CLOSED: ["MARKET CLOSED", "MERCADO CERRADO"],
    PREPARING: ["PREPARING", "PREPARANDO"],
    READY: ["LOCKABLE", "LISTO PARA BLOQUEAR"],
    FROZEN: ["MOO LOCKED · MONITORING ONLY", "MOO BLOQUEADA · SOLO MONITOREO"],
    LATE_LOCKED: ["LATE ORDER WINDOW · LOCKED IF ENTERED", "VENTANA TARDÍA · BLOQUEADA AL ENTRAR"],
    ENTRY_CLOSED: ["MOO ENTRY CLOSED", "ENTRADA MOO CERRADA"],
    CROSS_COMPLETE: ["OPENING CROSS COMPLETE", "CRUCE DE APERTURA COMPLETO"],
  };
  return copy(lang, ...values[snapshot.lifecycle]);
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
    NOT_ENTITLED: ["Not entitled", "Sin autorización"],
    UNAVAILABLE: ["Unavailable", "No disponible"],
  };
  return copy(lang, ...labels[source.entitlement]);
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

export function MooDecisionSurface({ snapshot, lang }: { snapshot: MooDecisionSnapshot; lang: Language }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const deadlines = useMemo(() => snapshot.deadlines.slice().sort((a, b) => a.at - b.at), [snapshot.deadlines]);
  const predicted = cents(snapshot.predictedOfficialOpenCents) ?? valueState(snapshot.predictedOpenState, lang);
  const decisionTone = snapshot.decision === "LONG_FAVORED" ? "long" : snapshot.decision === "SHORT_FAVORED" ? "short" : "no-trade";

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
        <p>{copy(lang, "Observation time and API check time are different facts.", "La hora de observación y la hora de consulta de API son datos distintos.")}</p>
      </div>
      <MooSourceStrip sources={snapshot.sources} lang={lang}/>
      {snapshot.warnings.length ? <div className="moo-warnings">{snapshot.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
    </section>
  );
}

export function MooDataHealthPanel({ snapshot, lang }: { snapshot: MooDecisionSnapshot; lang: Language }) {
  return (
    <section className="moo-data-health-view">
      <div className="library-hero">
        <div>
          <span className="moo-overline">{copy(lang, "OPERATING STATE", "ESTADO OPERATIVO")}</span>
          <h2>{copy(lang, "Data Health", "Estado de Datos")}</h2>
          <p>{copy(lang, "Provider, venue, entitlement, freshness, and failure state for every MOO input.", "Proveedor, mercado, autorización, vigencia y fallas de cada dato MOO.")}</p>
        </div>
        <div className="moo-health-summary"><strong>{snapshot.sources.filter((source) => source.state === "LIVE").length}/{snapshot.sources.length}</strong><span>{copy(lang, "sources live", "fuentes en vivo")}</span></div>
      </div>
      <article className="panel moo-health-panel">
        <div className="moo-health-status"><strong>{decisionLabel(snapshot, lang)}</strong><span>{blockReason(snapshot, lang)}</span><time>{copy(lang, "Snapshot generated", "Captura generada")}: {etDateTime(snapshot.generatedAt, lang)}</time></div>
        <MooSourceStrip sources={snapshot.sources} lang={lang} expanded/>
      </article>
    </section>
  );
}
