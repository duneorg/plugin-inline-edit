import { assertEquals } from "@std/assert";
import { resetWarnThrottle, warnThrottled } from "../src/log.ts";
import plugin from "../src/mod.ts";

function capture(fn: () => void): unknown[][] {
  const calls: unknown[][] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => void calls.push(a);
  try {
    fn();
  } finally {
    console.warn = orig;
  }
  return calls;
}

Deno.test("warnThrottled logs once per key per minute", () => {
  resetWarnThrottle();
  const err = new Error("boom");
  const calls = capture(() => {
    warnThrottled("k", "first", err, 1_000);
    warnThrottled("k", "second", err, 30_000); // within a minute: dropped
    warnThrottled("other", "third", err, 30_000); // different key: logged
    warnThrottled("k", "fourth", err, 62_000); // a minute later: logged
  });
  assertEquals(calls.length, 3);
  assertEquals(calls[0][0], "[inline-edit] first:");
  assertEquals(calls[0][1], err);
});

Deno.test("plugin.version matches deno.json", async () => {
  const pkg = JSON.parse(
    await Deno.readTextFile(new URL("../deno.json", import.meta.url)),
  );
  assertEquals(plugin.version, pkg.version);
});
