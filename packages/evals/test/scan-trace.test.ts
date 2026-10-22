import { afterEach, expect, it, vi } from "vitest";
import { logScanResponse, traceStage } from "@pomona/proxy";

afterEach(() => vi.restoreAllMocks());

it("native spans receive scan correlation attributes and preserve asynchronous results and errors", async () => {
  const setAttributes = vi.fn();
  const enterSpan = vi.fn((_name, run) => run({ setAttributes }));
  expect(await traceStage({ enterSpan }, "scan.clef", { requestId: "request-test" }, async () => 42)).toBe(42);
  expect(enterSpan.mock.calls[0][0]).toBe("scan.clef");
  expect(setAttributes).toHaveBeenCalledWith({ requestId: "request-test" });
  await expect(traceStage({ enterSpan }, "scan.gemini_or_provider", {}, async () => { throw new Error("provider failed"); }))
    .rejects.toThrow("provider failed");
});

it("large responses are reconstructable and oversized output marks truncation explicitly", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const response = { message: "a".repeat(17000) };
  logScanResponse("model_response", { requestId: "request-test" }, response);
  const events = log.mock.calls.map(args => JSON.parse(String(args[0])));
  expect(events).toHaveLength(3);
  expect(JSON.parse(events.map(event => event.responseChunk).join(""))).toEqual(response);
  expect(events.every(event => event.requestId === "request-test" && event.truncated === false)).toBe(true);
  log.mockClear();
  logScanResponse("model_response", { requestId: "request-test" }, { message: "a".repeat(70000) });
  expect(log.mock.calls).toHaveLength(8);
  expect(JSON.parse(String(log.mock.calls[0][0])).truncated).toBe(true);
});
