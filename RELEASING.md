# Releasing

npm releases are built and published by GitHub Actions ([`.github/workflows/release.yml`](.github/workflows/release.yml)) from a tag on `main`. Every published version carries an [npm provenance](https://docs.npmjs.com/generating-provenance-statements) statement that links it to the exact commit and workflow run. Nobody publishes from a laptop, and no npm token is stored in GitHub.

| Tag | Package |
|---|---|
| `sdk-v<version>` | `@shdwsdk/sdk` |
| `energy-model-v<version>` | `@shdwsdk/energy-model` |
| `cli-v<version>` | `@shdwsdk/cli` |

## Steps

1. In a pull request, bump `version` in the package's `package.json` (for the SDK also `SDK_VERSION` in `packages/sdk/src/queue.ts`) and add a `CHANGELOG.md` entry. Merge it once CI is green.
2. Tag the merge commit on `main` and push the tag:

   ```bash
   git checkout main && git pull
   git tag sdk-v2.0.0
   git push origin sdk-v2.0.0
   ```

3. Approve the run in the **npm-release** environment (Actions → Release → Review deployments). The workflow checks that the tag matches the version, runs typecheck, tests and build, checks the tarball, and publishes with provenance.

When releasing several packages, push the tags in dependency order and wait for each to finish: `sdk-v*`, then `energy-model-v*`, then `cli-v*`.

## One-time setup

**GitHub environment.** Settings → Environments → New environment `npm-release`. Add yourself (and any co-maintainer) as a required reviewer, and under deployment branches and tags allow only tags matching `sdk-v*`, `energy-model-v*` and `cli-v*`.

**npm trusted publisher, per package.** On npmjs.com open the package → Settings → Trusted publishing → GitHub Actions, and enter:

- Organization or user: `shdwaibuild`
- Repository: `shdwsdk-js`
- Workflow filename: `release.yml`
- Environment name: `npm-release`

Then, on the same page, set publishing access to require two-factor authentication and disallow tokens, so only this workflow can publish.

A brand-new package has no settings page until its first version exists. Publish its first version once by hand from a clean checkout of the tagged commit (`npm publish --workspace <name> --access public`, with your 2FA code), then add the trusted publisher. Later versions go through the workflow.
