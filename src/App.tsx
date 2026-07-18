import {
  FormEvent,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { requestAgentTurn } from "./agent-client";
import {
  Directive,
  DirectiveDraft,
  RoleId,
  ScenarioState,
  exampleDraft,
  initialState,
  isDraftComplete,
  roleDetails,
  scenarioReducer,
} from "./scenario";
import type {
  Coaching,
  SessionEvent,
  Turn,
  TurnResult,
} from "./shared/agent-contract";
import { RealSetup, RealWorkspace } from "./RealMode";

const transitionDelay = 760;

const stageRole: Partial<Record<(typeof initialState)["stage"], RoleId>> = {
  briefing: "scout",
  "scout-working": "scout",
  "scout-ready": "builder",
  "builder-working": "builder",
  conflict: "builder",
  "builder-revising": "builder",
  "conflict-resolved": "verifier",
  verifying: "verifier",
  verified: "verifier",
};

function buildSessionEvents(
  state: ScenarioState,
  draft: DirectiveDraft,
): SessionEvent[] {
  const events: SessionEvent[] = [
    {
      stage: "directive",
      decision: draft.objective,
      evidenceIds: [],
    },
  ];
  const evidenceIds = state.evidence.map((item) => item.id);
  const builder = state.directives.find((directive) => directive.id === "B1");
  const verifier = state.directives.find((directive) => directive.id === "V1");

  if (builder) {
    events.push({
      stage: "handoff",
      decision: "Authorized Scout's bounded evidence for Builder.",
      evidenceIds: evidenceIds.filter((id) =>
        ["file.retry", "test.east", "log.duplicate"].includes(id),
      ),
    });
  }
  if (state.incidents.length > 1) {
    events.push({
      stage: "conflict",
      decision: "Stopped Builder when East and West evidence conflicted.",
      evidenceIds: evidenceIds.filter((id) => id.startsWith("config.")),
    });
  }
  if (builder?.status === "resolved") {
    events.push({
      stage: "resolution",
      decision: "Authorized a revised change that addressed the regional difference.",
      evidenceIds: evidenceIds.filter((id) =>
        ["patch.retry-guard", "test.regional"].includes(id),
      ),
    });
  }
  if (verifier) {
    events.push({
      stage: "verification",
      decision: "Requested independent read-only verification.",
      evidenceIds: evidenceIds.filter((id) =>
        ["matrix.retry", "test.smoke", "risk.monitoring"].includes(id),
      ),
    });
  }

  return events;
}

function RoleMark({ role }: { role: RoleId }) {
  if (role === "scout") {
    return <span aria-hidden="true" className="role-mark role-mark--scout" />;
  }
  if (role === "builder") {
    return <span aria-hidden="true" className="role-mark role-mark--builder" />;
  }
  return <span aria-hidden="true" className="role-mark role-mark--verifier" />;
}

function StatusGlyph({ status }: { status: Directive["status"] }) {
  const label = {
    working: "Working",
    "evidence-ready": "Evidence ready",
    blocked: "Blocked by conflicting evidence",
    resolved: "Change prepared, verification required",
    verified: "Independently verified",
  }[status];

  return (
    <span className={`status-glyph status-glyph--${status}`} title={label}>
      <span aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

function DirectiveStrip({ directive }: { directive: Directive }) {
  return (
    <article
      className={`directive-strip directive-strip--${directive.status}`}
      aria-label={`${directive.id}: ${directive.shortLabel}. ${directive.status}`}
    >
      <div className="directive-strip__lead">
        <StatusGlyph status={directive.status} />
        <span className="directive-strip__id">{directive.id}</span>
      </div>
      <div className="directive-strip__body">
        <strong>{directive.shortLabel}</strong>
        <span>{directive.boundary}</span>
      </div>
      <time>{directive.timestamp}</time>
      {(directive.status === "evidence-ready" ||
        directive.status === "resolved" ||
        directive.status === "verified") && (
        <div className="evidence-tab" aria-label="Evidence attached">
          <span>Evidence</span>
          <strong>
            {directive.role === "scout"
              ? "3 sources"
              : directive.role === "builder"
                ? "patch + tests"
                : "14 checks"}
          </strong>
        </div>
      )}
    </article>
  );
}

function EmptyLane({ role }: { role: RoleId }) {
  const isFirst = role === "scout";
  return (
    <div className="empty-lane">
      <span className="empty-lane__line" />
      <span>{isFirst ? "Your first directive will appear here" : "Waiting for a justified handoff"}</span>
    </div>
  );
}

function DependencyMap({ directives }: { directives: Directive[] }) {
  return (
    <div className="dependency-map" aria-label="Directive dependency overview">
      {(["scout", "builder", "verifier"] as RoleId[]).map((role, index) => {
        const hasDirective = directives.some((directive) => directive.role === role);
        return (
          <div className="dependency-map__step" key={role}>
            <span className={hasDirective ? "is-active" : ""} />
            <small>{roleDetails[role].name}</small>
            {index < 2 && <i aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}

function CommandTable({ directives }: { directives: Directive[] }) {
  return (
    <section className="command-table" aria-labelledby="directive-table-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Work in sequence</p>
          <h2 id="directive-table-title">Directive table</h2>
        </div>
        <div className="table-key" aria-label="Status key">
          <span><i className="key-dot key-dot--working" />Working</span>
          <span><i className="key-dot key-dot--blocked" />Conflict</span>
          <span><i className="key-dot key-dot--verified" />Verified</span>
        </div>
      </div>

      <DependencyMap directives={directives} />

      <div className="table-plane">
        {(["scout", "builder", "verifier"] as RoleId[]).map((role) => {
          const roleDirectives = directives.filter(
            (directive) => directive.role === role,
          );
          return (
            <div className="role-lane" key={role}>
              <header className="role-lane__header">
                <RoleMark role={role} />
                <div>
                  <h3>{roleDetails[role].name}</h3>
                  <span>{roleDetails[role].permission}</span>
                </div>
              </header>
              <div className="role-lane__track">
                {roleDirectives.length === 0 ? (
                  <EmptyLane role={role} />
                ) : (
                  roleDirectives.map((directive) => (
                    <DirectiveStrip directive={directive} key={directive.id} />
                  ))
                )}
              </div>
            </div>
          );
        })}

        {directives.some((directive) => directive.status === "blocked") && (
          <div className="conflict-bridge" aria-label="Conflicting evidence blocks Builder">
            <span>Conflict</span>
          </div>
        )}
      </div>
    </section>
  );
}

function IncidentRail({ incidents }: { incidents: typeof initialState.incidents }) {
  return (
    <aside className="incident-rail" aria-labelledby="incident-title">
      <div className="section-heading section-heading--compact">
        <div>
          <p className="eyebrow">What changed</p>
          <h2 id="incident-title">Incident</h2>
        </div>
      </div>
      <ol>
        {incidents.map((incident) => (
          <li className={incident.active ? "is-active" : ""} key={incident.id}>
            <time>{incident.time}</time>
            <p>{incident.label}</p>
            {incident.active && <span>Current</span>}
          </li>
        ))}
      </ol>
    </aside>
  );
}

function BriefingRack({
  state,
  onAction,
}: {
  state: typeof initialState;
  onAction: () => void;
}) {
  const activeRole = stageRole[state.stage];

  return (
    <aside className="briefing-rack" aria-labelledby="briefing-title">
      <div className="section-heading section-heading--compact">
        <div>
          <p className="eyebrow">Current decision</p>
          <h2 id="briefing-title">Briefing</h2>
        </div>
        {state.archivedReports > 0 && (
          <span className="archive-count">{state.archivedReports} archived</span>
        )}
      </div>
      <article
        className={`briefing-sheet ${state.stage === "conflict" ? "briefing-sheet--conflict" : ""}`}
        tabIndex={-1}
      >
        <span className="briefing-sheet__clip" aria-hidden="true" />
        <p className="eyebrow">{state.briefing.eyebrow}</p>
        <h3>{state.briefing.title}</h3>
        <p>{state.briefing.body}</p>

        {activeRole && (
          <div className="permission-note">
            <RoleMark role={activeRole} />
            <span>
              <strong>{roleDetails[activeRole].name}</strong>
              {roleDetails[activeRole].permission}
            </span>
          </div>
        )}

        {state.briefing.evidence && (
          <ul className="evidence-list" aria-label="Evidence">
            {state.briefing.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}

        {state.toolEvents.length > 0 && (
          <div className="agent-activity" aria-label="Agent activity">
            <p>Agent activity</p>
            <ol>
              {state.toolEvents.map((event) => (
                <li key={event.id}>
                  <span>{event.tool.replaceAll("_", " ")}</span>
                  <small>{event.evidenceIds.length} evidence</small>
                </li>
              ))}
            </ol>
          </div>
        )}

        {state.briefing.actionLabel && (
          <button className="secondary-action" type="button" onClick={onAction}>
            {state.briefing.actionLabel}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </article>
    </aside>
  );
}

interface ComposerProps {
  draft: DirectiveDraft;
  onChange: (field: keyof DirectiveDraft, value: string) => void;
  onExample: () => void;
  onSubmit: (event: FormEvent) => void;
  disabled: boolean;
}

function DirectiveComposer({
  draft,
  onChange,
  onExample,
  onSubmit,
  disabled,
}: ComposerProps) {
  const fields: Array<{
    id: keyof DirectiveDraft;
    label: string;
    placeholder: string;
  }> = [
    {
      id: "objective",
      label: "Objective",
      placeholder: "What outcome should Scout produce?",
    },
    {
      id: "boundary",
      label: "Boundary",
      placeholder: "What must Scout not change or assume?",
    },
    {
      id: "doneWhen",
      label: "Done when",
      placeholder: "What must be true before work is complete?",
    },
    {
      id: "evidence",
      label: "Evidence",
      placeholder: "What proof should come back?",
    },
  ];

  return (
    <form className="directive-composer" onSubmit={onSubmit}>
      <div className="composer-heading">
        <div>
          <p className="eyebrow">Assign to Scout · Read only</p>
          <h2>Issue the first directive</h2>
        </div>
        <button className="text-action" type="button" onClick={onExample}>
          Load a strong example
        </button>
      </div>
      <div className="composer-fields">
        {fields.map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            <textarea
              name={field.id}
              onChange={(event) => onChange(field.id, event.target.value)}
              placeholder={field.placeholder}
              rows={2}
              value={draft[field.id]}
            />
          </label>
        ))}
      </div>
      <button className="primary-action" disabled={disabled} type="submit">
        Issue directive
        <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
}

const fallbackCoaching: Coaching = {
  pivotalTitle: "You stopped the change when the evidence conflicted.",
  pivotalDecision: "Resolve the East/West discrepancy before Builder continues.",
  pivotalResult: "The final patch addressed the actual regional condition.",
  workedTitle: "You defined proof before asking for a change.",
  workedBody:
    "Scout returned a file, failing test, and matching log signature. That gave Builder a bounded handoff instead of a vague problem statement.",
  changeTitle: "Ask for regional comparison before involving Builder.",
  changeBody:
    "The first investigation explained East, but not why West succeeded. Builder started preparing a change before that discrepancy was known.",
  originalDirective: "Identify why valid enrollments are being rejected.",
  strongerDirective:
    "Compare rejected requests in East with successful requests in West. Read only. Identify the first behavior difference and cite the file, test, and configuration evidence that proves it.",
};

function Debrief({
  coaching,
  mode,
  onReset,
}: {
  coaching: Coaching | null;
  mode: "live" | "fallback" | null;
  onReset: () => void;
}) {
  const copy = coaching ?? fallbackCoaching;
  return (
    <main className="debrief" id="main-content">
      <section className="debrief-hero" aria-labelledby="debrief-title">
        <p className="eyebrow">
          Drill complete · {mode === "live" ? "GPT-5.6 coaching" : "Verified fallback"}
        </p>
        <h1 id="debrief-title">Your command fingerprint</h1>
        <p>
          One decision protected the team. One early handoff introduced avoidable
          risk. Both are tied to the directives and evidence below.
        </p>
      </section>

      <section className="pivotal-moment" aria-labelledby="moment-title">
        <div className="moment-heading">
          <p className="eyebrow">Pivotal moment · 02:08</p>
          <h2 id="moment-title">{copy.pivotalTitle}</h2>
        </div>
        <div className="moment-flow">
          <article className="moment-card moment-card--good">
            <span>Strong decision</span>
            <p>{copy.pivotalDecision}</p>
            <small>Evidence: feature.retry_v2 differed by region</small>
          </article>
          <span className="moment-arrow" aria-hidden="true">→</span>
          <article className="moment-card moment-card--verified">
            <span>Result</span>
            <p>{copy.pivotalResult}</p>
            <small>Independent matrix: 8/8 passed</small>
          </article>
        </div>
      </section>

      <section className="coaching-grid" aria-label="Evidence-linked coaching">
        <article className="coaching-card">
          <p className="eyebrow">What worked</p>
          <h2>{copy.workedTitle}</h2>
          <p>{copy.workedBody}</p>
          <a href="#original-directive">See directive S1</a>
        </article>
        <article className="coaching-card coaching-card--change">
          <p className="eyebrow">What to change</p>
          <h2>{copy.changeTitle}</h2>
          <p>{copy.changeBody}</p>
          <span>Observed at 01:42 → 02:08</span>
        </article>
      </section>

      <section className="rewrite" id="original-directive">
        <div>
          <p className="eyebrow">Try this next</p>
          <h2>Compare the original directive with a stronger one.</h2>
        </div>
        <div className="rewrite-compare">
          <article>
            <span>Original</span>
            <p>{copy.originalDirective}</p>
            <small>Missing: compare failing and healthy regions</small>
          </article>
          <article className="rewrite-strip">
            <span>Stronger directive</span>
            <p>{copy.strongerDirective}</p>
            <small>Objective · Boundary · Done when · Evidence</small>
          </article>
        </div>
      </section>

      <button className="primary-action debrief-reset" onClick={onReset} type="button">
        Run the drill again
        <span aria-hidden="true">↻</span>
      </button>
    </main>
  );
}

function DrillIntroduction({
  onTrial,
  onReal,
  reduceMotion,
  onToggleMotion,
}: {
  onTrial: () => void;
  onReal: () => void;
  reduceMotion: boolean;
  onToggleMotion: () => void;
}) {
  return (
    <main className="drill-intro" id="main-content">
      <header className="intro-masthead">
        <span className="intro-brand">CONTROL ROOM</span>
        <span className="intro-edition">Trial + real repository workflow</span>
        <button
          aria-pressed={reduceMotion}
          className="motion-toggle intro-motion-toggle"
          onClick={onToggleMotion}
          type="button"
        >
          {reduceMotion ? "Motion reduced" : "Reduce motion"}
        </button>
      </header>

      <section className="intro-briefing" aria-labelledby="intro-title">
        <div className="intro-copy">
          <p className="eyebrow">A control layer for directing AI coding agents</p>
          <h1 id="intro-title">
            Agents move fast.
            <span>You decide when they may act.</span>
          </h1>
          <p className="intro-lede">
            Learn safely in Trial Mode, then use the same approval workflow on a
            real Git repository. Define boundaries, inspect evidence, review the
            patch, and require independent proof before anything is applied.
          </p>

          <div className="intro-definition">
            <span>What this is</span>
            <strong>
              A place to practise the workflow and then use it on real code.
            </strong>
          </div>

          <div className="mode-choices" aria-label="Choose how to use CONTROL ROOM">
            <button className="mode-choice mode-choice--trial" onClick={onTrial} type="button">
              <span className="mode-choice__number">01 · Start here</span>
              <strong>Trial Mode</strong>
              <p>Learn the workflow in a five-minute guided incident. Safe, instant, and no account required.</p>
              <span className="mode-choice__action">Try the simulation <i aria-hidden="true">→</i></span>
            </button>
            <button className="mode-choice mode-choice--real" onClick={onReal} type="button">
              <span className="mode-choice__number">02 · When ready</span>
              <strong>Real Mode</strong>
              <p>Connect your own clean Git repository. Real agents inspect, prepare, verify, and—only with approval—apply a patch.</p>
              <span className="mode-choice__action">Use my repository <i aria-hidden="true">→</i></span>
            </button>
          </div>
          <p className="intro-safety">Both modes keep you at every approval gate · Nothing commits or pushes</p>
        </div>

        <aside className="intro-chain-panel" aria-labelledby="chain-title">
          <div className="intro-chain-heading">
            <div>
              <p className="eyebrow">How you use it</p>
              <h2 id="chain-title">The command chain</h2>
            </div>
            <span>Your decisions stay in the loop</span>
          </div>

          <ol className="intro-chain">
            <li className="intro-chain__step intro-chain__step--human">
              <span>01</span>
              <div>
                <strong>You brief Scout</strong>
                <p>Set the objective, limits, completion condition, and proof.</p>
              </div>
            </li>
            <li className="intro-chain__step">
              <RoleMark role="scout" />
              <div>
                <strong>Scout investigates</strong>
                <p>Read only. Returns file, test, and log evidence.</p>
              </div>
            </li>
            <li className="intro-chain__gate">
              <span>Your approval</span>
              <strong>Evidence before action</strong>
            </li>
            <li className="intro-chain__step">
              <RoleMark role="builder" />
              <div>
                <strong>Builder prepares a change</strong>
                <p>Works only after you approve Scout’s evidence and plan.</p>
              </div>
            </li>
            <li className="intro-chain__gate">
              <span>Your approval</span>
              <strong>Proof before trust</strong>
            </li>
            <li className="intro-chain__step">
              <RoleMark role="verifier" />
              <div>
                <strong>Verifier checks independently</strong>
                <p>Checks the actual patch before you may apply it.</p>
              </div>
            </li>
          </ol>
        </aside>
      </section>

      <footer className="intro-audience">
        <span>Built for</span>
        <p>
          Developers, technical leads, and teams learning to supervise AI agents
          safely.
        </p>
        <strong>Trial first · Real work when ready</strong>
      </footer>
    </main>
  );
}

function App() {
  const [state, dispatch] = useReducer(scenarioReducer, initialState);
  const [mode, setMode] = useState<"intro" | "trial" | "real">("intro");
  const hasStarted = mode === "trial";
  const [draft, setDraft] = useState<DirectiveDraft>({
    objective: "",
    boundary: "",
    doneWhen: "",
    evidence: "",
  });
  const [seconds, setSeconds] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sessionId = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!hasStarted || state.stage === "debrief") return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [hasStarted, state.stage]);

  useEffect(() => {
    if (hasStarted) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [hasStarted]);

  useEffect(() => {
    if (state.stage !== "briefing") {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [state.stage]);

  const timeLabel = useMemo(() => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  }, [seconds]);

  const handleComposerChange = (
    field: keyof DirectiveDraft,
    value: string,
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const minimumTransition = () =>
    new Promise<void>((resolve) =>
      window.setTimeout(resolve, reduceMotion ? 0 : transitionDelay),
    );

  const runTurn = async (turn: Turn): Promise<TurnResult | undefined> => {
    try {
      const result = await requestAgentTurn({
        turn,
        scenarioId: "enrollment-incident",
        sessionId: sessionId.current,
        directive: draft,
        authorizedEvidenceIds: state.evidence.map((item) => item.id),
        events: buildSessionEvents(state, draft),
      });
      setClientNotice(result.notice);
      return result;
    } catch {
      setClientNotice(
        "The local API was unreachable, so the interface continued with its built-in rehearsal.",
      );
      return undefined;
    }
  };

  const handleIssue = async (event: FormEvent) => {
    event.preventDefault();
    if (!isDraftComplete(draft)) return;
    dispatch({ type: "issue-scout", draft });
    const [result] = await Promise.all([runTurn("scout"), minimumTransition()]);
    dispatch({ type: "scout-complete", result });
  };

  const handleBriefingAction = async () => {
    if (state.stage === "scout-ready") {
      dispatch({ type: "handoff-builder" });
      await minimumTransition();
      dispatch({ type: "surface-conflict" });
    } else if (state.stage === "conflict") {
      dispatch({ type: "begin-builder-revision" });
      const [result] = await Promise.all([
        runTurn("builder"),
        minimumTransition(),
      ]);
      dispatch({ type: "builder-complete", result });
    } else if (state.stage === "conflict-resolved") {
      dispatch({ type: "request-verification" });
      const [result] = await Promise.all([
        runTurn("verifier"),
        minimumTransition(),
      ]);
      dispatch({ type: "verification-complete", result });
    } else if (state.stage === "verified") {
      dispatch({ type: "end-drill" });
      const [result] = await Promise.all([
        runTurn("debrief"),
        minimumTransition(),
      ]);
      dispatch({ type: "debrief-complete", result });
    }
  };

  const handleReset = () => {
    dispatch({ type: "reset" });
    setDraft({ objective: "", boundary: "", doneWhen: "", evidence: "" });
    setSeconds(0);
    setClientNotice(null);
    sessionId.current = crypto.randomUUID();
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  if (mode === "real") {
    return import.meta.env.VITE_REAL_MODE === "true" ? (
      <RealWorkspace onBack={() => setMode("intro")} />
    ) : (
      <RealSetup onBack={() => setMode("intro")} />
    );
  }

  if (mode === "intro") {
    return (
      <div className={reduceMotion ? "app reduce-motion" : "app"}>
        <a className="skip-link" href="#main-content">Skip to introduction</a>
        <DrillIntroduction
          onTrial={() => setMode("trial")}
          onReal={() => setMode("real")}
          onToggleMotion={() => setReduceMotion((value) => !value)}
          reduceMotion={reduceMotion}
        />
      </div>
    );
  }

  return (
    <div className={reduceMotion ? "app reduce-motion" : "app"}>
      <a className="skip-link" href="#main-content">Skip to drill</a>
      <header className="app-header">
        <a className="brand" href="#main-content" aria-label="CONTROL ROOM home">
          CONTROL ROOM
        </a>
        <div className="scenario-name">
          <span>Scenario</span>
          <strong>Enrollment incident</strong>
        </div>
        <div className="drill-time" aria-label={`Drill time ${timeLabel}`}>
          <span>Drill time</span>
          <strong>{timeLabel}</strong>
        </div>
        <button
          aria-pressed={reduceMotion}
          className="motion-toggle"
          onClick={() => setReduceMotion((value) => !value)}
          type="button"
        >
          {reduceMotion ? "Motion reduced" : "Reduce motion"}
        </button>
      </header>

      <div className="orientation-bar">
        <p>
          <strong>Practice directing three AI agents through a software incident.</strong>{" "}
          Assign the work, define the proof, and verify the result.
        </p>
        <span>
          Education drill · You make every consequential decision ·{" "}
          <strong className={`runtime-mode runtime-mode--${state.runtimeMode ?? "local"}`}>
            {state.runtimeMode === "live"
              ? "GPT-5.6 live"
              : state.runtimeMode === "fallback"
                ? "Verified fallback"
                : "Local rehearsal"}
          </strong>
        </span>
      </div>

      {(clientNotice ?? state.runtimeNotice) && (
        <div className="runtime-notice" role="status">
          {clientNotice ?? state.runtimeNotice}
        </div>
      )}

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {state.announcement}
      </div>

      {state.stage === "debrief" ? (
        <Debrief
          coaching={state.coaching}
          mode={state.runtimeMode}
          onReset={handleReset}
        />
      ) : (
        <>
          <main
            className="workspace"
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
          >
            <IncidentRail incidents={state.incidents} />
            <CommandTable directives={state.directives} />
            <BriefingRack state={state} onAction={handleBriefingAction} />
          </main>

          {state.stage === "briefing" && (
            <DirectiveComposer
              disabled={!isDraftComplete(draft)}
              draft={draft}
              onChange={handleComposerChange}
              onExample={() => setDraft(exampleDraft)}
              onSubmit={handleIssue}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
