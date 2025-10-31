import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";

export interface IngestOptions {
  input: string;
}

export async function runIngest(options: IngestOptions): Promise<number> {
  if (!options.input) {
    console.error("--input is required");
    return ExitCode.InvalidInput;
  }
  await initRunFolder();
  console.log("flip ingest: Not implemented yet");
  return ExitCode.Success;
}


