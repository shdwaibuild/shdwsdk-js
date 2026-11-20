#!/usr/bin/env node
// ============================================================================
// @shdwsdk/sdk CLI Bin Shim — Supports `npx @shdwsdk/sdk init`
// Dynamically delegates to @shdwsdk/cli so @shdwsdk/sdk's main runtime stays
// 100% browser, Edge, and Deno compatible with zero Node.js dependencies.
// ============================================================================

interface CliModuleShape {
  runCliFromArgv: (argv: readonly string[]) => Promise<void>;
}

interface GlobalProcessShape {
  argv?: string[];
  exitCode?: number;
}

async function main(): Promise<void> {
  const proc = (globalThis as { process?: GlobalProcessShape }).process;
  const argv = proc?.argv?.slice(2) ?? [];

  try {
    const cliPkg = "@shdwsdk/cli";
    const cliModule = (await import(cliPkg)) as CliModuleShape;
    await cliModule.runCliFromArgv(argv);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `Unable to launch @shdwsdk/cli (${message}). Install @shdwsdk/cli or run: npx shdw-init`
    );
    if (proc) {
      proc.exitCode = 1;
    }
  }
}

void main();
