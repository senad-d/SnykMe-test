#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ACTIVE_SOURCE_FILES = [
  "src/extension.ts",
  "src/constants.ts",
  "src/commands/snykme-command.ts",
  "src/tools/snykme-get-issues-tool.ts",
  "src/utils/snyk-issues.ts",
  "src/utils/snyk-runner.ts",
];

const ACTIVE_SOURCE_FILE_REGEX = /^src\/(?:commands|tools|utils)\/[^/]+\.ts$/;

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const hiddenEnvironmentFilePattern = /^\.env(?:$|\.)/;

const forbiddenChecks = [
  { label: "environment files", test: (path) => hiddenEnvironmentFilePattern.test(path) },
  { label: "project-local pi state", test: (path) => path === ".pi" || path.startsWith(".pi/") },
  { label: "node_modules", test: (path) => path.startsWith("node_modules/") || path.includes("/node_modules/") },
  { label: "planning specs", test: (path) => path.startsWith("specs/") || path.includes("/specs/") },
  { label: "local caches", test: (path) => /(^|\/)(\.cache|\.local|\.trivycache)(\/|$)/.test(path) },
  { label: "generated reports", test: (path) => /(^|\/)(coverage|trivy-reports|odc-reports)(\/|$)/.test(path) },
  { label: "npm tarballs", test: (path) => path.endsWith(".tgz") },
  { label: "OS/editor files", test: (path) => path.endsWith(".DS_Store") || path.endsWith(".log") },
];

function readPackFiles() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const output = execFileSync(npmCommand, ["pack", "--dry-run", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output);
  const pack = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!pack || !Array.isArray(pack.files)) {
    throw new Error("Unexpected npm pack --dry-run --json output.");
  }
  return pack.files.map((file) => file.path).sort((a, b) => a.localeCompare(b));
}

const files = readPackFiles();
const violations = [];
for (const file of files) {
  for (const check of forbiddenChecks) {
    if (check.test(file)) violations.push({ file, label: check.label });
  }
}

const sourceFiles = files.filter((file) => file.startsWith("src/") && file.endsWith(".ts"));
for (const sourceFile of sourceFiles) {
  if (sourceFile !== "src/extension.ts" && sourceFile !== "src/constants.ts") {
    if (!ACTIVE_SOURCE_FILE_REGEX.test(sourceFile)) {
      violations.push({ file: sourceFile, label: "inactive source module shipped" });
    }
  }
}

for (const requiredFile of ACTIVE_SOURCE_FILES) {
  if (!files.includes(requiredFile)) {
    violations.push({ file: requiredFile, label: "required shipped source file missing" });
  }
}

console.log(`${pkg.name} package dry-run contains ${files.length} file(s).`);
for (const file of files) console.log(`- ${file}`);

if (violations.length > 0) {
  console.error("\nForbidden package contents detected:");
  for (const violation of violations) {
    console.error(`- ${violation.file} (${violation.label})`);
  }
  process.exitCode = 1;
}
