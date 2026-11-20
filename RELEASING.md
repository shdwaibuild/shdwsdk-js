# Releasing

1. Bump `version` in `packages/sdk/package.json` (and `SDK_VERSION` in `packages/sdk/src/queue.ts`) and/or `packages/cli/package.json`, and add a `CHANGELOG.md` entry.
2. Publish from a clean checkout of `main`:

```bash
npm ci
npm test
npm run build
npm login                                  # once per machine; npm asks for your 2FA code on publish
npm publish --workspace @shdwsdk/sdk
npm publish --workspace @shdwsdk/cli
```

3. Tag the release:

```bash
git tag sdk-v<version> && git tag cli-v<version> && git push --tags
```
