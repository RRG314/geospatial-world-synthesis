# Contributing

Contributions that make the existing bounded synthesis path safer, clearer, or more interoperable are welcome. Open an issue before a large API or provider change so scope and compatibility can be discussed.

## Development

```bash
npm ci
npm run validate:release
```

Use Node.js 20 or newer. Keep changes ESM and platform-neutral unless a file is explicitly Node-only. Add behavior-focused tests for public changes and update documentation in the same pull request.

Provider contributions must follow [docs/providers.md](docs/providers.md): bound requests and pagination, support abort signals, declare CRS, map only intended public fields, inject `fetch` where practical, and preserve dataset/license/attribution metadata. Do not commit live API responses, personal information, tokens, or example data without clear redistribution permission.

By submitting a contribution, you agree to license it under the MIT License. Data or examples with a different license must be clearly separated, lawful to redistribute, and documented in `THIRD_PARTY_NOTICES.md`.

Please keep discussion professional and constructive. Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
