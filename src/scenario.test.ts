import {
  exampleDraft,
  initialState,
  isDraftComplete,
  scenarioReducer,
} from "./scenario";

describe("scenarioReducer", () => {
  it("starts with one incident and empty directive lanes", () => {
    expect(initialState.stage).toBe("briefing");
    expect(initialState.incidents).toHaveLength(1);
    expect(initialState.directives).toHaveLength(0);
  });

  it("preserves the learner's four-part directive", () => {
    const state = scenarioReducer(initialState, {
      type: "issue-scout",
      draft: exampleDraft,
    });

    expect(state.stage).toBe("scout-working");
    expect(state.directives[0]).toMatchObject({
      role: "scout",
      objective: exampleDraft.objective,
      boundary: exampleDraft.boundary,
      doneWhen: exampleDraft.doneWhen,
      evidence: exampleDraft.evidence,
    });
  });

  it("blocks Builder when regional evidence conflicts", () => {
    let state = scenarioReducer(initialState, {
      type: "issue-scout",
      draft: exampleDraft,
    });
    state = scenarioReducer(state, { type: "scout-complete" });
    state = scenarioReducer(state, { type: "handoff-builder" });
    state = scenarioReducer(state, { type: "surface-conflict" });

    expect(state.stage).toBe("conflict");
    expect(state.directives.find((directive) => directive.id === "B1")?.status).toBe(
      "blocked",
    );
    expect(state.briefing.title).toContain("Do not authorize");
  });

  it("cannot verify without the learner requesting an independent verifier", () => {
    const state = scenarioReducer(initialState, {
      type: "verification-complete",
    });

    expect(state).toBe(initialState);
  });

  it("requires conflict resolution, independent verification, and coaching in order", () => {
    let state = scenarioReducer(initialState, {
      type: "issue-scout",
      draft: exampleDraft,
    });
    state = scenarioReducer(state, { type: "scout-complete" });
    state = scenarioReducer(state, { type: "handoff-builder" });
    state = scenarioReducer(state, { type: "surface-conflict" });
    state = scenarioReducer(state, { type: "begin-builder-revision" });
    expect(state.stage).toBe("builder-revising");

    state = scenarioReducer(state, { type: "builder-complete" });
    state = scenarioReducer(state, { type: "request-verification" });
    expect(state.stage).toBe("verifying");

    state = scenarioReducer(state, { type: "verification-complete" });
    state = scenarioReducer(state, { type: "end-drill" });
    expect(state.stage).toBe("debrief-loading");

    state = scenarioReducer(state, { type: "debrief-complete" });
    expect(state.stage).toBe("debrief");
  });
});

describe("isDraftComplete", () => {
  it("requires all four directive fields", () => {
    expect(isDraftComplete(exampleDraft)).toBe(true);
    expect(isDraftComplete({ ...exampleDraft, boundary: "" })).toBe(false);
  });
});
