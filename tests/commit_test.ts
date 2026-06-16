/**
 * Tests for commit.ts — the "Save" action that flushes a Y.js document body
 * (or a frontmatter patch) to the content file on disk via the history engine.
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Y from "yjs";
import { createHistoryEngine, createStorage } from "@dune/core";
import {
  commitDoc,
  patchFrontmatterFields,
  spliceBody,
  spliceFrontmatter,
  splitFile,
} from "../src/commit.ts";

// ── splitFile / spliceBody / spliceFrontmatter (pure) ───────────────────────

Deno.test("splitFile: separates YAML frontmatter from body", () => {
  const raw = "---\ntitle: Hello\ntags:\n  - a\n  - b\n---\nBody text here.\n";
  const { header, frontmatter, body } = splitFile(raw);
  assertEquals(header, "---\ntitle: Hello\ntags:\n  - a\n  - b\n---\n");
  assertEquals(frontmatter, { title: "Hello", tags: ["a", "b"] });
  assertEquals(body, "Body text here.\n");
});

Deno.test("splitFile: file with no frontmatter returns empty header", () => {
  const raw = "Just a body, no frontmatter.";
  const { header, frontmatter, body } = splitFile(raw);
  assertEquals(header, "");
  assertEquals(frontmatter, {});
  assertEquals(body, raw);
});

Deno.test("splitFile: malformed YAML frontmatter degrades to empty object, not a throw", () => {
  const raw = "---\ntitle: [unterminated\n---\nBody.\n";
  const { frontmatter, body } = splitFile(raw);
  assertEquals(frontmatter, {});
  assertEquals(body, "Body.\n");
});

Deno.test("spliceBody: preserves header and joins with a single newline", () => {
  const header = "---\ntitle: X\n---\n";
  assertEquals(spliceBody(header, "New body"), "---\ntitle: X\n---\nNew body");
});

Deno.test("spliceBody: empty header returns body unchanged", () => {
  assertEquals(spliceBody("", "New body"), "New body");
});

Deno.test("spliceFrontmatter: replaces only the given keys, leaves others and body intact", () => {
  const raw = "---\ntitle: Old\nauthor: Ada\n---\nBody unchanged.\n";
  const updated = spliceFrontmatter(raw, { title: "New" });
  const { frontmatter, body } = splitFile(updated);
  assertEquals(frontmatter, { title: "New", author: "Ada" });
  assertEquals(body, "Body unchanged.\n");
});

// ── commitDoc (integration: real storage + real history engine) ────────────

function makeEnv() {
  const rootDir = Deno.makeTempDirSync();
  const storage = createStorage({ rootDir });
  const history = createHistoryEngine({ storage, dataDir: "data" });
  return { rootDir, storage, history, contentDir: "content" };
}

Deno.test("commitDoc: writes the Y.Doc body to disk, preserving frontmatter", async () => {
  const { rootDir, storage, history, contentDir } = makeEnv();
  const sourcePath = "01.page/default.md";

  await storage.write(
    `${contentDir}/${sourcePath}`,
    "---\ntitle: Page\n---\nOriginal body.\n",
  );

  const doc = new Y.Doc();
  doc.transact(() => {
    doc.getText("body").insert(0, "Edited body from the editor.");
  });

  await commitDoc({
    doc,
    sourcePath,
    author: "alice",
    storage,
    history,
    contentDir,
  });

  const onDisk = await storage.readText(`${contentDir}/${sourcePath}`);
  assertEquals(onDisk, "---\ntitle: Page\n---\nEdited body from the editor.");
  Deno.removeSync(rootDir, { recursive: true });
});

Deno.test("commitDoc: records a history revision with the committed content", async () => {
  const { rootDir, storage, history, contentDir } = makeEnv();
  const sourcePath = "01.page/default.md";
  await storage.write(
    `${contentDir}/${sourcePath}`,
    "---\ntitle: Page\n---\nOriginal.\n",
  );

  const doc = new Y.Doc();
  doc.transact(() => doc.getText("body").insert(0, "Revised."));
  await commitDoc({
    doc,
    sourcePath,
    author: "alice",
    storage,
    history,
    contentDir,
  });

  const latest = await history.getLatest(sourcePath);
  assertExists(latest);
  assertEquals(latest!.author, "alice");
  assertEquals(latest!.content, "---\ntitle: Page\n---\nRevised.");
  assertEquals(latest!.frontmatter, { title: "Page" });
  Deno.removeSync(rootDir, { recursive: true });
});

Deno.test("commitDoc: works for a brand-new draft with no existing file", async () => {
  const { rootDir, storage, history, contentDir } = makeEnv();
  const sourcePath = "01.new/default.md";

  const doc = new Y.Doc();
  doc.transact(() => doc.getText("body").insert(0, "Fresh content."));
  await commitDoc({
    doc,
    sourcePath,
    author: "bob",
    storage,
    history,
    contentDir,
  });

  const onDisk = await storage.readText(`${contentDir}/${sourcePath}`);
  assertEquals(onDisk, "Fresh content.");
  Deno.removeSync(rootDir, { recursive: true });
});

// ── patchFrontmatterFields (integration) ─────────────────────────────────────

Deno.test("patchFrontmatterFields: patches a field without touching the body", async () => {
  const { rootDir, storage, history, contentDir } = makeEnv();
  const sourcePath = "01.page/default.md";
  await storage.write(
    `${contentDir}/${sourcePath}`,
    "---\ntitle: Old Title\n---\nBody text.\n",
  );

  await patchFrontmatterFields({
    sourcePath,
    fields: { title: "New Title" },
    author: "carol",
    storage,
    history,
    contentDir,
  });

  const onDisk = await storage.readText(`${contentDir}/${sourcePath}`);
  const { frontmatter, body } = splitFile(onDisk);
  assertEquals(frontmatter, { title: "New Title" });
  assertEquals(body, "Body text.\n");
  Deno.removeSync(rootDir, { recursive: true });
});

Deno.test("patchFrontmatterFields: __body replaces the body via the auto-overlay path", async () => {
  const { rootDir, storage, history, contentDir } = makeEnv();
  const sourcePath = "01.page/default.md";
  await storage.write(
    `${contentDir}/${sourcePath}`,
    "---\ntitle: Page\n---\nOld body.\n",
  );

  await patchFrontmatterFields({
    sourcePath,
    fields: { __body: "Replaced body via overlay." },
    author: "dave",
    storage,
    history,
    contentDir,
  });

  const onDisk = await storage.readText(`${contentDir}/${sourcePath}`);
  const { frontmatter, body } = splitFile(onDisk);
  assertEquals(frontmatter, { title: "Page" });
  assertEquals(body, "Replaced body via overlay.");

  const latest = await history.getLatest(sourcePath);
  assertEquals(latest!.message, "Body update (auto-overlay)");
  Deno.removeSync(rootDir, { recursive: true });
});
