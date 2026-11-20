# EcoLogits model catalog (vendored)

`models.json` is copied unmodified from the [EcoLogits](https://github.com/mlco2/ecologits)
Python package **v0.11.3** (`ecologits/data/models.json`), licensed under the
Mozilla Public License 2.0 (see `LICENSE`).

`retired-models.json` holds models that have since been removed from the
EcoLogits catalog (e.g. Claude 3.x, o1-mini, Gemini 1.5/2.0), copied unmodified
from EcoLogits v0.9.3, v0.8.2 and v0.6.3, each tagged with `ecologits_version`.
The current catalog always takes precedence over retired entries.

Together they are the source for `src/energy-model.generated.ts` and
`supabase/functions/_shared/energy-model.generated.ts`.

To update:

```bash
pip download ecologits==<version> --no-deps -d /tmp/eco
unzip -o /tmp/eco/ecologits-*.whl 'ecologits/data/models.json' -d /tmp/eco
cp /tmp/eco/ecologits/data/models.json packages/sdk/vendor/ecologits/models.json
# bump ECOLOGITS_VERSION in scripts/sync-ecologits.mjs, then:
npm run sync:ecologits --workspace=@shdwsdk/sdk
```
