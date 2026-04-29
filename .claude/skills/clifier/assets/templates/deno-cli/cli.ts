/**
 * Deno CLI entrypoint for this package.
 *
 * Publish this file from `./cli` and keep the package root pointed at
 * `./mod.ts` for library consumers.
 *
 * @module
 */

import { Command } from "@cliffy/command";

function formatError(message: string, json: boolean): string {
  if (json) {
    return JSON.stringify({ ok: false, message }, null, 2);
  }

  return message;
}

export function buildCli(): Command<any, any, any, any, any, any, any, any> {
  const cli = new Command()
    .noExit()
    .name("tool-name")
    .version("0.1.0")
    .description("Replace with the website-specific summary.")
    .globalOption("--json", "Emit schema-stable JSON to stdout.")
    .action(() => {
      cli.showHelp();
    });

  // Add real commands here and keep handlers thin by calling library code
  // exported from "./mod.ts".

  return cli;
}

export async function runCli(args: string[] = Deno.args): Promise<void> {
  try {
    await buildCli().parse(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(formatError(message, args.includes("--json")));
    if (Deno.exitCode === 0) {
      Deno.exitCode = 1;
    }
  }
}

if (import.meta.main) {
  await runCli();
}
