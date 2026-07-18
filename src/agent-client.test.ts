import { afterEach, describe, expect, it, vi } from "vitest";
import type { TurnRequest } from "./shared/agent-contract";
import { requestAgentTurn } from "./agent-client";

const request: TurnRequest = {
  turn: "scout",
  scenarioId: "enrollment-incident",
  sessionId: "019f7501-41c2-7ab0-8cab-a62e8a3a7f8b",
  directive: {
    objective: "Identify why valid enrollments are being rejected.",
    boundary: "Read only. Do not change code or production settings.",
    doneWhen: "A likely cause is supported by a file, test, and log.",
    evidence: "Return the file path, test name, and log signature.",
  },
  authorizedEvidenceIds: [],
  events: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("agent client", () => {
  it("uses the verified replay when a static host has no API route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const result = await requestAgentTurn(request);

    expect(result.mode).toBe("fallback");
    expect(result.notice).toMatch(/Static replay mode/);
    expect(result.evidence.map((item) => item.id)).toEqual([
      "file.retry",
      "test.east",
      "log.duplicate",
    ]);
  });

  it("does not turn an intentional abort into a replay", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Stopped", "AbortError")),
    );

    await expect(requestAgentTurn(request)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
