import {
  TurnResultSchema,
  type TurnRequest,
  type TurnResult,
} from "./shared/agent-contract";
import { fallbackTurn } from "../worker/fallback";

const staticReplayStatuses = new Set([404, 405, 501, 502, 503, 504]);

function staticReplay(request: TurnRequest): TurnResult {
  return TurnResultSchema.parse(
    fallbackTurn(
      request,
      "Static replay mode: no hosted model call was made.",
    ),
  );
}

export class AgentRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentRequestError";
  }
}

export async function requestAgentTurn(
  request: TurnRequest,
  signal?: AbortSignal,
): Promise<TurnResult> {
  if (import.meta.env.VITE_STATIC_REPLAY === "true") {
    return staticReplay(request);
  }

  let response: Response;

  try {
    response = await fetch("/api/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    return staticReplay(request);
  }

  if (staticReplayStatuses.has(response.status)) {
    return staticReplay(request);
  }

  if (!response.ok) {
    throw new AgentRequestError("The agent turn could not be completed.", response.status);
  }

  return TurnResultSchema.parse(await response.json());
}
