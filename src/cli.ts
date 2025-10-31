#!/usr/bin/env node

import { Command } from "commander";
import { runIngest } from "./commands/ingest";
import { runLayout } from "./commands/layout";
import { runExport } from "./commands/export";
import { runPipeline } from "./commands/pipeline";
import { runDescribe } from "./commands/describe";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("flip")
    .description("FLIP — From LUMA Into Penpot (CLI)")
    .version("0.1.0");

  program
    .command("ingest")
    .requiredOption("--input <file>", "Input scaffold JSON file")
    .description("Validate and normalize the scaffold")
    .action(async (opts) => {
      const code = await runIngest({ input: opts.input });
      process.exitCode = code;
    });

  program
    .command("layout")
    .requiredOption("--input <file>", "Input scaffold JSON file")
    .requiredOption(
      "--viewports <WxH[,WxH,...]>",
      "Comma-separated list of target viewports"
    )
    .option("--out <dir>", "Output directory for layout artifacts")
    .description("Compute frames per viewport")
    .action(async (opts) => {
      const code = await runLayout({ input: opts.input, viewports: opts.viewports, out: opts.out });
      process.exitCode = code;
    });

  program
    .command("export")
    .requiredOption("--input <file>", "Input scaffold JSON file")
    .requiredOption("--viewport <WxH>", "Target viewport")
    .requiredOption("--out <zip>", "Output ZIP file path")
    .option("--theme <json>", "Optional theme JSON file")
    .option("--penpot-bundle", "Output Penpot export-files bundle structure (.penpot)")
    .description("Produce a Penpot JSON-in-ZIP package")
    .action(async (opts) => {
      const code = await runExport({ input: opts.input, viewport: opts.viewport, out: opts.out, theme: opts.theme, penpotBundle: Boolean(opts.penpotBundle) });
      process.exitCode = code;
    });

  program
    .command("pipeline")
    .requiredOption("--input <file>", "Input scaffold JSON file")
    .requiredOption("--viewport <WxH>", "Target viewport")
    .requiredOption("--out <zip>", "Output ZIP file path")
    .option("--theme <json>", "Optional theme JSON file")
    .option("--penpot-bundle", "Output Penpot export-files bundle structure (.penpot)")
    .description("Run ingest → layout → export in one go")
    .action(async (opts) => {
      const code = await runPipeline({ input: opts.input, viewport: opts.viewport, out: opts.out, theme: opts.theme, penpotBundle: Boolean(opts.penpotBundle) });
      process.exitCode = code;
    });

  program
    .command("describe")
    .option("--format <format>", "json|text", "json")
    .description("Output supported schema and capabilities")
    .action(async (opts) => {
      const code = await runDescribe({ format: opts.format });
      process.exitCode = code;
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 4; // Internal error
});


