// ============================================================================
// @shdwsdk/cli — Public Library Entrypoint
// ============================================================================

export {
  buildBoilerplateSource,
  generateShdwBoilerplateFile,
  type GenerateBoilerplateParams,
  type GeneratedBoilerplateResult,
} from "./codegen.js";

export {
  DEFAULT_SHDW_INGEST_ENDPOINT,
  testShdwConnectivity,
  type ConnectivityTestResult,
} from "./connectivity.js";

export {
  injectShdwEnvVariables,
  resolveTargetEnvFile,
  upsertEnvContent,
  type EnvInjectionResult,
} from "./env.js";

export {
  parseCliArgs,
  runCliFromArgv,
  runInitWizard,
  type CliWizardOptions,
  type CliWizardResult,
} from "./wizard.js";
