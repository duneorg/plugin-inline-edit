/// <reference lib="dom" />
/**
 * Browser editor module — bundled by Dune core via `DunePlugin.clientEntries`
 * and served at `/plugins/inline-edit/editor.js`. Lazy-imported by the
 * injected admin-bar script when an admin starts a body edit; never loaded
 * for anonymous visitors or while merely browsing.
 *
 * Editing model:
 *
 * - The canonical document is the Y.js shared text `"body"` holding the raw
 *   **markdown source** (see ydoc-manager.ts / commit.ts on the server).
 * - TipTap (with tiptap-markdown) provides WYSIWYG editing over that source.
 *   Local changes are serialised to markdown (debounced) and applied to the
 *   Y.Text as a minimal prefix/suffix diff; remote Y.Text changes re-render
 *   the editor. Concurrent edits in different regions of the page merge via
 *   the CRDT; edits to the same sentence are character-merged by Y.Text.
 * - The WebSocket sync speaks the standard y-websocket wire protocol that
 *   the plugin's ws-server implements (y-protocols sync + awareness), with
 *   the document addressed by `?path=` — no y-websocket client dependency.
 * - If the WebSocket cannot connect, the editor degrades to standalone mode:
 *   editing works, presence and live merge don't, and the caller saves via
 *   the fields API instead of the collab commit.
 */

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const LOCAL_ORIGIN = "local-editor";
const SYNC_DEBOUNCE_MS = 400;

/** A connected peer (another admin editing the same document). */
export interface Peer {
  name: string;
  color: string;
}

export interface MountOptions {
  /** Element the TipTap editor mounts into. */
  element: HTMLElement;
  /** WebSocket URL including the `?path=` parameter. */
  wsUrl: string;
  /** Markdown to edit when the WebSocket is unavailable (standalone mode). */
  fallbackMarkdown: string;
  /** Display name for presence. */
  userName: string;
  /** Called when the set of other connected editors changes. */
  onPeersChange?: (peers: Peer[]) => void;
  /** Called when connection state changes. */
  onConnection?: (connected: boolean) => void;
}

export interface EditorHandle {
  /** Resolves when the editor is ready for input (synced or standalone). */
  ready: Promise<void>;
  /** True while the Y.js WebSocket sync is connected. */
  isConnected(): boolean;
  /** Current markdown serialisation of the editor content. */
  getMarkdown(): string;
  /** Immediately write pending local changes into the shared document. */
  flushToDoc(): void;
  /** Destroy the editor and close the connection. */
  destroy(): void;
}

/** Apply `next` to a Y.Text as a minimal prefix/suffix diff transaction. */
function applyTextDiff(ytext: Y.Text, next: string): void {
  const prev = ytext.toString();
  if (prev === next) return;
  let start = 0;
  const minLen = Math.min(prev.length, next.length);
  while (start < minLen && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  const doc = ytext.doc;
  const run = () => {
    if (endPrev > start) ytext.delete(start, endPrev - start);
    if (endNext > start) ytext.insert(start, next.slice(start, endNext));
  };
  if (doc) doc.transact(run, LOCAL_ORIGIN);
  else run();
}

export function mountBodyEditor(opts: MountOptions): EditorHandle {
  const doc = new Y.Doc();
  const ytext = doc.getText("body");
  const awareness = new awarenessProtocol.Awareness(doc);

  let editor: Editor | null = null;
  let socket: WebSocket | null = null;
  let connected = false;
  let destroyed = false;
  let applyingRemote = false;
  let syncTimer: number | undefined;

  let resolveReady!: () => void;
  const ready = new Promise<void>((r) => (resolveReady = r));
  let readyResolved = false;
  const markReady = () => {
    if (!readyResolved) {
      readyResolved = true;
      resolveReady();
    }
  };

  // ── Editor ──────────────────────────────────────────────────────────────────

  function createEditor(initialMarkdown: string): void {
    if (destroyed) return;
    editor = new Editor({
      element: opts.element,
      content: initialMarkdown,
      extensions: [
        StarterKit,
        Markdown.configure({ html: false, transformPastedText: true }),
      ],
      onUpdate() {
        if (applyingRemote) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(flushToDoc, SYNC_DEBOUNCE_MS);
      },
    });
    editor.commands.focus();
    markReady();
  }

  function getMarkdown(): string {
    // deno-lint-ignore no-explicit-any
    return editor ? (editor.storage as any).markdown.getMarkdown() : "";
  }

  function flushToDoc(): void {
    clearTimeout(syncTimer);
    if (!editor) return;
    applyTextDiff(ytext, getMarkdown());
  }

  // Remote document changes re-render the editor. Cursor position is
  // restored by offset (clamped) — coarse, but stable for edits in other
  // regions of the document.
  ytext.observe((_event, txn) => {
    if (txn.origin === LOCAL_ORIGIN || !editor) return;
    applyingRemote = true;
    try {
      const pos = editor.state.selection.anchor;
      editor.commands.setContent(ytext.toString());
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection(Math.min(pos, max));
    } finally {
      applyingRemote = false;
    }
  });

  // ── y-websocket wire protocol ───────────────────────────────────────────────

  function send(data: Uint8Array): void {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(data);
  }

  doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    send(encoding.toUint8Array(encoder));
  });

  awareness.on("update", ({ added, updated, removed }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => {
    const changed = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
    );
    send(encoding.toUint8Array(encoder));

    if (opts.onPeersChange) {
      const peers: Peer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === doc.clientID) return;
        const user = (state as { user?: Peer }).user;
        if (user) peers.push(user);
      });
      opts.onPeersChange(peers);
    }
  });

  function connect(): void {
    socket = new WebSocket(opts.wsUrl);
    socket.binaryType = "arraybuffer";

    const fallbackTimer = setTimeout(() => {
      // No connection in time — start standalone so the admin isn't blocked.
      if (!editor) createEditor(opts.fallbackMarkdown);
    }, 3000);

    socket.onopen = () => {
      awareness.setLocalStateField("user", { name: opts.userName, color: "#3498db" });
    };

    socket.onmessage = (ev: MessageEvent) => {
      const data = new Uint8Array(ev.data as ArrayBuffer);
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);
      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const syncType = syncProtocol.readSyncMessage(decoder, encoder, doc, "remote");
        if (encoding.length(encoder) > 1) send(encoding.toUint8Array(encoder));
        // Receiving sync step 2 means we now hold the server's document state.
        if (syncType === syncProtocol.messageYjsSyncStep2 && !editor) {
          clearTimeout(fallbackTimer);
          connected = true;
          opts.onConnection?.(true);
          createEditor(ytext.toString());
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          "remote",
        );
      }
    };

    const onGone = () => {
      clearTimeout(fallbackTimer);
      if (connected) {
        connected = false;
        opts.onConnection?.(false);
      }
      if (!editor && !destroyed) createEditor(opts.fallbackMarkdown);
    };
    socket.onerror = onGone;
    socket.onclose = onGone;
  }

  connect();

  return {
    ready,
    isConnected: () => connected,
    getMarkdown,
    flushToDoc,
    destroy() {
      destroyed = true;
      clearTimeout(syncTimer);
      awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], "destroy");
      try {
        socket?.close();
      } catch { /* already closed */ }
      editor?.destroy();
      editor = null;
      doc.destroy();
    },
  };
}
