# Changelog

## @shdwsdk/sdk 1.7.2 · @shdwsdk/cli 1.2.2 (2026-11-20)

**@shdwsdk/sdk 1.7.2**: packaging only. The npm page now has a README, license and links to this repository. No runtime changes.

**@shdwsdk/cli 1.2.2**:
- The setup wizard's connectivity check and generated code use `https://www.shdwsdk.ai/api/v1/ingest-telemetry` (previously the bare `shdwsdk.ai` host).
- Default model is now `claude-sonnet-5-5` (was `claude-3-7-sonnet`), with current examples in `--help`.
- Generated code keeps the exact model ID you entered instead of replacing it with the catalog pattern it matched.
- The npm page now has a README, license and links to this repository.

## @shdwsdk/sdk 1.7.1

- Grid region is no longer defaulted to `us-east-1`; events without a region use your organization's default region setting.
- Telemetry endpoint: `https://www.shdwsdk.ai/api/v1/ingest-telemetry`.
