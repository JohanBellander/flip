import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import { runIngest } from "../src/commands/ingest";
import { runLayout } from "../src/commands/layout";
import { runExport } from "../src/commands/export";
import { runPipeline } from "../src/commands/pipeline";
import { ExitCode } from "../src/constants/exitCodes";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("command run-folder behavior (smoke)", () => {
  const originalCwd = process.cwd();
  let workDir: string;

  beforeAll(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "flip-cmd-tests-"));
    process.chdir(workDir);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    delete process.env.FLIP_RUN_DIR;
  });

  it("ingest initializes a run folder under .flip/runs", async () => {
    const code = await runIngest({ input: "dummy.json" });
    expect(code).toBe(ExitCode.Success);
    const base = path.resolve(".flip", "runs");
    expect(await exists(base)).toBe(true);
    const entries = await fs.readdir(base).catch(() => []);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("layout respects --out directory", async () => {
    const outDir = path.join(workDir, "layout-out");
    const code = await runLayout({ input: "dummy.json", viewports: "1280x800", out: outDir });
    expect(code).toBe(ExitCode.Success);
    expect(await exists(outDir)).toBe(true);
  });

  it("export initializes a run folder under .flip/runs", async () => {
    const code = await runExport({ input: "dummy.json", viewport: "1280x800", out: path.join(workDir, "export.zip") });
    expect(code).toBe(ExitCode.Success);
    const base = path.resolve(".flip", "runs");
    expect(await exists(base)).toBe(true);
  });

  it("pipeline creates a single run folder and sets FLIP_RUN_DIR", async () => {
    const code = await runPipeline({ input: "dummy.json", viewport: "1280x800", out: path.join(workDir, "export.zip") });
    expect(code).toBe(ExitCode.Success);
    const base = path.resolve(".flip", "runs");
    expect(await exists(base)).toBe(true);
    expect(process.env.FLIP_RUN_DIR && (await exists(process.env.FLIP_RUN_DIR))).toBe(true);
  });
});


