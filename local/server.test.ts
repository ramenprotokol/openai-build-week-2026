// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { request } from "node:http";

function run(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function waitUntilReady(child: ChildProcess) {
  return new Promise<void>((resolve, reject) => {
    let output = "";
    let errors = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes("Open: http://127.0.0.1:4318")) resolve();
    });
    child.stderr?.on("data", (chunk) => { errors += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`local runner exited early (${code}): ${errors}`)));
  });
}

function statusWithHost(host: string, token: string) {
  return new Promise<number | undefined>((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port: 4318,
      path: "/api/real/status",
      headers: { Host: host, "x-control-room-token": token },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("Real Mode local runner", () => {
  it("serves a token-protected repository status on loopback", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "control-room-test-"));
    let child: ChildProcess | undefined;
    try {
      const staticRoot = join(fixture, "static");
      await mkdir(staticRoot);
      await run("git", ["init", "-q"], fixture);
      await run("git", ["config", "user.email", "test@example.invalid"], fixture);
      await run("git", ["config", "user.name", "CONTROL ROOM test"], fixture);
      await writeFile(join(fixture, "README.md"), "# Fixture\n", "utf8");
      await writeFile(join(staticRoot, "index.html"), "<!doctype html><html><head></head><body>Fixture</body></html>\n", "utf8");
      await run("git", ["add", "."], fixture);
      await run("git", ["commit", "-qm", "fixture"], fixture);

      child = spawn("node", ["local/server.mjs", "--repo", fixture], {
        cwd: process.cwd(), env: { ...process.env, CONTROL_ROOM_PORT: "4318", CONTROL_ROOM_STATIC_ROOT: staticRoot }, stdio: ["ignore", "pipe", "pipe"],
      });
      await waitUntilReady(child);

      const html = await (await fetch("http://127.0.0.1:4318/")).text();
      const token = html.match(/control-room-token" content="([^"]+)/)?.[1];
      expect(token).toBeTruthy();

      const page = await fetch("http://127.0.0.1:4318/");
      expect(page.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
      expect(page.headers.get("X-Frame-Options")).toBe("DENY");
      expect(page.headers.get("Referrer-Policy")).toBe("no-referrer");

      const rejected = await fetch("http://127.0.0.1:4318/api/real/status");
      expect(rejected.status).toBe(403);
      const rejectedOrigin = await fetch("http://127.0.0.1:4318/api/real/status", {
        headers: { "x-control-room-token": token!, Origin: "https://attacker.invalid" },
      });
      expect(rejectedOrigin.status).toBe(403);
      expect(await statusWithHost("attacker.invalid", token!)).toBe(403);
      const accepted = await fetch("http://127.0.0.1:4318/api/real/status", { headers: { "x-control-room-token": token! } });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({ repository: await realpath(fixture), clean: true });
    } finally {
      if (child?.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
      await rm(fixture, { recursive: true, force: true });
    }
  }, 15_000);
});
