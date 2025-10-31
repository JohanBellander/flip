import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";
import { createDiagnostics, writeDiagnostics } from "../utils/diagnostics";
import { runIngest } from "./ingest";
import { runLayout } from "./layout";
import { runExport } from "./export";

export interface PipelineOptions {
  input: string;
  viewport: string;
  out: string;
  theme?: string;
  penpotBundle?: boolean;
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

  // Step 1: ingest
  const ingestCode = await runIngest({ input: options.input });
  if (ingestCode !== ExitCode.Success) {
    return ingestCode;
  }

  // Step 2: layout for the chosen viewport, writing artifacts into the same run folder
  const layoutCode = await runLayout({ input: options.input, viewports: options.viewport, out: runDir });
  if (layoutCode !== ExitCode.Success) {
    return layoutCode;
  }

  // Step 3: export using theme if provided
  const exportCode = await runExport({
    input: options.input,
    viewport: options.viewport,
    out: options.out,
    theme: options.theme,
    penpotBundle: options.penpotBundle,
  });
  return exportCode;
}


