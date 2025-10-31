import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('flip')
  .description('FLIP — From LUMA Into Penpot (TypeScript CLI)')
  .version('0.1.0');

program
  .command('ingest')
  .description('Validate and normalize input scaffold (stub)')
  .requiredOption('--input <file>', 'Path to scaffold JSON')
  .action(() => {
    console.error('ingest: not implemented yet');
    process.exit(0);
  });

program
  .command('layout')
  .description('Compute frames per viewport (stub)')
  .requiredOption('--input <file>', 'Path to scaffold JSON')
  .requiredOption('--viewports <WxH[,WxH,...]>', 'Comma-separated viewports')
  .option('--out <dir>', 'Output directory')
  .action(() => {
    console.error('layout: not implemented yet');
    process.exit(0);
  });

program
  .command('export')
  .description('Produce a Penpot JSON-in-ZIP package (stub)')
  .requiredOption('--input <file>', 'Path to scaffold JSON')
  .requiredOption('--viewport <WxH>', 'Viewport WxH')
  .requiredOption('--out <zip>', 'Output zip path')
  .option('--theme <json>', 'Theme JSON path')
  .action(() => {
    console.error('export: not implemented yet');
    process.exit(0);
  });

program
  .command('pipeline')
  .description('Run ingest → layout → export (stub)')
  .requiredOption('--input <file>', 'Path to scaffold JSON')
  .requiredOption('--viewport <WxH>', 'Viewport WxH')
  .requiredOption('--out <zip>', 'Output zip path')
  .option('--theme <json>', 'Theme JSON path')
  .action(() => {
    console.error('pipeline: not implemented yet');
    process.exit(0);
  });

program
  .command('describe')
  .description('Output machine-readable capabilities and schema (stub)')
  .option('--format <fmt>', 'json|text', 'json')
  .action((opts: { format: string }) => {
    if (opts.format === 'json') {
      const out = {
        name: 'FLIP',
        version: '0.1.0',
        commands: ['ingest', 'layout', 'export', 'pipeline', 'describe'],
        exitCodes: { success: 0, invalid: 2, blocking: 3, io: 4, unsupported: 5 }
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    } else {
      process.stdout.write('FLIP CLI (stub)\n');
    }
    process.exit(0);
  });

program.parseAsync(process.argv);

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
    .description("Produce a Penpot JSON-in-ZIP package")
    .action(async (opts) => {
      const code = await runExport({ input: opts.input, viewport: opts.viewport, out: opts.out, theme: opts.theme });
      process.exitCode = code;
    });

  program
    .command("pipeline")
    .requiredOption("--input <file>", "Input scaffold JSON file")
    .requiredOption("--viewport <WxH>", "Target viewport")
    .requiredOption("--out <zip>", "Output ZIP file path")
    .option("--theme <json>", "Optional theme JSON file")
    .description("Run ingest → layout → export in one go")
    .action(async (opts) => {
      const code = await runPipeline({ input: opts.input, viewport: opts.viewport, out: opts.out, theme: opts.theme });
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


