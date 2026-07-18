import { z } from "zod";

export const TurnSchema = z.enum(["scout", "builder", "verifier", "debrief"]);
export type Turn = z.infer<typeof TurnSchema>;

export const AgentRoleSchema = z.enum(["scout", "builder", "verifier", "coach"]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const DirectiveSchema = z
  .object({
    objective: z.string().trim().min(8).max(500),
    boundary: z.string().trim().min(8).max(500),
    doneWhen: z.string().trim().min(8).max(500),
    evidence: z.string().trim().min(8).max(500),
  })
  .strict();

export const SessionEventSchema = z
  .object({
    stage: z.string().trim().min(1).max(40),
    decision: z.string().trim().min(1).max(500),
    evidenceIds: z.array(z.string().trim().min(1).max(80)).max(12),
  })
  .strict();

export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const TurnRequestSchema = z
  .object({
    turn: TurnSchema,
    scenarioId: z.literal("enrollment-incident"),
    sessionId: z.string().uuid(),
    directive: DirectiveSchema,
    authorizedEvidenceIds: z.array(z.string().trim().min(1).max(80)).max(12),
    events: z.array(SessionEventSchema).max(12),
  })
  .strict();

export type TurnRequest = z.infer<typeof TurnRequestSchema>;

export const EvidenceItemSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    detail: z.string(),
  })
  .strict();

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const ToolEventSchema = z
  .object({
    id: z.string(),
    tool: z.string(),
    label: z.string(),
    evidenceIds: z.array(z.string()),
  })
  .strict();

export type ToolEvent = z.infer<typeof ToolEventSchema>;

export const NextDecisionSchema = z
  .object({
    required: z.boolean(),
    action: z.string(),
    reason: z.string(),
  })
  .strict();

export const CoachingSchema = z
  .object({
    pivotalTitle: z.string(),
    pivotalDecision: z.string(),
    pivotalResult: z.string(),
    workedTitle: z.string(),
    workedBody: z.string(),
    changeTitle: z.string(),
    changeBody: z.string(),
    originalDirective: z.string(),
    strongerDirective: z.string(),
  })
  .strict();

export type Coaching = z.infer<typeof CoachingSchema>;

export const TurnResultSchema = z
  .object({
    mode: z.enum(["live", "fallback"]),
    model: z.string().nullable(),
    notice: z.string().nullable(),
    role: AgentRoleSchema,
    status: z.enum(["evidence_ready", "change_prepared", "verified", "coached"]),
    title: z.string(),
    summary: z.string(),
    evidence: z.array(EvidenceItemSchema),
    toolEvents: z.array(ToolEventSchema),
    nextDecision: NextDecisionSchema,
    coaching: CoachingSchema.nullable(),
  })
  .strict();

export type TurnResult = z.infer<typeof TurnResultSchema>;

export const ApiErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  })
  .strict();
