# Patch 1.0.3

- Fixed Vercel build failure when `.env.example` is absent from the repository.
- Package verification now treats the env template as documentation-only and supports both `.env.example` and `env.example`.
- Added `env.example` as a non-hidden fallback for GitHub web uploads.
- Improved repository root resolution in the verifier using `fileURLToPath`.
