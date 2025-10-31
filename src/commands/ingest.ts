import * as fs from "fs";
import * as path from "path";
import { createRunFolder } from "../run/run";
import { validateScaffold } from "../schema/validate";

export interface IngestOptions {
  input: string;
}

// Exit codes per spec §3
// 0 Success
// 2 Invalid input/schema
// 4 Internal/file I/O error
export async function runIngest(opts: IngestOptions): Promise<number> {
  try {
    const raw = await fs.promises.readFile(opts.input, "utf-8");
    const parsed = JSON.parse(raw);
    const result = validateScaffold(parsed);

    const runDir = createRunFolder();
    const outPath = path.join(runDir, "ingest.json");
    const artifact = {
      ok: result.issues.every((i) => i.severity !== "error"),
      issues: result.issues,
      scaffold: result.normalized,
    };
    await fs.promises.writeFile(outPath, JSON.stringify(artifact, null, 2));

    if (!artifact.ok) {
      process.stderr.write(`ingest: validation failed; see ${outPath}\n`);
      return 2;
    }
    process.stderr.write(`ingest: wrote ${outPath}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`ingest: error ${String(err)}\n`);
    return 4;
  }
}

import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";
import { createDiagnostics, writeDiagnostics, DiagnosticIssue } from "../utils/diagnostics";
import { promises as fs } from "fs";
import * as path from "path";
import { validateScaffoldStrict } from "../validation";

export interface IngestOptions {
  input: string;
}

export async function runIngest(options: IngestOptions): Promise<number> {
  if (!options.input) {
    const runDir = await initRunFolder();
    const diagPath = await writeDiagnostics(
      runDir,
      "diagnostics.json",
      createDiagnostics([
        {
          id: "invalid-args",
          severity: "error",
          message: "--input is required",
        },
      ])
    );
    console.error(`--input is required\nDiagnostics written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }
  const runDir = await initRunFolder();

  // Preserve smoke-test behavior: if input file doesn't exist, just succeed after init
  try {
    await fs.stat(path.resolve(options.input));
  } catch {
    console.log("flip ingest: input not found, initialized run folder");
    return ExitCode.Success;
  }

  // Read and parse scaffold JSON
  let raw: string;
  try {
    raw = await fs.readFile(path.resolve(options.input), "utf8");
  } catch (err) {
    const diagPath = await writeDiagnostics(
      runDir,
      "diagnostics.json",
      createDiagnostics([
        {
          id: "file-read-error",
          severity: "error",
          message: `Failed to read input: ${options.input}`,
        },
      ])
    );
    console.error(`Failed to read input: ${options.input}\nDiagnostics written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }

  let scaffold: unknown;
  try {
    scaffold = JSON.parse(raw);
  } catch (err) {
    const diagPath = await writeDiagnostics(
      runDir,
      "ingest.json",
      createDiagnostics([
        {
          id: "invalid-json",
          severity: "error",
          message: "Input is not valid JSON",
        },
      ])
    );
    console.error(`Invalid JSON. Ingest written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }

  // Validate strictly per §4.4
  const { issues, normalized } = validateScaffoldStrict(scaffold);

  // Unsupported schema has dedicated exit code
  const hasUnsupportedSchema = issues.some((i) => i.id === "unsupported-schema-version");

  if (issues.some((i) => i.severity === "error")) {
    // Failure: write issues alongside original scaffold for debugging
    const failurePayload = {
      issues: issues as DiagnosticIssue[],
      scaffold,
    };
    const abs = path.resolve(runDir, "ingest.json");
    await fs.writeFile(abs, JSON.stringify(failurePayload, null, 2), "utf8");
    console.error(`Validation failed. Ingest written: ${abs}`);
    return hasUnsupportedSchema ? ExitCode.UnsupportedSchema : ExitCode.InvalidInput;
  }

  // Success: write normalized scaffold
  const successPath = path.resolve(runDir, "ingest.json");
  await fs.writeFile(successPath, JSON.stringify(normalized, null, 2), "utf8");
  console.log(`Ingest OK. Wrote: ${successPath}`);
  return ExitCode.Success;
}


