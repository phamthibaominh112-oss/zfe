import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = path.resolve(new URL("..", import.meta.url).pathname);
const extensions = new Set([".ts", ".tsx"]);
const ignored = new Set(["node_modules", ".next"]);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) files.push(full);
  }
}

walk(root);
const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      isolatedModules: true
    }
  });
  for (const diagnostic of result.diagnostics || []) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    failures.push(`${path.relative(root, file)}: ${message}`);
  }
}

if (failures.length) {
  console.error("Source syntax check failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Source syntax check passed for ${files.length} TypeScript files.`);
