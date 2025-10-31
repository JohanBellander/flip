import { ExitCode } from "../constants/exitCodes";

export interface LayoutOptions {
  input: string;
  viewports: string;
  out?: string;
}

export async function runLayout(options: LayoutOptions): Promise<number> {
  if (!options.input || !options.viewports) {
    console.error("--input and --viewports are required");
    return ExitCode.InvalidInput;
  }
  console.log("flip layout: Not implemented yet");
  return ExitCode.Success;
}


