// One trace for every client. A tool (the Node scripts, with TRACE=1) installs a sink; each client
// (vta-client, vtc-client, tsp-client) reports every call to it. No sink installed = no cost. Browser-safe: no file access here.
// The sink lives on globalThis under a registered symbol so separate packages share it without depending on each other.

export interface TraceEvent {
  /** ISO time the call started. */
  ts: string;
  /** Which client made the call. */
  source: "vta" | "vtc" | "tsp" | (string & {});
  transport: "rest" | "tsp" | (string & {});
  /** Trust Task type URI, or `GET <path>` / `POST <path>` for plain REST calls. */
  type: string;
  /** The signed document's id, when there is one. */
  id?: string;
  from?: string;
  to?: string;
  status?: number;
  ok: boolean;
  /** The refusal code, or `network` / `timeout`. */
  code?: string;
  ms: number;
}

export const TRACE_KEY = Symbol.for("buildathon.trace");
type Sink = (e: TraceEvent) => void;

export function setTraceSink(sink: Sink | undefined): void {
  (globalThis as Record<symbol, unknown>)[TRACE_KEY] = sink;
}

/** Report one call. Never throws: a tracer must not break a call. */
export function emitTrace(e: TraceEvent): void {
  try { ((globalThis as Record<symbol, unknown>)[TRACE_KEY] as Sink | undefined)?.(e); } catch { /* ignore */ }
}
