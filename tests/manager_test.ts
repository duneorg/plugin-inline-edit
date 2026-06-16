/**
 * End-to-end tests for InlineEditManager: a real WebSocket client talks the
 * y-websocket wire protocol to a real `Deno.serve` instance wrapping
 * `manager.handleUpgrade`, edits a document, and we verify the edit actually
 * lands on disk — both via an explicit commit() and via the auto-flush path
 * that runs when the last client disconnects without saving.
 */

import { assertEquals } from "@std/assert";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { createHistoryEngine, createStorage } from "@dune/core";
import { createInlineEditManager } from "../src/manager.ts";
import { encodeSourcePath } from "../src/ydoc-manager.ts";

const MESSAGE_SYNC = 0;

// ── Wire-protocol helpers (mirror src/ws-server.ts on the client side) ─────

function encodeUpdateMessage(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function encodeSyncStep1Message(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

/** Apply an incoming server frame (sync step 1 or step 2) to a client doc. */
function applyServerFrame(doc: Y.Doc, frame: Uint8Array): void {
  const decoder = decoding.createDecoder(frame);
  const messageType = decoding.readVarUint(decoder);
  if (messageType === MESSAGE_SYNC) {
    const replyEncoder = encoding.createEncoder();
    encoding.writeVarUint(replyEncoder, MESSAGE_SYNC);
    syncProtocol.readSyncMessage(decoder, replyEncoder, doc, null);
  }
}

/** Queues every message event so messages aren't lost before a consumer asks for them. */
function queueMessages(
  socket: WebSocket,
): { next(): Promise<Uint8Array>; nextSync(): Promise<Uint8Array> } {
  const queue: Uint8Array[] = [];
  const waiters: Array<(data: Uint8Array) => void> = [];
  socket.addEventListener("message", (event) => {
    const data = event.data instanceof ArrayBuffer
      ? new Uint8Array(event.data)
      : event.data as Uint8Array;
    const waiter = waiters.shift();
    if (waiter) waiter(data);
    else queue.push(data);
  });
  function next(): Promise<Uint8Array> {
    const queued = queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => waiters.push(resolve));
  }
  return {
    next,
    // Every connection also gets an unsolicited MESSAGE_AWARENESS frame —
    // the y-protocols Awareness constructor calls setLocalState({}) on the
    // server's own doc, so awareness.getStates() is never empty even for a
    // brand-new session. Skip non-sync frames rather than assuming a fixed
    // position for the sync replies we actually care about in tests.
    async nextSync(): Promise<Uint8Array> {
      while (true) {
        const frame = await next();
        const messageType = decoding.readVarUint(decoding.createDecoder(frame));
        if (messageType === MESSAGE_SYNC) return frame;
      }
    },
  };
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve) =>
    socket.addEventListener("open", () => resolve(), { once: true })
  );
}

function waitForClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve) =>
    socket.addEventListener("close", () => resolve(), { once: true })
  );
}

// ── Test environment ────────────────────────────────────────────────────────

function makeEnv() {
  const rootDir = Deno.makeTempDirSync();
  const storage = createStorage({ rootDir });
  const history = createHistoryEngine({ storage, dataDir: "data" });
  return { rootDir, storage, history, dataDir: "data", contentDir: "content" };
}

function startServer(
  manager: {
    handleUpgrade(req: Request, user: { id: string; name: string }): Response;
  },
) {
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    (req) => manager.handleUpgrade(req, { id: "u1", name: "Tester" }),
  );
  const port = (server.addr as Deno.NetAddr).port;
  return { server, port };
}

async function connectAndSync(port: number, sourcePath: string) {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}/edit?path=${encodeURIComponent(sourcePath)}`,
  );
  socket.binaryType = "arraybuffer";
  const messages = queueMessages(socket);
  await waitForOpen(socket);

  // Every new connection immediately receives sync step 1 + step 2 (and,
  // separately, an awareness frame that nextSync() filters out for us).
  const clientDoc = new Y.Doc();
  applyServerFrame(clientDoc, await messages.nextSync());
  applyServerFrame(clientDoc, await messages.nextSync());

  return { socket, messages, clientDoc };
}

/**
 * Edit the body of an already-synced client doc and block until the server
 * confirms it processed the resulting update.
 *
 * Edits must happen on the same `clientDoc` returned by `connectAndSync` —
 * not a fresh, unrelated `Y.Doc` — because Y.js merges concurrent replicas
 * by CRDT position rather than "replace". Two independently-created docs
 * that both insert at position 0 concatenate when merged instead of one
 * replacing the other; a real editor instance edits the very doc it synced
 * from the server, so a delete-then-insert on that doc is what actually
 * produces a clean replacement once merged back in.
 */
async function editAndConfirm(
  socket: WebSocket,
  messages: { nextSync(): Promise<Uint8Array> },
  clientDoc: Y.Doc,
  editedBody: string,
) {
  clientDoc.transact(() => {
    const text = clientDoc.getText("body");
    text.delete(0, text.length);
    text.insert(0, editedBody);
  });
  socket.send(encodeUpdateMessage(Y.encodeStateAsUpdate(clientDoc)));

  // A sync-step-1 probe only gets a reply once prior messages on this same
  // connection have been processed in order, so receiving the reply proves
  // the edit above was already applied server-side.
  const probeDoc = new Y.Doc();
  socket.send(encodeSyncStep1Message(probeDoc));
  const reply = await messages.nextSync();
  applyServerFrame(probeDoc, reply);
  return probeDoc;
}

// ── Tests ────────────────────────────────────────────────────────────────────

Deno.test({
  name:
    "inline editor: an edit followed by commit() persists to the content file on disk",
  // InlineEditManager has no public dispose() — its session Awareness
  // instances are meant to live for the server process's lifetime and are
  // only cleaned up by the 5-minute idle GC, far longer than this test runs.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const { rootDir, storage, history, dataDir, contentDir } = makeEnv();
    const sourcePath = "01.page/default.md";
    await storage.write(
      `${contentDir}/${sourcePath}`,
      "---\ntitle: Page\n---\nOriginal body.\n",
    );

    const manager = createInlineEditManager({
      storage,
      history,
      dataDir,
      contentDir,
    });
    const { server, port } = await startServer(manager);

    const { socket, messages, clientDoc } = await connectAndSync(
      port,
      sourcePath,
    );
    assertEquals(clientDoc.getText("body").toString(), "Original body.\n");

    const probeDoc = await editAndConfirm(
      socket,
      messages,
      clientDoc,
      "Edited via WebSocket.",
    );
    // Confirms the edit is visible over the wire before we ever call commit().
    assertEquals(probeDoc.getText("body").toString(), "Edited via WebSocket.");

    await manager.commit(sourcePath, "alice");

    const onDisk = await storage.readText(`${contentDir}/${sourcePath}`);
    assertEquals(onDisk, "---\ntitle: Page\n---\nEdited via WebSocket.");

    const latest = await history.getLatest(sourcePath);
    assertEquals(latest?.author, "alice");

    // The draft Y.js binary is cleared once the edit is committed to the .md file.
    const draftExists = await storage.exists(
      `${dataDir}/ydoc/${encodeSourcePath(sourcePath)}.bin`,
    );
    assertEquals(draftExists, false);

    socket.close();
    await waitForClose(socket);
    await server.shutdown();
    Deno.removeSync(rootDir, { recursive: true });
  },
});

Deno.test({
  name:
    "inline editor: disconnecting without commit still persists the draft for the next session",
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const { rootDir, storage, history, dataDir, contentDir } = makeEnv();
    const sourcePath = "01.page/default.md";
    await storage.write(
      `${contentDir}/${sourcePath}`,
      "---\ntitle: Page\n---\nOriginal body.\n",
    );

    const managerA = createInlineEditManager({
      storage,
      history,
      dataDir,
      contentDir,
    });
    const { server: serverA, port: portA } = await startServer(managerA);

    const { socket, messages, clientDoc: clientDocA } = await connectAndSync(
      portA,
      sourcePath,
    );
    await editAndConfirm(
      socket,
      messages,
      clientDocA,
      "Unsaved edit, never committed.",
    );

    // Disconnect without calling commit(). The "last client left" auto-flush
    // (src/ws-server.ts onclose) persists the Y.js draft to disk.
    socket.close();
    await waitForClose(socket);
    await serverA.shutdown();

    // A fresh manager instance models a reconnect (or server restart): its
    // session map starts empty, so it must load state from the persisted
    // draft rather than re-seeding from the original file content.
    const managerB = createInlineEditManager({
      storage,
      history,
      dataDir,
      contentDir,
    });
    const { server: serverB, port: portB } = await startServer(managerB);

    const { socket: socket2, clientDoc } = await connectAndSync(
      portB,
      sourcePath,
    );
    assertEquals(
      clientDoc.getText("body").toString(),
      "Unsaved edit, never committed.",
    );

    // The content file on disk is untouched — only the in-progress draft has it.
    const onDisk = await storage.readText(`${contentDir}/${sourcePath}`);
    assertEquals(onDisk, "---\ntitle: Page\n---\nOriginal body.\n");

    socket2.close();
    await waitForClose(socket2);
    await serverB.shutdown();
    Deno.removeSync(rootDir, { recursive: true });
  },
});
