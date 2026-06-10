/**
 * Implementation types for the Y.js-backed inline editing manager.
 *
 * These describe internal session state and construction options; the
 * interface core consumes (`InlineEditManager`, `ActiveEditor`,
 * `DocumentPresence`) is defined by `@dune/core/inline-edit`.
 */

import type { HistoryEngine, StorageAdapter } from "@dune/core";

// ── Session ───────────────────────────────────────────────────────────────────

/** State for one active WebSocket client editing a document. */
export interface InlineEditClient {
  clientId: string;
  userId: string;
  name: string;
  /** Y.js awareness color (hex) assigned by the server. */
  color: string;
  socket: WebSocket;
}

/** In-memory state for one collaboratively-edited document. */
export interface InlineEditSession {
  /** Content path, e.g. "pages/about/default.md" */
  sourcePath: string;
  /** Serialised Y.js document state (binary, full snapshot + pending updates). */
  ydocState: Uint8Array;
  /** All currently connected clients. */
  clients: Map<string, InlineEditClient>;
  /** Timer handle for the auto-flush debounce. */
  flushTimer: ReturnType<typeof setTimeout> | undefined;
  /** Timestamp of last write activity, used for idle eviction. */
  lastActivity: number;
}

// ── Manager options ───────────────────────────────────────────────────────────

/** Options for `createInlineEditManager`. */
export interface InlineEditManagerOptions {
  storage: StorageAdapter;
  history: HistoryEngine;
  /** Base data directory, e.g. "data" — ydoc state stored under {dataDir}/ydoc/. */
  dataDir: string;
  /** Content directory, e.g. "content". Must match config.system.content.dir. */
  contentDir: string;
  /** Auto-flush after this many ms of inactivity (default 120_000 = 2 min). */
  autoFlushMs?: number;
}
