# ZE CenterOS Hotfix 1.0.3

Copy these files into the repository root and replace existing files:

- `scripts/verify-package.mjs`
- `package.json`
- `env.example`
- `PATCH_1.0.3.md`

This fixes the Vercel prebuild crash when `.env.example` is missing.
