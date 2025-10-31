import { ExitCode } from "../constants/exitCodes";

export interface IngestOptions {
  input: string;
}

export async function runIngest(options: IngestOptions): Promise<number> {
  if (!options.input) {
    console.error("--input is required");
    return ExitCode.InvalidInput;
  }
  console.log("flip ingest: Not implemented yet");
  return ExitCode.Success;
}


