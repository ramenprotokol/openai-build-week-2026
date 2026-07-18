import { FormEvent, useEffect, useState } from "react";

type Brief = { objective: string; boundary: string; doneWhen: string; evidence: string };
type Stage = "brief" | "scouting" | "scout" | "building" | "builder" | "verifying" | "verified" | "applying" | "applied";
type Report = Record<string, unknown>;

const starterBrief: Brief = {
  objective: "",
  boundary: "Only change the files required for this task. Do not change dependencies or configuration.",
  doneWhen: "The requested behavior works and existing checks still pass.",
  evidence: "Show the changed files, relevant test results, and any remaining risks.",
};

function localToken() {
  return document.querySelector<HTMLMetaElement>('meta[name="control-room-token"]')?.content || "";
}

async function callApi(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-control-room-token": localToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Real Mode request failed.");
  return payload;
}

function ReportView({ title, report }: { title: string; report: Report }) {
  return (
    <section className="real-report">
      <p className="eyebrow">Agent report</p>
      <h2>{title}</h2>
      {Object.entries(report).map(([key, value]) => (
        <div className="real-report__row" key={key}>
          <strong>{key.replace(/([A-Z])/g, " $1")}</strong>
          {Array.isArray(value) ? (
            <ul>{value.map((item, index) => <li key={index}>{typeof item === "string" ? item : JSON.stringify(item)}</li>)}</ul>
          ) : <p>{String(value)}</p>}
        </div>
      ))}
    </section>
  );
}

export function RealSetup({ onBack }: { onBack: () => void }) {
  return (
    <main className="real-setup" id="main-content">
      <button className="text-action" onClick={onBack} type="button">← Back to mode selection</button>
      <p className="eyebrow">Real Mode · Uses your own repository</p>
      <h1>Open CONTROL ROOM beside your code.</h1>
      <p className="real-setup__lede">
        Browsers cannot safely open folders on your computer. Run the local companion once,
        then CONTROL ROOM can inspect and prepare a real patch while every consequential step waits for you.
      </p>
      <ol className="real-setup__steps">
        <li><span>01</span><div><strong>Clone CONTROL ROOM</strong><code>git clone https://github.com/ramenprotokol/openai-build-week-2026.git</code></div></li>
        <li><span>02</span><div><strong>Install it</strong><code>cd openai-build-week-2026 &amp;&amp; npm install</code></div></li>
        <li><span>03</span><div><strong>Connect a clean Git repository</strong><code>npm run real -- --repo /absolute/path/to/your/repository</code></div></li>
        <li><span>04</span><div><strong>Open the local workspace</strong><code>http://127.0.0.1:4317</code></div></li>
      </ol>
      <div className="real-safety-grid">
        <article><strong>Your login</strong><p>Uses the Codex authentication already saved on your computer. No project API key is bundled; your normal Codex plan limits apply.</p></article>
        <article><strong>Your control</strong><p>Builder works in a temporary Git worktree. Nothing reaches your repository until you approve Apply.</p></article>
        <article><strong>Your privacy</strong><p>The companion binds to your computer only. Agent shell tools get no network access and never commit or push.</p></article>
      </div>
    </main>
  );
}

export function RealWorkspace({ onBack }: { onBack: () => void }) {
  const [brief, setBrief] = useState(starterBrief);
  const [stage, setStage] = useState<Stage>("brief");
  const [status, setStatus] = useState<{ repository: string; branch: string; clean: boolean } | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [patch, setPatch] = useState("");
  const [error, setError] = useState("");
  const [applyApproved, setApplyApproved] = useState(false);

  useEffect(() => { callApi("/api/real/status").then(setStatus).catch((value) => setError(value.message)); }, []);
  const update = (key: keyof Brief, value: string) => setBrief((current) => ({ ...current, [key]: value }));
  const act = async (next: Stage, path: string, done: Stage, body: unknown) => {
    setError(""); setStage(next);
    try {
      const payload = await callApi(path, body);
      if (payload.sessionId) setSessionId(payload.sessionId);
      if (payload.report) setReport(payload.report);
      if (payload.patch) setPatch(payload.patch);
      setStage(done);
    } catch (value) { setError(value instanceof Error ? value.message : "Real Mode failed."); setStage(next === "scouting" ? "brief" : next === "building" ? "scout" : next === "verifying" ? "builder" : "verified"); }
  };
  const scout = (event: FormEvent) => { event.preventDefault(); void act("scouting", "/api/real/scout", "scout", { brief }); };
  const busy = ["scouting", "building", "verifying", "applying"].includes(stage);

  return (
    <div className="real-mode">
      <header className="real-header">
        <button className="brand real-brand" onClick={onBack} type="button">CONTROL ROOM</button>
        <div><span>Real repository</span><strong>{status?.repository || "Connecting…"}</strong></div>
        <div><span>Branch</span><strong>{status?.branch || "—"}</strong></div>
        <span className={status?.clean ? "repo-clean" : "repo-dirty"}>{status?.clean ? "Clean · ready" : "Changes detected"}</span>
      </header>
      <nav className="real-progress" aria-label="Real Mode progress">
        {["Brief", "Scout", "Approve", "Builder", "Approve", "Verifier", "Apply"].map((label, index) => <span key={`${label}-${index}`}>{String(index + 1).padStart(2, "0")} {label}</span>)}
      </nav>
      <main className="real-workspace" id="main-content">
        <section className="real-command">
          <p className="eyebrow">A real task, under your command</p>
          <h1>{stage === "brief" ? "Brief Scout." : stage === "applied" ? "Patch applied." : "Review before authorizing the next agent."}</h1>
          <p>Scout can only read. Builder edits an isolated copy. Verifier gets a separate read-only review. No commit and no push.</p>
          <form onSubmit={scout}>
            {([['objective','Objective'],['boundary','Boundary'],['doneWhen','Done when'],['evidence','Evidence required']] as [keyof Brief,string][]).map(([key, label]) => (
              <label key={key}><span>{label}</span><textarea disabled={stage !== "brief"} value={brief[key]} onChange={(event) => update(key, event.target.value)} rows={key === "objective" ? 3 : 2} /></label>
            ))}
            {stage === "brief" && <button className="primary-action" disabled={!status?.clean || !brief.objective.trim() || busy} type="submit">Send Scout into my repository <span>→</span></button>}
          </form>
          {error && <p className="real-error" role="alert">{error}</p>}
        </section>
        <aside className="real-evidence">
          {busy && <div className="real-working"><span /><p className="eyebrow">Agent working</p><h2>{stage === "scouting" ? "Scout is gathering evidence…" : stage === "building" ? "Builder is preparing a patch…" : stage === "verifying" ? "Verifier is checking independently…" : "Applying the verified patch…"}</h2></div>}
          {!busy && report && <ReportView title={stage === "scout" ? "Scout found this" : stage === "builder" ? "Builder prepared this" : "Verifier's verdict"} report={report} />}
          {stage === "scout" && <button className="primary-action" onClick={() => void act("building", "/api/real/build", "builder", { sessionId })} type="button">Approve Builder in isolation <span>→</span></button>}
          {stage === "builder" && <button className="primary-action" onClick={() => void act("verifying", "/api/real/verify", "verified", { sessionId })} type="button">Approve independent verification <span>→</span></button>}
          {patch && (stage === "builder" || stage === "verified") && <details className="patch-preview"><summary>Inspect the actual patch</summary><pre>{patch}</pre></details>}
          {stage === "verified" && <div className="apply-gate"><p><strong>Final human decision.</strong> Apply changes to your repository working tree? This does not commit or push.</p><label className="apply-confirm"><input checked={applyApproved} onChange={(event) => setApplyApproved(event.target.checked)} type="checkbox" /> I inspected this patch and authorize CONTROL ROOM to apply it.</label><button className="primary-action" disabled={!applyApproved} onClick={() => void act("applying", "/api/real/apply", "applied", { sessionId })} type="button">Apply verified patch <span>✓</span></button></div>}
          {stage === "applied" && <div className="applied-card"><strong>Changes are now in your working tree.</strong><p>Review them normally, run your project tests, then commit only if you are satisfied.</p></div>}
          {!report && !busy && <div className="real-empty"><span>01</span><h2>Evidence appears here.</h2><p>Write the task on the left. CONTROL ROOM will not let Builder act until you inspect Scout’s repository evidence.</p></div>}
        </aside>
      </main>
    </div>
  );
}
