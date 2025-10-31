import { ExitCode } from "../constants/exitCodes";

export interface DescribeOptions {
  format?: "json" | "text";
}

export async function runDescribe(options: DescribeOptions): Promise<number> {
  const format = options.format || "json";
  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          commands: ["ingest", "layout", "export", "pipeline", "describe"],
          status: "skeleton",
        },
        null,
        2
      )
    );
  } else {
    console.log("flip: available commands -> ingest, layout, export, pipeline, describe");
  }
  return ExitCode.Success;
}


