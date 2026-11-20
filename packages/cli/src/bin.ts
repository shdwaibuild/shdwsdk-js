#!/usr/bin/env node
// ============================================================================
// @shdwsdk/cli — Executable Bin Entrypoint (npx shdw-init / npx @shdwsdk/cli init)
// ============================================================================

import { runCliFromArgv } from "./wizard.js";

runCliFromArgv(process.argv.slice(2)).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`SHDWsdk CLI Error: ${message}\n`);
  process.exitCode = 1;
});
