# @shdwsdk/cli

Interactive setup wizard for [`@shdwsdk/sdk`](https://www.npmjs.com/package/@shdwsdk/sdk), the non-blocking AI carbon telemetry SDK for OpenAI, Anthropic and Gemini.

```bash
npx @shdwsdk/sdk init
# or
npx shdw-init
```

The wizard:

1. asks for your SHDWsdk API key and grid region (or takes them as flags);
2. writes them to your `.env`;
3. detects your framework and generates a ready-to-import wrapped client;
4. sends a test event to confirm telemetry reaches SHDWsdk.

Non-interactive:

```bash
npx shdw-init --api-key shdw_live_xxx --region eu-west-3 --model claude-sonnet-5-5 --out src/lib/shdw.ts
```

Source, issues and docs: [github.com/shdwaibuild/shdwsdk-js](https://github.com/shdwaibuild/shdwsdk-js) · [shdwsdk.ai/docs](https://www.shdwsdk.ai/docs)

MIT licensed.
