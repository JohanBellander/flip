import { promises as fs } from "fs";
import * as path from "path";

function pad(num: number, size: number): string {
  const s = String(num);
  return s.length >= size ? s : "0".repeat(size - s.length) + s;
}

export function formatRunTimestamp(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  const d = pad(date.getDate(), 2);
  const hh = pad(date.getHours(), 2);
  const mm = pad(date.getMinutes(), 2);
  const ss = pad(date.getSeconds(), 2);
  const ms = pad(date.getMilliseconds(), 3);
  return `${y}${m}${d}-${hh}${mm}${ss}-${ms}`;
}

export function getRunBaseDir(): string {
  return path.resolve(".flip", "runs");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function createRunFolder(baseDir: string = getRunBaseDir(), timestamp?: string): Promise<string> {
  const ts = timestamp ?? formatRunTimestamp();
  const dir = path.resolve(baseDir, ts);
  await ensureDir(dir);
  return dir;
}

export async function getLatestRunFolder(baseDir: string = getRunBaseDir()): Promise<string | null> {
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    if (folders.length === 0) return null;
    const latest = folders[folders.length - 1];
    return path.resolve(baseDir, latest);
  } catch {
    return null;
  }
}

export async function initRunFolder(explicitDir?: string): Promise<string> {
  const fromEnv = process.env.FLIP_RUN_DIR;
  if (explicitDir) {
    const abs = path.resolve(explicitDir);
    await ensureDir(abs);
    return abs;
  }
  if (fromEnv && fromEnv.trim().length > 0) {
    const abs = path.resolve(fromEnv);
    await ensureDir(abs);
    return abs;
  }
  const dir = await createRunFolder();
  return dir;
}


