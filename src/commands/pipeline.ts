import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";
import { createDiagnostics, writeDiagnostics } from "../utils/diagnostics";

export interface PipelineOptions {
  input: string;
  viewport: string;
  out: string;
  theme?: string;
}

export async function runPipeline(options: PipelineOptions): Promise<number> {
  if (!options.input || !options.viewport || !options.out) {
    const runDir = await initRunFolder();
    const diagPath = await writeDiagnostics(
      runDir,
      "diagnostics.json",
      createDiagnostics([
        {
          id: "invalid-args",
          severity: "error",
          message: "--input, --viewport, and --out are required",
        },
      ])
    );
    console.error(`--input, --viewport, and --out are required\nDiagnostics written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }
  const runDir = await initRunFolder();
  process.env.FLIP_RUN_DIR = runDir;
  console.log("flip pipeline: Not implemented yet");
  return ExitCode.Success;
}


