import { ExitCode } from "../constants/exitCodes";
import { initRunFolder } from "../utils/runFolder";
import { createDiagnostics, writeDiagnostics } from "../utils/diagnostics";

export interface LayoutOptions {
  input: string;
  viewports: string;
  out?: string;
}

export async function runLayout(options: LayoutOptions): Promise<number> {
  if (!options.input || !options.viewports) {
    const runDir = await initRunFolder();
    const diagPath = await writeDiagnostics(
      runDir,
      "diagnostics.json",
      createDiagnostics([
        {
          id: "invalid-args",
          severity: "error",
          message: "--input and --viewports are required",
        },
      ])
    );
    console.error(`--input and --viewports are required\nDiagnostics written: ${diagPath}`);
    return ExitCode.InvalidInput;
  }
  await initRunFolder(options.out);
  console.log("flip layout: Not implemented yet");
  return ExitCode.Success;
}


