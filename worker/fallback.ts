import type {
  AgentRole,
  Coaching,
  Turn,
  TurnRequest,
  TurnResult,
} from "../src/shared/agent-contract";
import { materializeEvidence } from "./scenario-data";

const coaching: Coaching = {
  pivotalTitle: "You stopped the change when the evidence conflicted.",
  pivotalDecision: "Resolve the East/West discrepancy before Builder continues.",
  pivotalResult: "The final patch addressed the actual regional condition.",
  workedTitle: "You defined proof before asking for a change.",
  workedBody:
    "Scout returned a file, failing test, and matching log signature. Builder received a bounded handoff instead of a vague problem statement.",
  changeTitle: "Ask for regional comparison before involving Builder.",
  changeBody:
    "The first investigation explained East, but not why West succeeded. The discrepancy should be part of the initial completion condition.",
  originalDirective: "Identify why valid enrollments are being rejected.",
  strongerDirective:
    "Compare rejected requests in East with successful requests in West. Read only. Identify the first behavior difference and cite the file, test, and configuration evidence that proves it.",
};

const roleByTurn: Record<Turn, AgentRole> = {
  scout: "scout",
  builder: "builder",
  verifier: "verifier",
  debrief: "coach",
};

export function fallbackTurn(
  request: TurnRequest,
  notice: string | null = null,
): TurnResult {
  const common = {
    mode: "fallback" as const,
    model: null,
    notice,
    role: roleByTurn[request.turn],
  };

  if (request.turn === "scout") {
    return {
      ...common,
      status: "evidence_ready",
      title: "Scout found a retry-path mismatch.",
      summary:
        "East rejects replayed requests before the idempotency key is attached. The file, failing test, and matching log signature support the finding.",
      evidence: materializeEvidence(["file.retry", "test.east", "log.duplicate"]),
      toolEvents: [
        {
          id: "scout-tool-1",
          tool: "read_file",
          label: "Read the retry fixture",
          evidenceIds: ["file.retry"],
        },
        {
          id: "scout-tool-2",
          tool: "run_readonly_test",
          label: "Run the East retry test",
          evidenceIds: ["test.east"],
        },
        {
          id: "scout-tool-3",
          tool: "inspect_log",
          label: "Inspect the duplicate-key log",
          evidenceIds: ["log.duplicate"],
        },
      ],
      nextDecision: {
        required: true,
        action: "Hand evidence to Builder",
        reason: "A learner must authorize the bounded handoff.",
      },
      coaching: null,
    };
  }

  if (request.turn === "builder") {
    return {
      ...common,
      status: "change_prepared",
      title: "Builder addressed the regional difference.",
      summary:
        "The proposed patch attaches the idempotency key before the retry_v2 duplicate guard and leaves the non-v2 path unchanged.",
      evidence: materializeEvidence(["patch.retry-guard", "test.regional"]),
      toolEvents: [
        {
          id: "builder-tool-1",
          tool: "read_configuration",
          label: "Compare East and West configuration",
          evidenceIds: ["config.east", "config.west"],
        },
        {
          id: "builder-tool-2",
          tool: "propose_patch",
          label: "Prepare the bounded retry guard patch",
          evidenceIds: ["patch.retry-guard", "test.regional"],
        },
      ],
      nextDecision: {
        required: true,
        action: "Request independent verification",
        reason: "Builder cannot verify its own change.",
      },
      coaching: null,
    };
  }

  if (request.turn === "verifier") {
    return {
      ...common,
      status: "verified",
      title: "The incident claim now has independent proof.",
      summary:
        "Replay and first-attempt requests pass in East and West. Production duplicate-key rate remains the one monitoring follow-up.",
      evidence: materializeEvidence([
        "matrix.retry",
        "test.smoke",
        "risk.monitoring",
      ]),
      toolEvents: [
        {
          id: "verifier-tool-1",
          tool: "run_verification_matrix",
          label: "Run the independent regional matrix",
          evidenceIds: ["matrix.retry", "test.smoke"],
        },
        {
          id: "verifier-tool-2",
          tool: "inspect_monitoring_risk",
          label: "Check remaining monitoring risk",
          evidenceIds: ["risk.monitoring"],
        },
      ],
      nextDecision: {
        required: true,
        action: "End drill and review",
        reason: "The learner decides when verified evidence is sufficient.",
      },
      coaching: null,
    };
  }

  return {
    ...common,
    status: "coached",
    title: "Your command fingerprint",
    summary:
      "One decision protected the team, and one earlier instruction can be made more precise.",
    evidence: materializeEvidence(["config.east", "config.west", "matrix.retry"]),
    toolEvents: [],
    nextDecision: {
      required: false,
      action: "Run the drill again",
      reason: "The coaching loop is complete.",
    },
    coaching,
  };
}

