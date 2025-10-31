import { promises as fs } from "fs";
import * as path from "path";

export type DiagnosticSeverity = "error" | "warn" | "info";

export interface DiagnosticIssue {
  id: string;
  severity: DiagnosticSeverity;
  message: string;
  jsonPointer?: string;
  nodeId?: string;
  viewport?: string;
  expected?: unknown;
  found?: unknown;
}

export interface DiagnosticsFile {
  issues: DiagnosticIssue[];
  createdAt: string;
}

export async function writeDiagnostics(
  runDir: string,
  fileName: string,
  diagnostics: DiagnosticsFile
): Promise<string> {
  const abs = path.resolve(runDir, fileName);
  const data = JSON.stringify(diagnostics, null, 2);
  await fs.writeFile(abs, data, "utf8");
  return abs;
}

export function createDiagnostics(issues: DiagnosticIssue[]): DiagnosticsFile {
  return {
    issues,
    createdAt: new Date().toISOString(),
  };
}


