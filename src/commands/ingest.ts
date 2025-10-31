import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";
import { createDiagnostics, writeDiagnostics } from "../utils/diagnostics";

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
  await initRunFolder();
  console.log("flip ingest: Not implemented yet");
  return ExitCode.Success;
}


