// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

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

describe("Real Mode local runner", () => {
  it("serves a token-protected repository status on loopback", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "control-room-test-"));
    let child: ChildProcess | undefined;
    try {
      await run("git", ["init", "-q"], fixture);
      await run("git", ["config", "user.email", "test@example.invalid"], fixture);
      await run("git", ["config", "user.name", "CONTROL ROOM test"], fixture);
      await writeFile(join(fixture, "README.md"), "# Fixture\n", "utf8");
      await run("git", ["add", "README.md"], fixture);
      await run("git", ["commit", "-qm", "fixture"], fixture);

      child = spawn("node", ["local/server.mjs", "--repo", fixture], {
        cwd: process.cwd(), env: { ...process.env, CONTROL_ROOM_PORT: "4318" }, stdio: ["ignore", "pipe", "pipe"],
      });
      await waitUntilReady(child);

      const html = await (await fetch("http://127.0.0.1:4318/")).text();
      const token = html.match(/control-room-token" content="([^"]+)/)?.[1];
      expect(token).toBeTruthy();
      const rejected = await fetch("http://127.0.0.1:4318/api/real/status");
      expect(rejected.status).toBe(403);
      const accepted = await fetch("http://127.0.0.1:4318/api/real/status", { headers: { "x-control-room-token": token! } });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({ repository: await realpath(fixture), clean: true });
    } finally {
      if (child?.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); }
      await rm(fixture, { recursive: true, force: true });
    }
  }, 15_000);
});
