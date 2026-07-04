import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import registerSnykMeExtension from "../src/extension.ts";
import { registerSnykMeCommand } from "../src/commands/snykme-command.ts";
import { registerSnykMeTool } from "../src/tools/snykme-get-issues-tool.ts";
import { summarizeSnykIssues } from "../src/utils/snyk-issues.ts";

const packageJsonPath = new URL("../package.json", import.meta.url);
const extensionPath = new URL("../src/extension.ts", import.meta.url);
const commandPath = new URL("../src/commands/snykme-command.ts", import.meta.url);
const toolPath = new URL("../src/tools/snykme-get-issues-tool.ts", import.meta.url);
const readmePath = new URL("../README.md", import.meta.url);
const specPath = new URL("../specs/spec-tasks.md", import.meta.url);
const projectDefinitionPath = new URL("../docs/project-definition-brief.md", import.meta.url);
const structurePath = new URL("../docs/STRUCTURE.md", import.meta.url);
const architecturePath = new URL("../specs/spec-architecture.md", import.meta.url);
const guidelinesPath = new URL("../specs/spec-guidelines.md", import.meta.url);

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const extensionSource = await readFile(extensionPath, "utf8");
const commandSource = await readFile(commandPath, "utf8");
const toolSource = await readFile(toolPath, "utf8");
const readme = await readFile(readmePath, "utf8");
const architectureSource = await readFile(architecturePath, "utf8");
const guidelinesSource = await readFile(guidelinesPath, "utf8");
const projectDefinitionSource = await readFile(projectDefinitionPath, "utf8");
const structureSource = await readFile(structurePath, "utf8");

function registerSnykCommand() {
  const registrations = [];
  registerSnykMeCommand({
    registerCommand(name, command) {
      registrations.push({ name, command });
    },
  });
  assert.equal(registrations.length, 1);
  return registrations[0];
}

function registerSnykTool() {
  const registrations = [];
  registerSnykMeTool({
    registerTool(tool) {
      registrations.push(tool);
    },
  });
  assert.equal(registrations.length, 1);
  return registrations[0];
}

function createBootstrapRecorder() {
  const registrations = [];
  const ancillary = [];
  return {
    registrations,
    ancillary,
    api: {
      registerCommand(name, command) {
        registrations.push({ kind: "command", name, payload: command });
      },
      registerTool(tool) {
        registrations.push({ kind: "tool", name: tool?.name, payload: tool });
      },
      registerEvent(name) {
        ancillary.push({ kind: "event", name });
      },
      registerHook(name) {
        ancillary.push({ kind: "hook", name });
      },
      registerPrompt(name) {
        ancillary.push({ kind: "prompt", name });
      },
      registerResource(name) {
        ancillary.push({ kind: "resource", name });
      },
    },
  };
}

function createNotifyCapture() {
  const messages = [];
  const context = {
    ui: {
      notify(message) {
        messages.push(message);
      },
    },
  };
  return { context, messages };
}

function getToolExpectedSeverityOrder() {
  return ["critical", "high", "medium", "low", "warning", "info", "unknown"];
}

function assertContains(fileLabel, text, token) {
  assert.ok(text.includes(token), `${fileLabel} missing required contract token: ${token}`);
}

function normalizeForSearch(text) {
  return text.replace(/\r?\n/g, " ");
}

function assertPreparedToolResponse(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  assert.ok(result.content[0].text.includes("tool is prepared"));
  assert.equal(result.content[0].text.includes("deferred"), true);
  assert.equal(result.details.plannedCommand, "snyk code test . --sarif > snyk-code.sarif");
  assert.deepEqual(result.details.plannedCleanupTargets, ["snyk-code.sarif", "snyk-code-clean.json"]);
}

async function runCommandAndCapture(command, args) {
  const capture = createNotifyCapture();
  await command.handler(args, capture.context);
  return capture.messages;
}

test("package identity is prepared for SnykMe", async () => {
  assert.equal(packageJson.name, "@senad-d/snykme");
  assert.equal(
    packageJson.repository?.url,
    "git+https://github.com/senad-d/SnykMe.git",
  );
  assert.match(packageJson.description, /Snyk/i);
});

test("extension entry wires SnykMe registrations", async () => {
  assert.deepEqual(packageJson.pi?.extensions, ["./src/extension.ts"]);
  assert.equal(typeof packageJson.pi?.extensions?.[0], "string");
  assert.ok(extensionSource.includes("registerSnykMeCommand"));
  assert.ok(extensionSource.includes("registerSnykMeTool"));
  assert.ok(extensionSource.includes("./commands/snykme-command.ts"));
  assert.ok(extensionSource.includes("./tools/snykme-get-issues-tool.ts"));
});

test("bootstrap invariant: registration surface is thin, explicit, and activation-only", async () => {
  const recorder = createBootstrapRecorder();

  assert.equal(recorder.registrations.length, 0, "no registrations before extension activation");
  assert.equal(recorder.ancillary.length, 0, "no ancillary registrations before extension activation");

  registerSnykMeExtension(recorder.api);

  assert.equal(recorder.registrations.length, 2, "exactly one command and one tool registration is expected");

  const commandRegistrations = recorder.registrations.filter((entry) => entry.kind === "command");
  const toolRegistrations = recorder.registrations.filter((entry) => entry.kind === "tool");

  assert.equal(commandRegistrations.length, 1);
  assert.equal(commandRegistrations[0].name, "/snykme");
  assert.equal(toolRegistrations.length, 1);
  assert.equal(toolRegistrations[0].name, "snykme_get_issues");

  assert.equal(recorder.ancillary.length, 0, "bootstrap should not register lifecycle or prompt/resource hooks in this scope");

  const [commandRegistration] = commandRegistrations;
  const command = commandRegistration.payload;
  assert.equal(typeof command.handler, "function");
  assert.equal(typeof command.getArgumentCompletions, "function");
  assert.ok(Object.keys(command).length > 0);
});

test("runtime contract stays in parity with docs and specs", async () => {
  const tool = registerSnykTool();
  const { name: commandName } = registerSnykCommand();

  const checkedDocs = [
    { label: "README.md", text: readme, required: ["/snykme", "snykme_get_issues", "includeRaw", "limit"] },
    {
      label: "docs/project-definition-brief.md",
      text: projectDefinitionSource,
      required: ["/snykme", "snykme_get_issues"],
    },
    {
      label: "docs/STRUCTURE.md",
      text: structureSource,
      required: ["/snykme", "snykme_get_issues"],
    },
    {
      label: "specs/spec-architecture.md",
      text: architectureSource,
      required: ["/snykme", "snykme_get_issues", "includeRaw", "limit"],
    },
    {
      label: "specs/spec-guidelines.md",
      text: guidelinesSource,
      required: ["/snykme", "snykme_get_issues"],
    },
  ];

  assert.equal(commandName, "/snykme");
  assert.equal(tool.name, "snykme_get_issues");

  assert.equal(tool.parameters.type, "object");
  assert.equal(tool.parameters.additionalProperties, false);
  const properties = tool.parameters.properties;
  assert.ok(properties);
  assert.deepEqual(Object.keys(properties).sort(), ["includeRaw", "limit"]);
  assert.equal(properties.includeRaw.type, "boolean");
  assert.equal(properties.limit.type, "integer");
  assert.equal(properties.limit.minimum, 1);
  assert.equal(properties.limit.maximum, 200);

  const normalizedReadme = normalizeForSearch(readme);
  assert.ok(/limit[^\n]{0,80}min\s*`?1`?[^\n]{0,80}max\s*`?200`?/i.test(normalizedReadme), "README.md contract must include limit min/max bounds");

  for (const { label, text, required } of checkedDocs) {
    for (const token of required) {
      assertContains(label, text, token);
    }
  }

  const commandRegistration = registerSnykCommand();
  const command = commandRegistration;
  assert.ok(command.command.description.includes("collect a summarized Snyk code scan"));
  assert.ok(command.command.getArgumentCompletions("").length > 0);
});

test("/snykme command exposes deterministic argument completions", async () => {
  const { command } = registerSnykCommand();

  const allCompletions = command.getArgumentCompletions("");
  assert.deepEqual(allCompletions, [
    { value: "--help", label: "--help" },
    { value: "--dry-run", label: "--dry-run" },
    { value: "--status", label: "--status" },
  ]);

  const helpCompletions = command.getArgumentCompletions("--h");
  assert.deepEqual(helpCompletions, [{ value: "--help", label: "--help" }]);

  const noMatchCompletions = command.getArgumentCompletions("--x");
  assert.equal(noMatchCompletions, null);

  assert.deepEqual(command.getArgumentCompletions(""), command.getArgumentCompletions(""));
});

test("/snykme command handles malformed and unknown arguments deterministically", async () => {
  const { command } = registerSnykCommand();

  const cases = [
    { args: "", expected: "prepared and scaffolded" },
    { args: "   ", expected: "prepared and scaffolded" },
    { args: "\n\t", expected: "prepared and scaffolded" },
    { args: "--help", expected: "Usage" },
    { args: "--dry-run", expected: "dry run" },
    { args: "--status", expected: "preparation mode" },
    { args: "--help --status", expected: "Supported flags" },
    { args: "--foo", expected: "Supported flags" },
    { args: "--help --foo", expected: "Supported flags" },
    { args: "--status=now", expected: "Supported flags" },
    { args: "--hELP", expected: "Usage" },
  ];

  for (const { args, expected } of cases) {
    const first = await runCommandAndCapture(command, args);
    assert.equal(first.length, 1);
    assert.ok(first[0].includes(expected));

    const second = await runCommandAndCapture(command, args);
    assert.equal(second.length, 1);
    assert.equal(second[0], first[0]);
  }
});

test("snykme tool schema contract and prepared execution are deterministic", async () => {
  const tool = registerSnykTool();

  assert.equal(tool.parameters.type, "object");
  assert.equal(tool.parameters.additionalProperties, false);

  assert.ok(tool.parameters.properties);
  const { includeRaw, limit } = tool.parameters.properties;
  assert.ok(includeRaw && typeof includeRaw === "object");
  assert.equal(includeRaw.type, "boolean");

  assert.ok(limit && typeof limit === "object");
  assert.equal(limit.type, "integer");
  assert.equal(limit.minimum, 1);
  assert.equal(limit.maximum, 200);

  const expectedKeys = ["includeRaw", "limit"];
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), expectedKeys);

  const preparedResult = await tool.execute("tool-call", { includeRaw: true, limit: 5 });
  const unknownPayloadResult = await tool.execute("tool-call-invalid", { limit: "5", random: true });
  const nullPayloadResult = await tool.execute("tool-call-null", null);

  assertPreparedToolResponse(preparedResult);
  assertPreparedToolResponse(unknownPayloadResult);
  assertPreparedToolResponse(nullPayloadResult);
  assert.equal(
    preparedResult.content[0].text,
    unknownPayloadResult.content[0].text,
    "prepared payload shape must stay deterministic for malformed tool inputs",
  );
  assert.equal(
    preparedResult.content[0].text,
    nullPayloadResult.content[0].text,
    "null payload should stay deterministic in prepared mode",
  );

  const unknownCalls = [
    { payload: undefined },
    { payload: "not-an-object" },
    { payload: 12 },
    { payload: [] },
    { payload: { includeRaw: "true", limit: 3, unknown: true } },
  ];

  for (const { payload } of unknownCalls) {
    const repeated = await tool.execute(`tool-call-${String(Math.random())}`, payload);
    assertPreparedToolResponse(repeated);
  }

  const secondPrepared = await tool.execute("tool-call-2", { includeRaw: false, limit: 1 });
  const secondPreparedAgain = await tool.execute("tool-call-3", { includeRaw: false, limit: "1", debug: true });
  assert.deepEqual(secondPrepared.content, secondPreparedAgain.content);
  assert.deepEqual(secondPrepared.details, secondPreparedAgain.details);
});

test("summarizeSnykIssues handles empty input deterministically", () => {
  const summary = summarizeSnykIssues([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.invalidCount, 0);
  assert.deepEqual(summary.bySeverity, {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    warning: 0,
    info: 0,
    unknown: 0,
  });
  assert.deepEqual(summary.warnings, []);
  assert.deepEqual(Object.keys(summary.bySeverity), getToolExpectedSeverityOrder());
});

test("summarizeSnykIssues validates mixed severities and preserves deterministic buckets", () => {
  const summary = summarizeSnykIssues([
    { severity: "critical", ruleId: "SNYK-100" },
    { level: "error", ruleId: "SNYK-101" },
    { severity: "high", ruleId: "SNYK-102" },
    { severity: "moderate", ruleId: "SNYK-103" },
    { severity: "MEDIUM", ruleId: "SNYK-104" },
    { properties: { severity: "note" }, ruleId: "SNYK-105" },
    { severity: "none", ruleId: "SNYK-106" },
    { level: "warning", ruleId: "SNYK-107" },
    { level: "info", ruleId: "SNYK-108" },
  ]);

  assert.equal(summary.total, 9);
  assert.equal(summary.invalidCount, 0);
  assert.deepEqual(summary.bySeverity, {
    critical: 1,
    high: 2,
    medium: 2,
    low: 0,
    warning: 2,
    info: 1,
    unknown: 1,
  });
  assert.deepEqual(summary.warnings, []);
  assert.deepEqual(Object.keys(summary.bySeverity), getToolExpectedSeverityOrder());
});

test("summarizeSnykIssues surfaces malformed issue fragments", () => {
  const summary = summarizeSnykIssues([
    "not-an-object",
    12,
    null,
    { ruleId: "SNYK-200" },
    { severity: 5, ruleId: "SNYK-201" },
  ]);

  assert.equal(summary.total, 0);
  assert.equal(summary.invalidCount, 5);
  assert.deepEqual(summary.bySeverity, {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    warning: 0,
    info: 0,
    unknown: 0,
  });
  assert.equal(summary.warnings.length, 5);
  assert.ok(summary.warnings[0].includes("index 0"));
  assert.ok(summary.warnings[1].includes("index 1"));
  assert.ok(summary.warnings[2].includes("index 2"));
  assert.ok(summary.warnings[3].includes("index 3"));
});

test("summarizeSnykIssues rejects non-array inputs as malformed", () => {
  const summary = summarizeSnykIssues("not-an-array");
  assert.equal(summary.total, 0);
  assert.equal(summary.invalidCount, 1);
  assert.deepEqual(summary.bySeverity, {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    warning: 0,
    info: 0,
    unknown: 0,
  });
  assert.deepEqual(summary.warnings, ["summarizeSnykIssues expects an array input"]);
});

test("README and specs are aligned with prepared-mode messaging contract", async () => {
  const specText = await readFile(specPath, "utf8");
  assert.ok(specText.includes("SnykMe"));

  assert.ok(!readme.includes("{{PLACEHOLDER}}"));
  assert.ok(!readme.includes("Template"));

  const sourceChecks = [
    readme,
    architectureSource,
    guidelinesSource,
    projectDefinitionSource,
    structureSource,
  ];

  for (const source of sourceChecks) {
    assert.ok(source.includes("preparation") || source.includes("prepared"), "documentation should remain in preparation-mode contract");
    assert.ok(source.includes("SnykMe"));
  }

  assert.ok(specText.includes("preparation") || specText.includes("prepared"));
  assert.ok(architectureSource.includes("prep"));

  const command = registerSnykCommand();
  const tool = registerSnykTool();
  assert.ok(command.command.description.includes("summarized"));
  assert.ok(tool.description.includes("Prepared"));
});
