import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";

export interface PipelineOptions {
  input: string;
  viewport: string;
  out: string;
  theme?: string;
}

export async function runPipeline(options: PipelineOptions): Promise<number> {
  if (!options.input || !options.viewport || !options.out) {
    console.error("--input, --viewport, and --out are required");
    return ExitCode.InvalidInput;
  }
  const runDir = await initRunFolder();
  process.env.FLIP_RUN_DIR = runDir;
  console.log("flip pipeline: Not implemented yet");
  return ExitCode.Success;
}


