import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";
import {
  formatRunTimestamp,
  createRunFolder,
  getLatestRunFolder,
  initRunFolder,
} from "../src/utils/runFolder";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("runFolder utilities", () => {
  const tmpRoot = path.join(os.tmpdir(), "flip-tests-run-folder");

  beforeAll(async () => {
    await fs.mkdir(tmpRoot, { recursive: true });
  });

  afterAll(async () => {
    // best-effort cleanup
    try {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it("formats timestamp as YYYYMMDD-HHMMSS-mmm", () => {
    const ts = formatRunTimestamp(new Date("2025-01-02T03:04:05.006Z"));
    expect(ts).toMatch(/^\d{8}-\d{6}-\d{3}$/);
  });

  it("creates a run folder under the provided base dir", async () => {
    const base = path.join(tmpRoot, "base-1");
    const dir = await createRunFolder(base);
    expect(await exists(dir)).toBe(true);
    expect(dir.startsWith(path.resolve(base))).toBe(true);
  });

  it("finds the latest run folder lexicographically", async () => {
    const base = path.join(tmpRoot, "base-2");
    await fs.mkdir(base, { recursive: true });
    const older = path.join(base, "20250101-000000-000");
    const newer = path.join(base, "20260101-000000-000");
    await fs.mkdir(older, { recursive: true });
    await fs.mkdir(newer, { recursive: true });
    const latest = await getLatestRunFolder(base);
    expect(latest && path.basename(latest)).toBe("20260101-000000-000");
  });

  it("initRunFolder respects explicitDir", async () => {
    const explicit = path.join(tmpRoot, "explicit-dir");
    const dir = await initRunFolder(explicit);
    expect(dir).toBe(path.resolve(explicit));
    expect(await exists(dir)).toBe(true);
  });

  it("initRunFolder respects FLIP_RUN_DIR env", async () => {
    const envDir = path.join(tmpRoot, "env-dir");
    process.env.FLIP_RUN_DIR = envDir;
    const dir = await initRunFolder();
    expect(dir).toBe(path.resolve(envDir));
    expect(await exists(dir)).toBe(true);
    delete process.env.FLIP_RUN_DIR;
  });
});


