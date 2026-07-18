import type {
  Coaching,
  EvidenceItem,
  ToolEvent,
  TurnResult,
} from "./shared/agent-contract";

export type RoleId = "scout" | "builder" | "verifier";

export type Stage =
  | "briefing"
  | "scout-working"
  | "scout-ready"
  | "builder-working"
  | "conflict"
  | "builder-revising"
  | "conflict-resolved"
  | "verifying"
  | "verified"
  | "debrief-loading"
  | "debrief";

export type DirectiveStatus =
  | "working"
  | "evidence-ready"
  | "blocked"
  | "resolved"
  | "verified";

export interface DirectiveDraft {
  objective: string;
  boundary: string;
  doneWhen: string;
  evidence: string;
}

export interface Directive extends DirectiveDraft {
  id: string;
  role: RoleId;
  status: DirectiveStatus;
  shortLabel: string;
  timestamp: string;
}

export interface IncidentEvent {
  id: string;
  time: string;
  label: string;
  active: boolean;
}

export interface Briefing {
  eyebrow: string;
  title: string;
  body: string;
  evidence?: string[];
  actionLabel?: string;
}

export interface ScenarioState {
  stage: Stage;
  directives: Directive[];
  incidents: IncidentEvent[];
  briefing: Briefing;
  archivedReports: number;
  announcement: string;
  evidence: EvidenceItem[];
  toolEvents: ToolEvent[];
  coaching: Coaching | null;
  runtimeMode: "live" | "fallback" | null;
  runtimeNotice: string | null;
}

export type ScenarioAction =
  | { type: "issue-scout"; draft: DirectiveDraft }
  | { type: "scout-complete"; result?: TurnResult }
  | { type: "handoff-builder" }
  | { type: "surface-conflict" }
  | { type: "begin-builder-revision" }
  | { type: "builder-complete"; result?: TurnResult }
  | { type: "request-verification" }
  | { type: "verification-complete"; result?: TurnResult }
  | { type: "end-drill" }
  | { type: "debrief-complete"; result?: TurnResult }
  | { type: "reset" };

export const roleDetails: Record<
  RoleId,
  { name: string; permission: string; purpose: string }
> = {
  scout: {
    name: "Scout",
    permission: "Read only",
    purpose: "Find the cause and cite evidence.",
  },
  builder: {
    name: "Builder",
    permission: "Isolated write access",
    purpose: "Make the smallest justified change.",
  },
  verifier: {
    name: "Verifier",
    permission: "Independent read only",
    purpose: "Challenge the claim and prove the result.",
  },
};

export const exampleDraft: DirectiveDraft = {
  objective: "Identify why valid enrollments are being rejected.",
  boundary: "Read only. Do not change code or production settings.",
  doneWhen: "One likely cause is tied to a file, failing test, and observed log.",
  evidence: "File path, test name, and matching log signature.",
};

const initialBriefing: Briefing = {
  eyebrow: "Your first decision",
  title: "Find the cause before anyone changes code.",
  body:
    "Direct Scout to investigate. A useful directive defines the objective, boundary, completion condition, and proof you expect back.",
};

export const initialState: ScenarioState = {
  stage: "briefing",
  directives: [],
  incidents: [
    {
      id: "incident-1",
      time: "00:00",
      label: "Valid enrollment requests are being rejected in two regions.",
      active: true,
    },
  ],
  briefing: initialBriefing,
  archivedReports: 0,
  announcement: "Drill ready. Direct Scout to investigate the enrollment failure.",
  evidence: [],
  toolEvents: [],
  coaching: null,
  runtimeMode: null,
  runtimeNotice: null,
};

function resultState(state: ScenarioState, result?: TurnResult) {
  return result
    ? {
        evidence: [
          ...state.evidence,
          ...result.evidence.filter(
            (candidate) =>
              !state.evidence.some((item) => item.id === candidate.id),
          ),
        ],
        toolEvents: result.toolEvents,
        runtimeMode: result.mode,
        runtimeNotice: result.notice,
      }
    : {};
}

function updateDirective(
  directives: Directive[],
  id: string,
  update: Partial<Directive>,
): Directive[] {
  return directives.map((directive) =>
    directive.id === id ? { ...directive, ...update } : directive,
  );
}

function activateLatest(incidents: IncidentEvent[]): IncidentEvent[] {
  return incidents.map((incident, index) => ({
    ...incident,
    active: index === incidents.length - 1,
  }));
}

export function scenarioReducer(
  state: ScenarioState,
  action: ScenarioAction,
): ScenarioState {
  switch (action.type) {
    case "issue-scout": {
      if (state.stage !== "briefing") return state;

      return {
        ...state,
        stage: "scout-working",
        directives: [
          {
            ...action.draft,
            id: "S1",
            role: "scout",
            status: "working",
            shortLabel: "Trace rejected enrollments",
            timestamp: "00:18",
          },
        ],
        briefing: {
          eyebrow: "Scout is investigating",
          title: "The boundary is holding.",
          body:
            "Scout can inspect the fixture and run read-only checks, but cannot change the implementation.",
        },
        announcement:
          "Directive issued to Scout with a read-only boundary. Investigation started.",
      };
    }

    case "scout-complete": {
      if (state.stage !== "scout-working") return state;

      const title = action.result?.title ?? "Scout found a retry-path mismatch.";
      const body =
        action.result?.summary ??
        "The East region rejects replayed requests before the idempotency key is attached. Hand the bounded finding to Builder without widening the task.";
      const evidence = action.result?.evidence.map((item) => item.label) ?? [
        "src/enrollment/retry.ts:48",
        "retry-region-east.test.ts",
        "ENROLL_DUPLICATE_KEY",
      ];

      return {
        ...state,
        ...resultState(state, action.result),
        stage: "scout-ready",
        directives: updateDirective(state.directives, "S1", {
          status: "evidence-ready",
        }),
        briefing: {
          eyebrow: "Evidence requires a decision",
          title,
          body,
          evidence,
          actionLabel: action.result?.nextDecision.action ?? "Hand evidence to Builder",
        },
        announcement:
          "Scout returned three evidence items. Review them before assigning Builder.",
      };
    }

    case "handoff-builder": {
      if (state.stage !== "scout-ready") return state;

      return {
        ...state,
        stage: "builder-working",
        directives: [
          ...state.directives,
          {
            id: "B1",
            role: "builder",
            status: "working",
            shortLabel: "Prepare bounded retry fix",
            timestamp: "01:42",
            objective: "Attach the idempotency key before the East retry check.",
            boundary: "Change only the isolated retry fixture.",
            doneWhen: "The regional retry test passes without changing West behavior.",
            evidence: "Patch plus East and West retry test output.",
          },
        ],
        briefing: {
          eyebrow: "Builder is preparing the change",
          title: "The evidence has a clean owner.",
          body:
            "Builder is working in an isolated copy. Verification still belongs to a different role.",
        },
        archivedReports: 1,
        announcement:
          "Evidence handed to Builder. Builder is preparing a bounded change.",
      };
    }

    case "surface-conflict": {
      if (state.stage !== "builder-working") return state;

      const incidents = [
        ...state.incidents.map((incident) => ({ ...incident, active: false })),
        {
          id: "incident-2",
          time: "02:08",
          label:
            "New evidence: West uses the same retry path but is not failing.",
          active: true,
        },
      ];

      return {
        ...state,
        stage: "conflict",
        directives: updateDirective(state.directives, "B1", {
          status: "blocked",
        }),
        incidents,
        briefing: {
          eyebrow: "Conflict — learner decision required",
          title: "Do not authorize the change yet.",
          body:
            "Scout's cause does not explain why the same path works in West. Resolve the regional discrepancy before Builder continues.",
          evidence: ["East: feature.retry_v2 = on", "West: feature.retry_v2 = off"],
          actionLabel: "Resolve the discrepancy",
        },
        announcement:
          "Conflicting regional evidence blocked Builder. Your decision is required.",
        evidence: [
          ...state.evidence,
          {
            id: "config.east",
            label: "East configuration",
            detail: "feature.retry_v2 is enabled in East.",
          },
          {
            id: "config.west",
            label: "West configuration",
            detail: "feature.retry_v2 is disabled in West.",
          },
        ],
        toolEvents: [],
      };
    }

    case "begin-builder-revision": {
      if (state.stage !== "conflict") return state;

      return {
        ...state,
        stage: "builder-revising",
        briefing: {
          eyebrow: "Builder is revising the bounded change",
          title: "The regional difference is now part of the task.",
          body:
            "Builder may prepare a change using the East and West configuration evidence. Independent verification remains a separate decision.",
        },
        announcement:
          "Regional discrepancy authorized for Builder review. A bounded change is being prepared.",
        toolEvents: [],
      };
    }

    case "builder-complete": {
      if (state.stage !== "builder-revising") return state;

      return {
        ...state,
        ...resultState(state, action.result),
        stage: "conflict-resolved",
        directives: updateDirective(state.directives, "B1", {
          status: "resolved",
          shortLabel: "Guard retry_v2 idempotency path",
        }),
        briefing: {
          eyebrow: "Change prepared — not yet verified",
          title: action.result?.title ?? "Builder addressed the regional difference.",
          body:
            action.result?.summary ??
            "The patch is ready in the isolated fixture. Ask Verifier for independent proof before treating the incident as resolved.",
          evidence: action.result?.evidence.map((item) => item.label) ?? [
            "retry-v2-guard.patch",
            "East + West fixture tests: 14 passed",
          ],
          actionLabel:
            action.result?.nextDecision.action ?? "Request independent verification",
        },
        announcement:
          "Regional discrepancy resolved. The change is prepared but remains unverified.",
      };
    }

    case "request-verification": {
      if (state.stage !== "conflict-resolved") return state;

      return {
        ...state,
        stage: "verifying",
        directives: [
          ...state.directives,
          {
            id: "V1",
            role: "verifier",
            status: "working",
            shortLabel: "Prove both regional paths",
            timestamp: "03:16",
            objective: "Independently verify the fix across East and West.",
            boundary: "Read only. Do not edit Builder's patch.",
            doneWhen: "Replay and first-attempt requests pass in both regions.",
            evidence: "Test names, results, and remaining risk.",
          },
        ],
        briefing: {
          eyebrow: "Verifier is checking the claim",
          title: "Independent proof is in progress.",
          body:
            "Verifier receives the expected behavior and evidence request, not Builder's conclusion.",
        },
        archivedReports: 2,
        announcement:
          "Independent verification requested. Verifier is running read-only checks.",
      };
    }

    case "verification-complete": {
      if (state.stage !== "verifying") return state;

      return {
        ...state,
        ...resultState(state, action.result),
        stage: "verified",
        directives: updateDirective(state.directives, "V1", {
          status: "verified",
        }),
        incidents: activateLatest(state.incidents),
        briefing: {
          eyebrow: "Evidence verified",
          title:
            action.result?.title ?? "The incident claim now has independent proof.",
          body:
            action.result?.summary ??
            "Verifier confirmed replay and first-attempt requests in East and West. One low-risk follow-up remains for production monitoring.",
          evidence: action.result?.evidence.map((item) => item.label) ?? [
            "region-retry.matrix: 8/8 passed",
            "enrollment-smoke.test: 6/6 passed",
          ],
          actionLabel: action.result?.nextDecision.action ?? "End drill and review",
        },
        announcement:
          "Verification complete. Both regional paths passed independent checks.",
      };
    }

    case "end-drill": {
      if (state.stage !== "verified") return state;
      return {
        ...state,
        stage: "debrief-loading",
        briefing: {
          eyebrow: "Coach is reviewing the decision trail",
          title: "The evidence-linked debrief is being prepared.",
          body:
            "The coach may explain the learner's decisions, but it cannot invent evidence or replace the recorded event trail.",
        },
        toolEvents: [],
        announcement:
          "Evidence verified. Coach is preparing the evidence-linked debrief.",
      };
    }

    case "debrief-complete": {
      if (state.stage !== "debrief-loading") return state;
      return {
        ...state,
        ...resultState(state, action.result),
        stage: "debrief",
        coaching: action.result?.coaching ?? null,
        announcement:
          "Drill complete. Review one strong decision, one correction, and a stronger directive.",
      };
    }

    case "reset":
      return initialState;

    default:
      return state;
  }
}

export function isDraftComplete(draft: DirectiveDraft): boolean {
  return Object.values(draft).every((value) => value.trim().length >= 8);
}
