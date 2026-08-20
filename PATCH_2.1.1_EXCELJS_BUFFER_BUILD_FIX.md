# ZE CenterOS v2.1.1

Build hotfix for ExcelJS on Node 24 / Next.js 16.

Changed `lib/bulk-import.ts` to load uploaded XLSX bytes through `Uint8Array` instead of passing Node `Buffer<ArrayBuffer>` directly to ExcelJS. This resolves the TypeScript generic Buffer mismatch.

No SQL migration required. Migration 025 remains unchanged.
