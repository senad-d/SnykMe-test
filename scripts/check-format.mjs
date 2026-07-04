#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const checkExtensions = new Set([".ts", ".mjs", ".json", ".md", ".yml", ".yaml"]);
const roots = [".github", "dev-shims", "docs", "scripts", "specs", "src", "test"];
const rootFiles = [
  ".gitignore",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "eslint.config.js",
  "README.md",
  "SECURITY.md",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
];

function executeCommand(command, args = []) {
  const child = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "inherit",
  });

  if (child.error) {
    throw child.error;
  }

  if (child.status !== 0) {
    process.exit(child.status);
  }
}

function extensionOf(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

async function checkFile(path) {
  const text = await readFile(path, "utf8");
  const failures = [];

  if (text.includes("\r")) failures.push("uses CRLF or bare CR line endings");
  if (text.length > 0 && !text.endsWith("\n")) failures.push("does not end with a newline");

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) failures.push(`line ${index + 1} has trailing whitespace`);
  });

  if (extensionOf(path) === ".json") {
    try {
      JSON.parse(text);
    } catch (error) {
      failures.push(`is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return failures;
}

function runTypecheck() {
  executeCommand("node", ["node_modules/typescript/bin/tsc", "--noEmit"]);
}

function runUnitTests() {
  executeCommand("node", ["--experimental-strip-types", "--test", "test/template.test.mjs"]);
}

function runCoverage() {
  executeCommand("node", [
    "--experimental-strip-types",
    "--experimental-test-coverage",
    "--test",
    "test/template.test.mjs",
  ]);
}

async function runFormatChecks() {
  const files = [...rootFiles];
  for (const root of roots) files.push(...(await collectFiles(root)));
  files.sort((a, b) => a.localeCompare(b));

  const failures = [];
  for (const file of files) {
    try {
      const fileFailures = await checkFile(file);
      for (const failure of fileFailures) failures.push(`${file}: ${failure}`);
    } catch (error) {
      failures.push(`${file}: could not be checked: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    console.error("Formatting check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`Formatting check passed for ${files.length} file(s).`);
  }
}

async function collectFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
      continue;
    }

    if (entry.isFile() && checkExtensions.has(extensionOf(path))) {
      files.push(path);
    }
  }

  return files;
}

const lifecycleEvent = process.env.npm_lifecycle_event;

if (lifecycleEvent === "typecheck") {
  runTypecheck();
} else if (lifecycleEvent === "test") {
  runUnitTests();
} else if (lifecycleEvent === "test:coverage") {
  runCoverage();
} else {
  await runFormatChecks();
}
