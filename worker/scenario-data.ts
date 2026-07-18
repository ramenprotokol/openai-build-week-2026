import type { EvidenceItem } from "../src/shared/agent-contract";

export interface ScenarioRecord extends EvidenceItem {
  content: string;
}

export const scenarioRecords = {
  "file.retry": {
    id: "file.retry",
    label: "src/enrollment/retry.ts:48",
    detail: "The East retry guard runs before the idempotency key is attached.",
    content:
      "if (flags.retry_v2 && request.isReplay) rejectDuplicate(request); attachIdempotencyKey(request);",
  },
  "test.east": {
    id: "test.east",
    label: "retry-region-east.test.ts",
    detail: "Replay request fails only when retry_v2 is enabled.",
    content: "FAIL east replay: expected 202, received 409 ENROLL_DUPLICATE_KEY",
  },
  "log.duplicate": {
    id: "log.duplicate",
    label: "ENROLL_DUPLICATE_KEY",
    detail: "The duplicate check runs before an idempotency key is present.",
    content: "region=east replay=true key=missing result=ENROLL_DUPLICATE_KEY",
  },
  "config.east": {
    id: "config.east",
    label: "East configuration",
    detail: "feature.retry_v2 is enabled in East.",
    content: "region=east feature.retry_v2=on",
  },
  "config.west": {
    id: "config.west",
    label: "West configuration",
    detail: "feature.retry_v2 is disabled in West.",
    content: "region=west feature.retry_v2=off",
  },
  "patch.retry-guard": {
    id: "patch.retry-guard",
    label: "retry-v2-guard.patch",
    detail: "Attach the idempotency key before entering the retry_v2 duplicate guard.",
    content:
      "attachIdempotencyKey(request); if (flags.retry_v2 && request.isReplay) rejectDuplicate(request);",
  },
  "test.regional": {
    id: "test.regional",
    label: "East + West fixture tests",
    detail: "First-attempt and replay fixtures pass in both regions: 14/14.",
    content: "PASS regional fixture suite: 14 passed, 0 failed",
  },
  "matrix.retry": {
    id: "matrix.retry",
    label: "region-retry.matrix",
    detail: "Independent East/West replay matrix passes: 8/8.",
    content: "PASS east/on east/off west/on west/off × first/replay: 8 passed",
  },
  "test.smoke": {
    id: "test.smoke",
    label: "enrollment-smoke.test",
    detail: "Independent enrollment smoke suite passes: 6/6.",
    content: "PASS enrollment smoke suite: 6 passed, 0 failed",
  },
  "risk.monitoring": {
    id: "risk.monitoring",
    label: "Remaining monitoring risk",
    detail: "Watch production duplicate-key rate after rollout.",
    content: "follow-up: alert on ENROLL_DUPLICATE_KEY rate by region",
  },
} satisfies Record<string, ScenarioRecord>;

export type EvidenceId = keyof typeof scenarioRecords;

export function isEvidenceId(value: string): value is EvidenceId {
  return Object.hasOwn(scenarioRecords, value);
}

export function materializeEvidence(ids: string[]): EvidenceItem[] {
  return [...new Set(ids)]
    .filter(isEvidenceId)
    .map((id) => {
      const item = scenarioRecords[id];
      return { id: item.id, label: item.label, detail: item.detail };
    });
}
