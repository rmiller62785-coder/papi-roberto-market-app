import type { MooDeadline, MooDecisionSnapshot, MooTicket } from "../moo-contract";
import type { MooSystemStatus } from "../moo-system-status";
import {
  deriveStrictMooPresentation,
  type StrictJourneyStageId,
  type StrictJourneyState,
} from "../strict-moo-presentation";

type Language = "en" | "es";

export type StrictMooCommissioningEvidence = {
  executionMode: string;
  blockers: string[];
  modelPromoted: boolean;
  artifactValidated: boolean;
  artifactStoreState: "FOUND" | "NOT_FOUND" | "UNAVAILABLE";
  statusEvaluatedAt: number | null;
  riskPolicyVersion: string | null;
};

type Props = {
  snapshot: MooDecisionSnapshot;
  transport?: MooSystemStatus["transport"] | null;
  commissioning?: StrictMooCommissioningEvidence | null;
  statusUnavailable?: boolean;
  nowMs: number;
  evaluatedAt?: number | null;
  lang: Language;
};

const copy = (lang: Language, en: string, es: string) => lang === "es" ? es : en;

function moneyFromCents(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `$${(value / 100).toFixed(2)}`;
}

function isoDateTime(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? undefined : new Date(value).toISOString();
}

function etDateTime(value: number | null | undefined, lang: Language) {
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

function age(value: number | null | undefined, lang: Language) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1_000) return `${Math.max(0, Math.round(value))} ms`;
  return `${(Math.max(0, value) / 1_000).toFixed(value < 10_000 ? 1 : 0)} ${copy(lang, "sec", "s")}`;
}

function stateLabel(state: StrictJourneyState, lang: Language) {
  const labels: Record<StrictJourneyState, [string, string]> = {
    live: ["READY", "LISTO"],
    pending: ["PENDING", "PENDIENTE"],
    stale: ["STALE", "VENCIDO"],
    unavailable: ["UNAVAILABLE", "NO DISPONIBLE"],
    closed: ["CLOSED", "CERRADO"],
    not_applicable: ["NOT YET APPLICABLE", "AÚN NO APLICA"],
  };
  return copy(lang, ...labels[state]);
}

function stageLabel(id: StrictJourneyStageId, lang: Language) {
  const labels: Record<StrictJourneyStageId, [string, string]> = {
    source: ["Source health", "Estado de fuentes"],
    model: ["Model readiness", "Preparación del modelo"],
    freeze: ["Freeze", "Cierre"],
    ticket: ["Ticket", "Orden"],
    fill: ["Fill / audit", "Ejecución / auditoría"],
  };
  return copy(lang, ...labels[id]);
}

function decisionLabel(snapshot: MooDecisionSnapshot, lang: Language) {
  if (snapshot.decision === "LONG_FAVORED") return copy(lang, "LONG FAVORED", "LARGO FAVORECIDO");
  if (snapshot.decision === "SHORT_FAVORED") return copy(lang, "SHORT FAVORED", "CORTO FAVORECIDO");
  return copy(lang, "NO TRADE", "NO OPERAR");
}

function isUncommissionedFavoredDecision(
  snapshot: MooDecisionSnapshot,
  commissioning: StrictMooCommissioningEvidence | null | undefined,
) {
  return commissioning?.executionMode === "NOT_COMMISSIONED" &&
    (snapshot.decision === "LONG_FAVORED" || snapshot.decision === "SHORT_FAVORED");
}

function commandDecisionLabel(
  snapshot: MooDecisionSnapshot,
  commissioning: StrictMooCommissioningEvidence | null | undefined,
  lang: Language,
) {
  if (isUncommissionedFavoredDecision(snapshot, commissioning)) {
    return copy(lang, "NOT COMMISSIONED · PAPER REVIEW ONLY", "NO COMISIONADO · SOLO REVISIÓN EN PAPEL");
  }
  return decisionLabel(snapshot, lang);
}

function commandBlockerLabel(
  snapshot: MooDecisionSnapshot,
  commissioning: StrictMooCommissioningEvidence | null | undefined,
  lang: Language,
) {
  if (isUncommissionedFavoredDecision(snapshot, commissioning)) {
    return copy(lang, "Execution is not commissioned", "La ejecución no está comisionada");
  }
  return blockerLabel(snapshot, lang);
}

function blockerLabel(snapshot: MooDecisionSnapshot, lang: Language) {
  const labels: Partial<Record<MooDecisionSnapshot["blockReason"], [string, string]>> = {
    MARKET_CLOSED: ["Market closed as scheduled", "Mercado cerrado según el horario"],
    ENTRY_WINDOW_CLOSED: ["MOO entry window closed", "Ventana de entrada MOO cerrada"],
    TARGET_SESSION_NOT_STARTED: ["Selected session has not started", "La sesión seleccionada no ha comenzado"],
    DATA_PENDING: ["Waiting for verified point-in-time data", "Esperando datos puntuales verificados"],
    STALE_US_QUOTE: ["Required U.S. quote is stale", "La cotización requerida de EE. UU. está vencida"],
    FEED_NOT_ENTITLED: ["Execution-grade feed unavailable", "Fuente apta para ejecución no disponible"],
    MODEL_NOT_TRAINED: ["Promoted opening model required", "Se requiere un modelo de apertura promovido"],
    LOW_DATA_QUALITY: ["Data quality is below policy", "La calidad de datos está bajo la política"],
    LOW_CONFIDENCE: ["Confidence is below policy", "La confianza está bajo la política"],
    NO_EDGE: ["No qualified edge", "Sin ventaja calificada"],
    SHORTABILITY_UNCONFIRMED: ["Short locate is unconfirmed", "La localización para corto no está confirmada"],
    NONE: ["No blocker detected", "No se detectó ningún bloqueo"],
  };
  return labels[snapshot.blockReason]
    ? copy(lang, ...labels[snapshot.blockReason]!)
    : snapshot.blockReason.replaceAll("_", " ");
}

function deadlineLabel(deadline: MooDeadline, lang: Language) {
  const labels: Record<MooDeadline["label"], [string, string]> = {
    DECISION_FREEZE: ["Decision freeze", "Cierre de decisión"],
    MODIFY_CANCEL: ["Modify / cancel cutoff", "Límite para modificar / cancelar"],
    FINAL_ENTRY: ["Final MOO entry", "Entrada MOO final"],
  };
  return copy(lang, ...labels[deadline.label]);
}

function remaining(deadline: MooDeadline, nowMs: number, lang: Language) {
  const milliseconds = Math.max(0, deadline.at - nowMs);
  if (deadline.passed || milliseconds === 0) return copy(lang, "Passed", "Vencido");
  const total = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function favoredTicket(snapshot: MooDecisionSnapshot): MooTicket | null {
  if (snapshot.decision === "LONG_FAVORED") return snapshot.longTicket;
  if (snapshot.decision === "SHORT_FAVORED") return snapshot.shortTicket;
  return null;
}

export function StrictMooJourney({
  snapshot,
  transport,
  commissioning,
  statusUnavailable = false,
  nowMs,
  evaluatedAt = snapshot.generatedAt,
  lang,
}: Props) {
  const presentation = deriveStrictMooPresentation({
    snapshot,
    transport,
    commissioning,
    statusUnavailable,
    nowMs,
  });
  const stream = transport?.stream;
  const source = presentation.usSource;
  const ticket = favoredTicket(snapshot);
  const predicted = moneyFromCents(snapshot.predictedOfficialOpenCents);
  const currentStage = presentation.stages.find((stage) => stage.current)!;
  const requiredCount = presentation.sourceStageState === "closed"
    ? copy(lang, "Closed · not applicable", "Cerrado · no aplica")
    : presentation.quoteState === "live"
      ? "1/1"
      : "0/1";

  const streamHeadline = presentation.streamState === "live"
    ? copy(lang, "Server stream supervisor connected", "Supervisor de transmisión conectado")
    : presentation.streamState === "stale"
      ? copy(lang, "Supervisor stale or reconnecting", "Supervisor vencido o reconectando")
      : transport?.noteCode === "DURABLE_STREAM_SERVICE_NOT_CONFIGURED"
        ? copy(lang, "Supervisor not configured", "Supervisor no configurado")
        : copy(lang, "Supervisor unavailable", "Supervisor no disponible");
  const quoteHeadline = presentation.quoteState === "live"
    ? copy(lang, "Current execution-grade SIP observation", "Observación SIP vigente apta para ejecución")
    : presentation.quoteState === "closed"
      ? source?.observedAt == null
        ? copy(lang, "Session closed · no archived execution quote", "Sesión cerrada · sin cotización de ejecución archivada")
        : copy(lang, "Session closed · last verified quote retained", "Sesión cerrada · se conserva la última cotización verificada")
      : presentation.quoteState === "pending"
        ? copy(lang, "Waiting for the selected session", "Esperando la sesión seleccionada")
        : presentation.quoteState === "stale"
          ? copy(lang, "Last SIP observation is too old", "La última observación SIP es demasiado antigua")
          : copy(lang, "No qualifying SIP observation", "Sin observación SIP calificada");

  return (
    <section className="strict-journey" aria-labelledby="strict-journey-title">
      <div className={`strict-command state-${currentStage.state}`}>
        <div>
          <span className="moo-overline">{copy(lang, "STRICT MOO STATUS", "ESTADO MOO ESTRICTO")}</span>
          <strong>{commandDecisionLabel(snapshot, commissioning, lang)}</strong>
        </div>
        <div>
          <span>{copy(lang, "CURRENT BLOCKER", "BLOQUEO ACTUAL")}</span>
          <b>{commandBlockerLabel(snapshot, commissioning, lang)}</b>
        </div>
        <div>
          <span>{copy(lang, "CURRENT STAGE", "ETAPA ACTUAL")}</span>
          <b>{stageLabel(currentStage.id, lang)} · {stateLabel(currentStage.state, lang)}</b>
        </div>
        <div>
          <span>{copy(lang, "SERVER EVALUATED", "SERVIDOR EVALUADO")}</span>
          <time dateTime={isoDateTime(evaluatedAt)}>{etDateTime(evaluatedAt, lang)}</time>
        </div>
      </div>

      {commissioning?.artifactStoreState === "UNAVAILABLE" ? (
        <div className="strict-store-alert" role="alert">
          <strong>{copy(lang, "ARTIFACT STORAGE UNAVAILABLE", "ALMACENAMIENTO DE ARTEFACTOS NO DISPONIBLE")}</strong>
          <span>{copy(lang, "The immutable freeze store could not be read. Readiness remains blocked even when earlier stages are unavailable.", "No se pudo leer el almacén inmutable de cierres. La preparación permanece bloqueada aunque las etapas anteriores no estén disponibles.")}</span>
        </div>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {commandDecisionLabel(snapshot, commissioning, lang)}. {commandBlockerLabel(snapshot, commissioning, lang)}. {stageLabel(currentStage.id, lang)}: {stateLabel(currentStage.state, lang)}.
      </p>

      <div className="strict-journey-heading">
        <div>
          <span className="moo-overline">{copy(lang, "READINESS JOURNEY", "RUTA DE PREPARACIÓN")}</span>
          <h3 id="strict-journey-title">{copy(lang, "Evidence before execution", "Evidencia antes de la ejecución")}</h3>
        </div>
        <p>{copy(lang, "Each stage remains fail-closed until the server validates its prerequisite. Later stages never borrow readiness from research data.", "Cada etapa permanece bloqueada hasta que el servidor valida su requisito. Las etapas posteriores nunca toman preparación de datos de investigación.")}</p>
      </div>

      <ol className="strict-stage-list">
        {presentation.stages.map((stage, index) => (
          <li className={`strict-stage state-${stage.state} ${stage.current ? "current" : ""}`} aria-current={stage.current ? "step" : undefined} key={stage.id}>
            <header className="strict-stage-head">
              <span className="strict-stage-number" aria-hidden="true">{index + 1}</span>
              <div><span>{copy(lang, "STAGE", "ETAPA")} {index + 1}</span><h4>{stageLabel(stage.id, lang)}</h4></div>
              <strong>{stateLabel(stage.state, lang)}</strong>
            </header>

            {stage.id === "source" ? (
              <div className="strict-stage-body strict-source-body">
                <div className="strict-required-summary">
                  <div><span>{copy(lang, "REQUIRED NOW", "REQUERIDA AHORA")}</span><strong>{requiredCount}</strong></div>
                  <p>{presentation.sourceStageState === "closed"
                    ? source?.observedAt == null
                      ? copy(lang, "The selected execution window is closed, and no archived execution quote is available for this session.", "La ventana de ejecución seleccionada está cerrada y no hay una cotización de ejecución archivada disponible para esta sesión.")
                      : copy(lang, "The selected execution window is closed. The last verified quote remains available as audit evidence without treating closure as an outage.", "La ventana de ejecución seleccionada está cerrada. La última cotización verificada permanece disponible como evidencia de auditoría sin tratar el cierre como una falla.")
                    : copy(lang, "Only the current consolidated U.S. SIP quote counts toward Strict readiness.", "Solo la cotización SIP consolidada vigente de EE. UU. cuenta para la preparación estricta.")}</p>
                </div>
                <div className="strict-connection-lanes">
                  <article className={`state-${presentation.streamState}`}>
                    <div><span>{copy(lang, "PERMANENT UPSTREAM", "CONEXIÓN PERMANENTE")}</span><b>{stateLabel(presentation.streamState, lang)}</b></div>
                    <strong>{streamHeadline}</strong>
                    <p>{stream?.provider ?? copy(lang, "Provider unavailable", "Proveedor no disponible")} · {stream?.feed?.toUpperCase() ?? "—"} · {stream?.coverageScope?.replaceAll("_", " ") ?? "—"}</p>
                    <dl>
                      <div><dt>{copy(lang, "Heartbeat age", "Edad del latido")}</dt><dd>{age(stream?.heartbeatAgeMs, lang)} / {age(stream?.maxHeartbeatAgeMs, lang)}</dd></div>
                      <div><dt>{copy(lang, "Source lag", "Retraso de fuente")}</dt><dd>{age(stream?.sourceLagMs, lang)} / {age(stream?.maxSourceLagMs, lang)}</dd></div>
                    </dl>
                  </article>
                  <article className={`state-${presentation.quoteState}`}>
                    <div><span>{copy(lang, "STRICT QUOTE", "COTIZACIÓN ESTRICTA")}</span><b>{stateLabel(presentation.quoteState, lang)}</b></div>
                    <strong>{quoteHeadline}</strong>
                    <p>{source?.provider ?? copy(lang, "Provider not confirmed", "Proveedor no confirmado")} · {source?.coverage?.replaceAll("_", " ") ?? copy(lang, "Consolidated SIP required", "Se requiere SIP consolidado")}</p>
                    <dl>
                      <div><dt>{copy(lang, "Observed", "Observada")}</dt><dd>{etDateTime(source?.observedAt, lang)}</dd></div>
                      <div><dt>{copy(lang, "Quote age", "Edad de cotización")}</dt><dd>{age(source?.ageMs, lang)} / 2.0 {copy(lang, "sec", "s")}</dd></div>
                    </dl>
                  </article>
                  <article className={`state-${presentation.browserState}`}>
                    <div><span>{copy(lang, "BROWSER DELIVERY", "ENTREGA AL NAVEGADOR")}</span><b>{stateLabel(presentation.browserState, lang)}</b></div>
                    <strong>{presentation.browserState === "live" ? copy(lang, "Validated status polling active", "Sondeo de estado validado activo") : copy(lang, "Status refresh interrupted", "Actualización de estado interrumpida")}</strong>
                    <p>{copy(lang, "Adaptive REST polling reads server-owned evidence. The browser does not maintain the market-data socket.", "El sondeo REST adaptativo lee evidencia del servidor. El navegador no mantiene el socket de datos de mercado.")}</p>
                    <dl><div><dt>{copy(lang, "Checked", "Consultado")}</dt><dd>{etDateTime(source?.checkedAt ?? evaluatedAt, lang)}</dd></div></dl>
                  </article>
                </div>
                <details className="strict-source-audit">
                  <summary>{copy(lang, "Point-in-time provenance", "Procedencia puntual")}</summary>
                  <dl>
                    <div><dt>{copy(lang, "Provider observed", "Proveedor observó")}</dt><dd>{etDateTime(source?.observedAt, lang)}</dd></div>
                    <div><dt>{copy(lang, "Application received", "Aplicación recibió")}</dt><dd>{etDateTime(source?.receivedAt, lang)}</dd></div>
                    <div><dt>{copy(lang, "Processed", "Procesada")}</dt><dd>{etDateTime(source?.processedAt, lang)}</dd></div>
                    <div><dt>{copy(lang, "Available", "Disponible")}</dt><dd>{etDateTime(source?.availableAt, lang)}</dd></div>
                    <div><dt>{copy(lang, "Valid until", "Válida hasta")}</dt><dd>{etDateTime(source?.validUntil, lang)}</dd></div>
                    <div><dt>{copy(lang, "Connection epoch", "Época de conexión")}</dt><dd>{stream?.connectionEpoch ?? "—"}</dd></div>
                    <div><dt>{copy(lang, "Stream diagnostic", "Diagnóstico de transmisión")}</dt><dd>{stream?.detailCode ?? "—"}</dd></div>
                  </dl>
                </details>
              </div>
            ) : null}

            {stage.id === "model" && stage.state !== "not_applicable" ? (
              <div className="strict-stage-body strict-model-body">
                <div><span>{copy(lang, "Predicted official open", "Apertura oficial predicha")}</span><strong>{predicted}</strong><small>{snapshot.predictedOfficialOpenCents == null ? copy(lang, "No promoted point-in-time model output", "Sin resultado de un modelo puntual promovido") : copy(lang, "Point estimate · not a guaranteed fill", "Estimación puntual · ejecución no garantizada")}</small></div>
                <div><span>{copy(lang, "Model / feature schema", "Modelo / esquema de variables")}</span><strong>{snapshot.modelVersion ?? copy(lang, "Not promoted", "No promovido")}</strong><small>{snapshot.featureSchemaVersion ?? "—"}</small></div>
                <div><span>{copy(lang, "Feature snapshot", "Captura de variables")}</span><strong>{snapshot.featureSnapshotId ?? copy(lang, "Unavailable", "No disponible")}</strong><small>{copy(lang, "Must be immutable and cutoff-safe", "Debe ser inmutable y segura al límite")}</small></div>
                <div><span>{copy(lang, "Confidence / data quality", "Confianza / calidad de datos")}</span><strong>{snapshot.confidencePct == null ? "—" : `${snapshot.confidencePct.toFixed(0)}%`} / {snapshot.dataQualityScore == null ? "—" : `${snapshot.dataQualityScore}/100`}</strong><small>{copy(lang, "Calibration required before promotion", "Se requiere calibración antes de la promoción")}</small></div>
              </div>
            ) : null}

            {stage.id === "freeze" && stage.state !== "not_applicable" ? (
              <div className="strict-stage-body strict-freeze-body">
                <div className="strict-artifact-summary"><span>{copy(lang, "STRICT ARTIFACT", "ARTEFACTO ESTRICTO")}</span><strong>{presentation.artifactReady ? copy(lang, "VALIDATED", "VALIDADO") : commissioning?.artifactStoreState === "UNAVAILABLE" ? copy(lang, "STORAGE UNAVAILABLE", "ALMACENAMIENTO NO DISPONIBLE") : copy(lang, "NOT VALIDATED", "NO VALIDADO")}</strong><small>{commissioning?.artifactStoreState === "UNAVAILABLE" ? copy(lang, "Artifact storage could not be read; readiness stays blocked", "No se pudo leer el almacenamiento de artefactos; la preparación permanece bloqueada") : snapshot.frozenAt == null ? copy(lang, "No immutable decision artifact is available", "No hay un artefacto de decisión inmutable disponible") : etDateTime(snapshot.frozenAt, lang)}</small></div>
                <div className="strict-deadline-list">
                  {snapshot.deadlines.slice().sort((a, b) => a.at - b.at).map((deadline) => (
                    <div className={deadline.passed || deadline.at <= nowMs ? "passed" : "active"} key={deadline.label}>
                      <span>{deadlineLabel(deadline, lang)}</span>
                      <strong aria-hidden="true">{remaining(deadline, nowMs, lang)}</strong>
                      <span className="sr-only">{deadline.passed || deadline.at <= nowMs ? copy(lang, "Passed", "Vencido") : copy(lang, "Upcoming", "Próximo")}</span>
                      <time dateTime={isoDateTime(deadline.at)}>{etDateTime(deadline.at, lang)}</time>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {stage.id === "ticket" && stage.state !== "not_applicable" ? (
              <div className="strict-stage-body strict-ticket-summary">
                <div><span>{copy(lang, "Decision", "Decisión")}</span><strong>{commissioning?.executionMode === "NOT_COMMISSIONED" && snapshot.decision !== "NO_TRADE" ? copy(lang, "PAPER REVIEW ONLY · NO ORDER", "SOLO REVISIÓN EN PAPEL · SIN ORDEN") : decisionLabel(snapshot, lang)}</strong></div>
                <div><span>{copy(lang, "Order type", "Tipo de orden")}</span><strong>{ticket?.orderType ?? "—"}</strong></div>
                <div><span>{copy(lang, "Quantity", "Cantidad")}</span><strong>{ticket?.quantity ?? "—"}</strong></div>
                <div><span>{copy(lang, "Maximum loss", "Pérdida máxima")}</span><strong>{moneyFromCents(ticket?.maximumLossCents)}</strong></div>
                <p>{presentation.ticketReady ? copy(lang, "The favored ticket passed the server-owned artifact and risk gates.", "La orden favorecida aprobó los controles de artefacto y riesgo del servidor.") : commissioning?.executionMode === "NOT_COMMISSIONED" && presentation.artifactReady ? copy(lang, "The frozen artifact is available for paper review only. Execution is not commissioned, so no order can be submitted.", "El artefacto congelado está disponible solo para revisión en papel. La ejecución no está comisionada, por lo que no se puede enviar ninguna orden.") : copy(lang, "No strict ticket is published until the model, freeze and risk policy pass. Paper simulation cannot unlock this stage.", "No se publica una orden estricta hasta que aprueben el modelo, el cierre y la política de riesgo. La simulación de prueba no puede habilitar esta etapa.")}</p>
              </div>
            ) : null}

            {stage.id === "fill" && stage.state !== "not_applicable" ? (
              <div className="strict-stage-body strict-fill-body">
                <div><span>{copy(lang, "Broker fill", "Ejecución del bróker")}</span><strong>{moneyFromCents(ticket?.actualFillCents)}</strong></div>
                <div><span>{copy(lang, "Official Nasdaq open", "Apertura oficial Nasdaq")}</span><strong>{moneyFromCents(snapshot.actualOfficialOpenCents)}</strong></div>
                <div><span>{copy(lang, "Prediction error", "Error de predicción")}</span><strong>{moneyFromCents(snapshot.predictionErrorCents)}</strong></div>
                <div><span>{copy(lang, "Snapshot", "Captura")}</span><strong>{snapshot.snapshotId}</strong></div>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
