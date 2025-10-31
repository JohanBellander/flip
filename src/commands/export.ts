import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";

export interface ExportOptions {
  input: string;
  viewport: string;
  out: string;
  theme?: string;
}

export async function runExport(options: ExportOptions): Promise<number> {
  if (!options.input || !options.viewport || !options.out) {
    console.error("--input, --viewport, and --out are required");
    return ExitCode.InvalidInput;
  }
  await initRunFolder();
  console.log("flip export: Not implemented yet");
  return ExitCode.Success;
}


