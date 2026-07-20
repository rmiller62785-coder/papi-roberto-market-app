import type {
  BrowserStreamMessage,
  MarketStreamEmission,
  PublicMarketSnapshot,
  StreamCursor,
} from "./contracts.ts";
import { cursorRecoveryReason, streamCursor } from "./recovery.ts";

export interface BrowserSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly bufferedAmount?: number;
}

export function browserUpdateInstruction(
  previous: StreamCursor,
  emission: MarketStreamEmission,
): BrowserStreamMessage | null {
  const received = streamCursor(emission);
  const reason = cursorRecoveryReason(previous, received);
  if (reason === "DUPLICATE") return null;
  return reason
    ? { type: "RECOVERY_REQUIRED", reason, expected: { ...previous, serviceSequence: previous.serviceSequence + 1 }, received }
    : { type: "UPDATE", cursor: received, emission };
}

export class BrowserFanout {
  readonly #clients = new Set<BrowserSocket>();
  readonly #maximumClients: number;
  readonly #maximumBufferedBytes: number;
  constructor(maximumClients = 100, maximumBufferedBytes = 1_000_000) {
    this.#maximumClients = maximumClients; this.#maximumBufferedBytes = maximumBufferedBytes;
  }

  add(socket: BrowserSocket, snapshot: PublicMarketSnapshot) {
    if (this.#clients.size >= this.#maximumClients) throw new Error("BROWSER_CONNECTION_CAPACITY");
    this.#clients.add(socket);
    socket.send(JSON.stringify({ type: "SNAPSHOT", cursor: snapshot.cursor, snapshot } satisfies BrowserStreamMessage));
  }

  remove(socket: BrowserSocket) { this.#clients.delete(socket); }

  publish(emission: MarketStreamEmission) {
    const message = JSON.stringify({ type: "UPDATE", cursor: streamCursor(emission), emission } satisfies BrowserStreamMessage);
    for (const client of this.#clients) {
      try {
        if ((client.bufferedAmount ?? 0) > this.#maximumBufferedBytes) throw new Error("BACKPRESSURE");
        client.send(message);
      } catch {
        this.#clients.delete(client);
        try { client.close(1013, "stream backpressure"); } catch { /* closed */ }
      }
    }
  }

  get size() { return this.#clients.size; }
}
