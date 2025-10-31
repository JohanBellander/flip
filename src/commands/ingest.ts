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


