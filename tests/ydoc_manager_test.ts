/**
 * Tests for ydoc-manager.ts — Y.js document persistence to disk as binary
 * update logs, and the seed-from-file-body behaviour on first load.
 */

import { assertEquals, assertFalse } from "@std/assert";
import { createStorage } from "@dune/core";
import {
  deleteYDoc,
  encodeSourcePath,
  getDocBody,
  loadYDoc,
  persistYDoc,
} from "../src/ydoc-manager.ts";

function makeEnv() {
  const rootDir = Deno.makeTempDirSync();
  const storage = createStorage({ rootDir });
  return { rootDir, storage, dataDir: "data" };
}

Deno.test("loadYDoc: with no persisted state, seeds the doc from the initial body", async () => {
  const { rootDir, storage, dataDir } = makeEnv();
  const doc = await loadYDoc(
    dataDir,
    "01.page/default.md",
    "Seeded content.",
    storage,
  );
  assertEquals(getDocBody(doc), "Seeded content.");
  Deno.removeSync(rootDir, { recursive: true });
});

Deno.test("loadYDoc: compacts on first load by writing the state back to disk", async () => {
  const { rootDir, storage, dataDir } = makeEnv();
  await loadYDoc(dataDir, "01.page/default.md", "Seeded content.", storage);
  const exists = await storage.exists(
    `${dataDir}/ydoc/${encodeSourcePath("01.page/default.md")}.bin`,
  );
  assertEquals(exists, true);
  Deno.removeSync(rootDir, { recursive: true });
});

Deno.test("persistYDoc + loadYDoc: round-trips edited content across a reload, ignoring initialBody", async () => {
  const { rootDir, storage, dataDir } = makeEnv();
  const sourcePath = "01.page/default.md";

  const doc = await loadYDoc(dataDir, sourcePath, "Original.", storage);
  doc.transact(() => {
    doc.getText("body").delete(0, doc.getText("body").length);
    doc.getText("body").insert(0, "Edited and persisted.");
  });
  await persistYDoc(dataDir, sourcePath, doc, storage);

  // A second load must resume from the persisted draft, not re-seed from
  // initialBody — this is what lets an editor reconnect without losing
  // unsaved changes.
  const reloaded = await loadYDoc(dataDir, sourcePath, "Original.", storage);
  assertEquals(getDocBody(reloaded), "Edited and persisted.");
  Deno.removeSync(rootDir, { recursive: true });
});

Deno.test("deleteYDoc: removes the persisted binary", async () => {
  const { rootDir, storage, dataDir } = makeEnv();
  const sourcePath = "01.page/default.md";
  await loadYDoc(dataDir, sourcePath, "Content.", storage);

  await deleteYDoc(dataDir, sourcePath, storage);

  const exists = await storage.exists(
    `${dataDir}/ydoc/${encodeSourcePath(sourcePath)}.bin`,
  );
  assertFalse(exists);
  Deno.removeSync(rootDir, { recursive: true });
});

Deno.test("deleteYDoc: is a no-op (does not throw) when nothing was persisted", async () => {
  const { rootDir, storage, dataDir } = makeEnv();
  await deleteYDoc(dataDir, "01.never-loaded/default.md", storage);
  Deno.removeSync(rootDir, { recursive: true });
});

Deno.test("encodeSourcePath: slashes are percent-encoded, not collapsed to a separator that could collide", () => {
  assertEquals(encodeSourcePath("foo/bar.md"), "foo%2Fbar.md");
  // A literal "foo__bar.md" file must not collide with the encoded form of "foo/bar.md".
  assertEquals(
    encodeSourcePath("foo__bar.md") === encodeSourcePath("foo/bar.md"),
    false,
  );
});
