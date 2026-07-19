import { Codex } from "@openai/codex-sdk";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const host = "127.0.0.1";
const port = Number(process.env.CONTROL_ROOM_PORT || 4317);
const staticRoot = resolve(process.env.CONTROL_ROOM_STATIC_ROOT || "dist/client");
const token = randomBytes(24).toString("hex");
const model = process.env.CONTROL_ROOM_MODEL || "gpt-5.6-sol";
const repoArg = process.argv.indexOf("--repo");
const repository = await realpath(resolve(repoArg >= 0 ? process.argv[repoArg + 1] || "" : process.cwd()));
const sessions = new Map();
const localAuthorities = new Set([`${host}:${port}`, `localhost:${port}`]);
const localOrigins = new Set([...localAuthorities].map((authority) => `http://${authority}`));

const responseSecurityHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

const documentSecurityHeaders = {
  ...responseSecurityHeaders,
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

const scoutSchema = { type: "object", additionalProperties: false, required: ["summary", "findings", "plan", "risks"], properties: {
  summary: { type: "string" },
  findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["path", "line", "claim"], properties: { path: { type: "string" }, line: { type: "integer" }, claim: { type: "string" } } } },
  plan: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } },
} };
const builderSchema = { type: "object", additionalProperties: false, required: ["summary", "filesChanged", "testsSuggested", "risks"], properties: {
  summary: { type: "string" }, filesChanged: { type: "array", items: { type: "string" } },
  testsSuggested: { type: "array", items: { type: "string" } }, risks: { type: "array", items: { type: "string" } },
} };
const verifierSchema = { type: "object", additionalProperties: false, required: ["status", "summary", "checks", "remainingRisks"], properties: {
  status: { type: "string", enum: ["pass", "concern", "fail"] }, summary: { type: "string" },
  checks: { type: "array", items: { type: "string" } }, remainingRisks: { type: "array", items: { type: "string" } },
} };

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    ...responseSecurityHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function isTrustedLocalRequest(req) {
  const authority = req.headers.host?.toLowerCase();
  if (!authority || !localAuthorities.has(authority)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return localOrigins.has(new URL(origin).origin); } catch { return false; }
}

async function git(cwd, args, options = {}) {
  const result = await exec("git", ["-C", cwd, ...args], { maxBuffer: 8_000_000, ...options });
  return result.stdout.trim();
}

async function repositoryStatus() {
  const root = await git(repository, ["rev-parse", "--show-toplevel"]);
  if (resolve(root) !== repository) throw new Error("Pass the repository root, not a subfolder.");
  const dirty = await git(repository, ["status", "--porcelain"]);
  const branch = await git(repository, ["branch", "--show-current"]);
  const head = await git(repository, ["rev-parse", "HEAD"]);
  return { repository, branch: branch || "detached HEAD", head, clean: dirty.length === 0 };
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 32_000) throw new Error("Request is too large.");
  }
  return raw ? JSON.parse(raw) : {};
}

function validateBrief(brief) {
  for (const key of ["objective", "boundary", "doneWhen", "evidence"]) {
    if (typeof brief?.[key] !== "string" || brief[key].trim().length < 3 || brief[key].length > 2000) {
      throw new Error(`Brief field '${key}' is missing or too long.`);
    }
  }
  return brief;
}

function codexThread(workingDirectory, sandboxMode) {
  return new Codex().startThread({ workingDirectory, sandboxMode, model, modelReasoningEffort: "high", approvalPolicy: "never", networkAccessEnabled: false });
}

async function runRole(role, workingDirectory, sandboxMode, prompt, outputSchema) {
  const startedAt = new Date().toISOString();
  const thread = codexThread(workingDirectory, sandboxMode);
  const result = await thread.run(prompt, { outputSchema });
  return {
    result,
    trace: {
      role,
      model,
      sandboxMode,
      networkAccess: false,
      threadId: thread.id,
      startedAt,
      completedAt: new Date().toISOString(),
      usage: result.usage,
      evidenceReferences: [],
    },
  };
}

function publicTrace(session) {
  const redactEvidence = (value) => {
    let redacted = String(value).replaceAll(repository, "[repository]");
    if (session.worktree) redacted = redacted.replaceAll(session.worktree, "[isolated-worktree]");
    return redacted;
  };
  return {
    schemaVersion: "1.0",
    product: "CONTROL ROOM",
    sessionId: session.id,
    repositoryName: basename(repository),
    baseCommit: session.baseHead,
    startedAt: session.startedAt,
    completedAt: session.completedAt || null,
    finalStatus: session.finalStatus || "in_progress",
    roles: session.traces.map((trace) => ({
      ...trace,
      evidenceReferences: trace.evidenceReferences.map(redactEvidence),
    })),
  };
}

async function createWorktree(session) {
  const tempRoot = await mkdtemp(join(tmpdir(), "control-room-"));
  const worktree = join(tempRoot, "worktree");
  await git(repository, ["worktree", "add", "--detach", worktree, session.baseHead]);
  session.tempRoot = tempRoot; session.worktree = worktree;
}

async function patchFor(session) {
  if (!session.worktree) return "";
  const result = await exec("git", ["-C", session.worktree, "diff", "--binary", "--no-ext-diff"], { maxBuffer: 8_000_000 });
  return result.stdout;
}

async function runWithInput(command, args, cwd, input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(stderr || `${command} exited ${code}`)));
    child.stdin.end(input);
  });
}

async function cleanSession(session) {
  if (!session?.worktree) return;
  try { await git(repository, ["worktree", "remove", "--force", session.worktree]); } catch { /* only our temporary worktree is removed */ }
  await rm(session.tempRoot, { recursive: true, force: true }); session.worktree = null;
}

async function api(req, res, pathname) {
  if (req.headers["x-control-room-token"] !== token) return json(res, 403, { error: "Local session token rejected." });
  if (pathname === "/api/real/status" && req.method === "GET") return json(res, 200, await repositoryStatus());
  const body = await readBody(req);
  if (pathname === "/api/real/scout" && req.method === "POST") {
    const brief = validateBrief(body.brief); const status = await repositoryStatus();
    if (!status.clean) throw new Error("Repository must be clean before Real Mode starts. Commit or stash your changes first.");
    const id = randomBytes(10).toString("hex");
    const prompt = `You are Scout in CONTROL ROOM. Inspect this repository read-only. Do not edit, commit, push, or use the network.\n\nObjective: ${brief.objective}\nBoundary: ${brief.boundary}\nDone when: ${brief.doneWhen}\nRequired evidence: ${brief.evidence}\n\nReturn only claims supported by repository evidence. Cite repository-relative paths and real 1-based line numbers. Propose a bounded implementation plan.`;
    const { result, trace } = await runRole("scout", repository, "read-only", prompt, scoutSchema);
    const report = JSON.parse(result.finalResponse);
    trace.evidenceReferences = report.findings.map((finding) => `${finding.path}:${finding.line}`);
    const session = { id, brief, baseHead: status.head, scout: result.finalResponse, startedAt: trace.startedAt, traces: [trace] };
    sessions.set(id, session);
    return json(res, 200, { sessionId: id, report, trace: publicTrace(session) });
  }
  const session = sessions.get(body.sessionId);
  if (!session) throw new Error("Real Mode session was not found. Start with Scout again.");
  if (pathname === "/api/real/build" && req.method === "POST") {
    const status = await repositoryStatus();
    if (!status.clean || status.head !== session.baseHead) throw new Error("Repository changed after Scout. Start a fresh session so evidence stays valid.");
    if (session.worktree) await cleanSession(session);
    await createWorktree(session);
    try {
      const prompt = `You are Builder in CONTROL ROOM. Work only in this isolated Git worktree. Implement the approved task. Do not commit, push, change git configuration, or use the network. Keep changes inside the stated boundary.\n\nObjective: ${session.brief.objective}\nBoundary: ${session.brief.boundary}\nDone when: ${session.brief.doneWhen}\nRequired evidence: ${session.brief.evidence}\n\nScout report:\n${session.scout}\n\nMake the code changes now, then summarize exactly what changed and what should be tested.`;
      const { result, trace } = await runRole("builder", session.worktree, "workspace-write", prompt, builderSchema);
      session.builder = result.finalResponse;
      await git(session.worktree, ["add", "-N", "--", "."]);
      const patch = await patchFor(session); const files = await git(session.worktree, ["diff", "--name-only"]); const statText = await git(session.worktree, ["diff", "--stat"]);
      const changedFiles = files ? files.split("\n") : [];
      trace.evidenceReferences = changedFiles;
      session.traces.push(trace);
      return json(res, 200, { report: JSON.parse(result.finalResponse), files: changedFiles, stat: statText, patch: patch.slice(0, 120_000), trace: publicTrace(session) });
    } catch (error) {
      await cleanSession(session);
      throw error;
    }
  }
  if (pathname === "/api/real/verify" && req.method === "POST") {
    if (!session.worktree || !session.builder) throw new Error("Builder has not prepared a change.");
    const diffCheck = await git(session.worktree, ["diff", "--check"]); const patch = await patchFor(session);
    const prompt = `You are Verifier in CONTROL ROOM. Independently review the uncommitted diff in this worktree. Read only: never modify files, commit, push, or use the network. Check the requested completion condition, correctness, regressions, tests, security, and boundary compliance.\n\nObjective: ${session.brief.objective}\nBoundary: ${session.brief.boundary}\nDone when: ${session.brief.doneWhen}\nRequired evidence: ${session.brief.evidence}\n\nBuilder report:\n${session.builder}\n\nInspect the actual repository and git diff. Report pass only when the evidence supports it.`;
    const { result, trace } = await runRole("verifier", session.worktree, "read-only", prompt, verifierSchema);
    session.verified = result.finalResponse;
    const report = JSON.parse(result.finalResponse);
    trace.evidenceReferences = report.checks;
    session.traces.push(trace);
    session.completedAt = trace.completedAt;
    session.finalStatus = report.status;
    return json(res, 200, { report, diffCheck: diffCheck || "No whitespace errors.", patch: patch.slice(0, 120_000), trace: publicTrace(session) });
  }
  if (pathname === "/api/real/apply" && req.method === "POST") {
    if (!session.verified) throw new Error("Independent verification is required before applying a patch.");
    if (JSON.parse(session.verified).status === "fail") throw new Error("Verifier failed this change. It cannot be applied.");
    const status = await repositoryStatus();
    if (!status.clean || status.head !== session.baseHead) throw new Error("Repository changed during the session. The patch was not applied.");
    const patch = await patchFor(session); if (!patch) throw new Error("Builder produced no patch.");
    await runWithInput("git", ["-C", repository, "apply", "--check", "-"], repository, patch);
    await runWithInput("git", ["-C", repository, "apply", "-"], repository, patch);
    session.completedAt ||= new Date().toISOString(); session.finalStatus = "applied";
    const trace = publicTrace(session);
    await cleanSession(session); sessions.delete(session.id);
    return json(res, 200, { applied: true, files: await git(repository, ["status", "--short"]), trace });
  }
  if (pathname === "/api/real/discard" && req.method === "POST") {
    await cleanSession(session); sessions.delete(session.id); return json(res, 200, { discarded: true });
  }
  return json(res, 404, { error: "Unknown local API route." });
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""); let file = resolve(staticRoot, requested);
  if (!file.startsWith(staticRoot + sep) && file !== join(staticRoot, "index.html")) return json(res, 403, { error: "Forbidden" });
  if (!existsSync(file) || !(await stat(file)).isFile()) file = join(staticRoot, "index.html");
  if (extname(file) === ".html") {
    const html = (await readFile(file, "utf8")).replace("</head>", `<meta name="control-room-token" content="${token}"></head>`);
    res.writeHead(200, {
      ...documentSecurityHeaders,
      "content-type": mime[".html"],
      "cache-control": "no-store",
    });
    return res.end(html);
  }
  res.writeHead(200, {
    ...responseSecurityHeaders,
    "content-type": mime[extname(file)] || "application/octet-stream",
  });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (!isTrustedLocalRequest(req)) {
      return json(res, 403, { error: "Local request origin rejected." });
    }
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (url.pathname.startsWith("/api/real/")) return await api(req, res, url.pathname);
    return await serveStatic(req, res, url.pathname);
  } catch (error) { return json(res, 400, { error: error instanceof Error ? error.message : "Unknown local runner error." }); }
});

server.listen(port, host, async () => {
  try { const status = await repositoryStatus(); console.log(`\nCONTROL ROOM Real Mode\nRepository: ${status.repository}\nOpen: http://${host}:${port}\n`); }
  catch (error) { console.error(`CONTROL ROOM could not open the repository: ${error.message}`); server.close(); process.exitCode = 1; }
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  for (const session of sessions.values()) await cleanSession(session);
  server.close(() => process.exit(0));
});
