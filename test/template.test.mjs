import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import registerSnykMeExtension from "../src/extension.ts";
import { registerSnykMeCommand } from "../src/commands/snykme-command.ts";
import { registerSnykMeTool } from "../src/tools/snykme-get-issues-tool.ts";
import { summarizeSnykIssues } from "../src/utils/snyk-issues.ts";
import {
  createSnykScanPlan,
  executeSnykScan,
  resolveSnykScanArtifacts,
  runSnykScanWorkflow,
} from "../src/utils/snyk-runner.ts";

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

function createNotifyCapture(cwd = process.cwd(), ui) {
  const messages = [];
  const context = {
    cwd,
    ui: {
      notify(message, _level) {
        messages.push(message);
      },
      ...(ui || {}),
    },
    messages,
  };

  return { context, messages };
}

async function createTemporaryRepository(prefix = "snykme") {
  return mkdtemp(join(tmpdir(), `${prefix}-XXXXXXXX`));
}

async function pathExists(filePath) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function runCommandAndCapture(command, args, cwd = process.cwd(), context) {
  const capture = context ? context : createNotifyCapture(cwd);
  const commandContext = capture.context ?? capture;
  await command.handler(args, commandContext);
  return Array.isArray(capture.messages)
    ? capture.messages
    : Array.isArray(commandContext.messages)
      ? commandContext.messages
      : [];
}

async function runToolAndCapture(tool, toolCallId, payload, context) {
  const toolContext = context ?? {
    cwd: process.cwd(),
  };

  return tool.execute(toolCallId, payload, undefined, undefined, toolContext);
}

function registerSnykCommandWithRuntime(scanExecutor) {
  const registrations = [];
  registerSnykMeCommand(
    {
      registerCommand(name, command) {
        registrations.push({ name, command });
      },
    },
    { scanExecutor },
  );

  assert.equal(registrations.length, 1);
  return registrations[0].command;
}

function registerSnykToolWithRuntime(scanExecutor) {
  const registrations = [];
  registerSnykMeTool(
    {
      registerTool(tool) {
        registrations.push(tool);
      },
    },
    { scanExecutor },
  );

  assert.equal(registrations.length, 1);
  return registrations[0];
}

function asWorkflowSuccess(overrides = {}) {
  return {
    status: "success",
    message: "Scan completed: 0 issues total.",
    plannedCommand: "snyk code test . --sarif > snyk-code.sarif",
    plannedCleanupTargets: ["snyk-code.sarif", "snyk-code-clean.json"],
    plannedArtifacts: {
      repositoryPath: process.cwd(),
      rawSarifPath: join(process.cwd(), "snyk-code.sarif"),
      cleanSarifPath: join(process.cwd(), "snyk-code-clean.json"),
      plannedCleanupTargets: ["snyk-code.sarif", "snyk-code-clean.json"],
    },
    cleanup: {
      attempted: [],
      removed: [],
      missing: [],
      failed: [],
    },
    summary: {
      total: 0,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        warning: 0,
        info: 0,
        unknown: 0,
      },
      invalidCount: 0,
      warnings: [],
    },
    exitCode: 0,
    timedOut: false,
    stdout: "",
    stderr: "",
    ...overrides,
  };
}

function asWorkflowFailure(code, overrides = {}) {
  return {
    status: "failure",
    code,
    message: `Scan workflow failed with code ${code}.`,
    remediation: `Remediation for ${code}.`,
    plannedCommand: "snyk code test . --sarif > snyk-code.sarif",
    plannedCleanupTargets: ["snyk-code.sarif", "snyk-code-clean.json"],
    plannedArtifacts: {
      repositoryPath: process.cwd(),
      rawSarifPath: join(process.cwd(), "snyk-code.sarif"),
      cleanSarifPath: join(process.cwd(), "snyk-code-clean.json"),
      plannedCleanupTargets: ["snyk-code.sarif", "snyk-code-clean.json"],
    },
    cleanup: {
      attempted: [join(process.cwd(), "snyk-code.sarif"), join(process.cwd(), "snyk-code-clean.json")],
      removed: [],
      missing: [],
      failed: [],
    },
    timedOut: false,
    exitCode: 1,
    ...overrides,
  };
}

function createErrnoError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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


test("package identity is prepared for SnykMe", async () => {
  assert.equal(packageJson.name, "@senad-d/snykme");
  assert.equal(
    packageJson.repository?.url,
    "git+https://github.com/senad-d/SnykMe.git",
  );
  assert.match(packageJson.description, /Snyk/i);
});

test("package file allow-list ships only active runtime modules", () => {
  assert.equal(Array.isArray(packageJson.files), true);
  assert.equal(packageJson.files.includes("src/**/*.ts"), false);

  const requiredActiveFiles = [
    "src/extension.ts",
    "src/constants.ts",
    "src/commands/snykme-command.ts",
    "src/tools/snykme-get-issues-tool.ts",
    "src/utils/snyk-issues.ts",
    "src/utils/snyk-runner.ts",
  ];

  for (const file of requiredActiveFiles) {
    assert.ok(packageJson.files.includes(file), `missing required shipped source file: ${file}`);
  }

  const forbiddenArchiveModules = [
    "src/archive/example-command.ts",
    "src/archive/example-tool.ts",
    "src/archive/format.ts",
    "src/archive/lifecycle.ts",
  ];

  for (const file of forbiddenArchiveModules) {
    assert.equal(packageJson.files.includes(file), false, `inactive archive module should not ship: ${file}`);
  }

  assert.equal(
    packageJson.files.includes("src/commands/example-command.ts"),
    false,
    "example command should not ship in package files",
  );

  assert.equal(
    packageJson.files.includes("src/tools/example-tool.ts"),
    false,
    "example tool should not ship in package files",
  );

  assert.equal(
    packageJson.files.includes("src/events/lifecycle.ts"),
    false,
    "inactive lifecycle utility should not ship in package files",
  );

  assert.equal(
    packageJson.files.includes("src/utils/format.ts"),
    false,
    "inactive utility placeholder should not ship in package files",
  );
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
    { value: "--run", label: "--run" },
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
    { args: "--dry-run ./src", expected: "dry run" },
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

test("/snykme dry-run path validation rejects repository escapes", async () => {
  const { command } = registerSnykCommand();

  const safeRun = await runCommandAndCapture(command, "--dry-run src", process.cwd());
  assert.equal(safeRun.length, 1);
  assert.ok(safeRun[0].includes("Planned scan command"));

  const escapedRun = await runCommandAndCapture(command, "--dry-run ../", process.cwd());
  assert.equal(escapedRun.length, 1);
  assert.ok(escapedRun[0].includes("command validation blocked scan"));
});

test("scan execution boundary rejects unsafe paths before running external commands", async () => {
  const allowed = createSnykScanPlan(process.cwd(), "src");
  assert.equal(allowed.success, true);

  const outOfScope = createSnykScanPlan(process.cwd(), "../");
  assert.equal(outOfScope.success, false);
  assert.equal(outOfScope.code, "scanFailed");

  const unsafePath = createSnykScanPlan(process.cwd(), "src\u0000test");
  assert.equal(unsafePath.success, false);
  assert.equal(unsafePath.code, "permissionDenied");

  const deniedByEnvironment = await executeSnykScan({
    repositoryPath: process.cwd(),
    targetPath: "src",
    env: { PATH: "" },
  });
  assert.equal(deniedByEnvironment.success, false);
  assert.equal(deniedByEnvironment.code, "permissionDenied");
});

test("runSnykScanWorkflow covers critical precondition outcomes without uncaught rejections", async () => {
  const repositoryPath = await createTemporaryRepository("snykme-workflow");

  try {
    const missingBinary = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: false,
          code: "binaryMissing",
          message: "Required scan binary could not be located",
          timedOut: false,
        }),
      },
    });
    assert.equal(missingBinary.status, "failure");
    assert.equal(missingBinary.code, "binaryMissing");
    assert.ok(missingBinary.remediation.includes("Install `snyk`"));
    assert.equal(missingBinary.cleanup.removed.length, 0);

    const timedOut = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: false,
          code: "timedOut",
          message: "Scan execution timed out",
          timedOut: true,
        }),
      },
    });
    assert.equal(timedOut.status, "failure");
    assert.equal(timedOut.code, "timedOut");

    const permissionDenied = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: false,
          code: "permissionDenied",
          message: "Insufficient permissions to execute scan command",
          timedOut: false,
        }),
      },
    });
    assert.equal(permissionDenied.status, "failure");
    assert.equal(permissionDenied.code, "permissionDenied");

    const malformedSarif = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: true,
          exitCode: 0,
          timedOut: false,
          stdout: "{ invalid json",
          stderr: "",
        }),
      },
    });
    assert.equal(malformedSarif.status, "failure");
    assert.equal(malformedSarif.code, "malformedSarif");

    const zeroFindings = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: true,
          exitCode: 0,
          timedOut: false,
          stdout: "",
          stderr: "",
        }),
      },
    });
    assert.equal(zeroFindings.status, "success");
    assert.equal(zeroFindings.summary.total, 0);

    const successfulWithFindings = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: true,
          exitCode: 0,
          timedOut: false,
          stdout: JSON.stringify({
            runs: [
              {
                results: [
                  { ruleId: "SNYK-100", message: { text: "bad pattern" }, severity: "high", properties: {} },
                  { ruleId: "SNYK-101", message: { text: "weak secret" }, severity: "low", properties: {} },
                ],
              },
            ],
          }),
          stderr: "",
        }),
      },
    });
    assert.equal(successfulWithFindings.status, "success");
    assert.equal(successfulWithFindings.summary.total, 2);
    assert.equal(successfulWithFindings.summary.bySeverity.high, 1);
    assert.equal(successfulWithFindings.summary.bySeverity.low, 1);

    const successfulWithFindingsAndExitCode1 = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: false,
          code: "scanFailed",
          message: "Scan command exited with code 1",
          exitCode: 1,
          timedOut: false,
          stdout: JSON.stringify({
            runs: [
              {
                results: [
                  {
                    ruleId: "SNYK-200",
                    message: { text: "non-issue test" },
                    severity: "medium",
                    properties: {},
                  },
                ],
              },
            ],
          }),
          stderr: "",
        }),
      },
    });
    assert.equal(successfulWithFindingsAndExitCode1.status, "success");
    assert.equal(successfulWithFindingsAndExitCode1.summary.total, 1);
    assert.equal(successfulWithFindingsAndExitCode1.summary.bySeverity.medium, 1);

    const artifactPlan = resolveSnykScanArtifacts(repositoryPath);
    assert.equal(await pathExists(artifactPlan.rawSarifPath), false);
    assert.equal(await pathExists(artifactPlan.cleanSarifPath), false);

    const successfulWithNoCleanupPayload = JSON.stringify({
      runs: [
        {
          results: [
            {
              ruleId: "SNYK-200",
              message: { text: "pre-existing artifact overwritten" },
              severity: "critical",
              properties: {},
            },
          ],
        },
      ],
    });

    const successfulWithNoCleanup = await runSnykScanWorkflow({
      repositoryPath,
      cleanupArtifacts: false,
      dependencies: {
        executeSnykScan: async () => ({
          success: true,
          exitCode: 0,
          timedOut: false,
          stdout: successfulWithNoCleanupPayload,
          stderr: "",
        }),
      },
    });

    assert.equal(successfulWithNoCleanup.status, "success");
    const stalePlan = resolveSnykScanArtifacts(repositoryPath);
    assert.equal(await pathExists(stalePlan.rawSarifPath), true);
    assert.equal(await pathExists(stalePlan.cleanSarifPath), true);
    assert.equal(await readFile(stalePlan.rawSarifPath, "utf8"), successfulWithNoCleanupPayload);
    await rm(stalePlan.rawSarifPath, { force: true });
    await rm(stalePlan.cleanSarifPath, { force: true });

    const writeFailure = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: true,
          exitCode: 0,
          timedOut: false,
          stdout: JSON.stringify({ runs: [] }),
          stderr: "",
        }),
        writeFile: async () => {
          throw createErrnoError("EACCES", "permission denied");
        },
      },
    });
    assert.equal(writeFailure.status, "failure");
    assert.equal(writeFailure.code, "artifactWriteFailed");

    const readFailure = await runSnykScanWorkflow({
      repositoryPath,
      dependencies: {
        executeSnykScan: async () => ({
          success: true,
          exitCode: 0,
          timedOut: false,
          stdout: JSON.stringify({ runs: [{ results: [] }] }),
          stderr: "",
        }),
        readFile: async () => {
          throw createErrnoError("EACCES", "permission denied");
        },
      },
    });
    assert.equal(readFailure.status, "failure");
    assert.equal(readFailure.code, "artifactReadFailed");
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test("runSnykScanWorkflow refuses artifact plans outside the scoped allowlist", async () => {
  await assert.rejects(
    () =>
      runSnykScanWorkflow({
        repositoryPath: process.cwd(),
        artifactNames: ["../outside.sarif", "snyk-code-clean.json"],
      }),
    /Scan artifact path is not in the allowlist\./,
  );
});

test("/snykme command emits deterministic runtime messaging for failure and success outcomes", async () => {
  const command = registerSnykCommandWithRuntime(async () => asWorkflowFailure("permissionDenied", {
    message: "Insufficient permissions to execute scan command",
    remediation: "Check command and repository permissions before re-running the scan.",
  }));
  const captureFailure = await runCommandAndCapture(command, "--run .", process.cwd(), createNotifyCapture(process.cwd()));
  assert.equal(captureFailure.length, 1);
  assert.ok(captureFailure[0].includes("scan failed"));
  assert.ok(captureFailure[0].includes("Check command and repository permissions"));

  const successCommand = registerSnykCommandWithRuntime(async () =>
    asWorkflowSuccess({
      message: "Scan completed: 2 issues total.",
      summary: {
        total: 2,
        bySeverity: {
          critical: 0,
          high: 2,
          medium: 0,
          low: 0,
          warning: 0,
          info: 0,
          unknown: 0,
        },
        invalidCount: 0,
        warnings: [],
      },
    }),
  );

  const captureSuccess = await runCommandAndCapture(successCommand, "--run .", process.cwd(), createNotifyCapture(process.cwd()));
  assert.equal(captureSuccess.length, 1);
  assert.ok(captureSuccess[0].includes("scan completed"));

  const invalidArgument = await runCommandAndCapture(successCommand, "--run src extra", process.cwd(), createNotifyCapture(process.cwd()));
  assert.equal(invalidArgument.length, 1);
  assert.ok(invalidArgument[0].includes("Supported flags"));

  const malformedCtx = await runCommandAndCapture(
    successCommand,
    "--run .",
    process.cwd(),
    { cwd: process.cwd() },
  );
  assert.equal(malformedCtx.length, 0);
});

test("snykme tool returns runtime failure details and truncation with limit", async () => {
  const tool = registerSnykToolWithRuntime(async () => asWorkflowFailure("timeout", {
    code: "timedOut",
    message: "Scan execution timed out",
    remediation: "Increase timeout",
    summary: {
      total: 0,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        warning: 0,
        info: 0,
        unknown: 0,
      },
      invalidCount: 0,
      warnings: [],
    },
  }));

  const failureResult = await runToolAndCapture(tool, "tool-runtime-fail", { includeRaw: true, limit: 4 });
  assert.ok(failureResult.content[0].text.includes("scan failed"));
  assert.ok("cleanup" in failureResult.details);
  assert.equal(failureResult.details.issueCount, 0);

  const runtimeSummary = {
    total: 8,
    bySeverity: {
      critical: 1,
      high: 2,
      medium: 2,
      low: 2,
      warning: 1,
      info: 0,
      unknown: 0,
    },
    invalidCount: 0,
    warnings: ["known result set"],
  };

  const successTool = registerSnykToolWithRuntime(async () =>
    asWorkflowSuccess({
      message: "Scan completed: 8 issues total.",
      summary: runtimeSummary,
      cleanup: {
        attempted: ["snyk-code.sarif", "snyk-code-clean.json"],
        removed: ["snyk-code.sarif", "snyk-code-clean.json"],
        missing: [],
        failed: [],
      },
    }),
  );

  const limited = await runToolAndCapture(successTool, "tool-runtime-success", { limit: 3, includeRaw: false });
  assert.equal(limited.details.requestedLimit, 3);
  assert.equal(limited.details.effectiveLimit, 3);
  assert.ok(limited.details.truncationNotice.includes("3"));
  assert.equal(limited.details.rawPaths, undefined);
});

test("snykme tool summary payload excludes unknown fields", async () => {
  const tool = registerSnykToolWithRuntime(async () =>
    asWorkflowSuccess({
      message: "Scan completed: 1 issues total.",
      summary: {
        total: 1,
        bySeverity: {
          critical: 0,
          high: 1,
          medium: 0,
          low: 0,
          warning: 0,
          info: 0,
          unknown: 0,
        },
        invalidCount: 0,
        warnings: [],
        items: [
          {
            severity: "high",
            rawSeverity: "error",
            where: "src/events/register-guard.ts:325",
            what: "Regular Expression Denial of Service (ReDoS)",
            why: "Unsanitized user input from an exception flows into RegExp, where it is used to build a regular expression.",
            cwe: ["CWE-400"],
          },
        ],
      },
    }),
  );

  const limited = await runToolAndCapture(tool, "tool-runtime-no-extra-fields", { limit: 3, includeRaw: false });
  const payload = JSON.parse(limited.content[0].text);

  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 1);
  assert.deepEqual(payload[0], {
    severity: "error",
    what: "Regular Expression Denial of Service (ReDoS)",
    where: "src/events/register-guard.ts:325",
    why: "Unsanitized user input from an exception flows into RegExp, where it is used to build a regular expression.",
    cwe: ["CWE-400"],
  });
});

test("snykme tool summary payload omits empty cwe arrays", async () => {
  const tool = registerSnykToolWithRuntime(async () =>
    asWorkflowSuccess({
      message: "Scan completed: 1 issues total.",
      summary: {
        total: 1,
        bySeverity: {
          critical: 0,
          high: 0,
          medium: 1,
          low: 0,
          warning: 0,
          info: 0,
          unknown: 0,
        },
        invalidCount: 0,
        warnings: [],
        items: [
          {
            severity: "medium",
            rawSeverity: "note",
            where: "src/utils/example.ts:10",
            what: "Example issue without CWE",
            why: "No mapped CWE in rule metadata.",
            cwe: [],
          },
        ],
      },
    }),
  );

  const limited = await runToolAndCapture(tool, "tool-runtime-empty-cwe", { limit: 3, includeRaw: false });
  const payload = JSON.parse(limited.content[0].text);

  assert.equal(Array.isArray(payload), true);
  assert.equal(payload.length, 1);
  assert.equal("cwe" in payload[0], false);
  assert.deepEqual(payload[0], {
    severity: "note",
    what: "Example issue without CWE",
    where: "src/utils/example.ts:10",
    why: "No mapped CWE in rule metadata.",
  });
});


test("snykme tool execution remains deterministic across repeated runtime calls", async () => {
  const tool = registerSnykToolWithRuntime(async () =>
    asWorkflowSuccess({
      message: "Scan completed: 0 issues total.",
      summary: {
        total: 0,
        bySeverity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          warning: 0,
          info: 0,
          unknown: 0,
        },
        invalidCount: 0,
        warnings: [],
      },
    }),
  );

  const first = await runToolAndCapture(tool, "tool-repeat-1", { limit: 1, includeRaw: true });
  const second = await runToolAndCapture(tool, "tool-repeat-2", { limit: 1, includeRaw: true });
  assert.equal(first.content[0].text, second.content[0].text);
  assert.deepEqual(first.details, second.details);
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

  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), ["includeRaw", "limit"]);

  const preparedResult = await runToolAndCapture(tool, "tool-call", { includeRaw: true, limit: 5 });
  const unknownPayloadResult = await runToolAndCapture(tool, "tool-call-invalid", {
    limit: "5",
    random: true,
  });
  const nullPayloadResult = await runToolAndCapture(tool, "tool-call-null", null);

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

  const unknownPayloadRepeat = await runToolAndCapture(tool, "tool-call-repeat", {
    limit: "5",
    random: true,
  });
  assert.deepEqual(unknownPayloadResult.content, unknownPayloadRepeat.content);
  assert.deepEqual(unknownPayloadResult.details, unknownPayloadRepeat.details);

  const limitOne = await runToolAndCapture(tool, "tool-call-2", { includeRaw: false, limit: 1 });
  const limitDefault = await runToolAndCapture(tool, "tool-call-3", {});
  const limitMax = await runToolAndCapture(tool, "tool-call-4", { includeRaw: true, limit: 200 });

  assert.equal(limitOne.details.effectiveLimit, 1);
  assert.ok(limitOne.details.truncationNotice.includes("truncated"));
  assert.equal(limitOne.details.summary.total, 1);
  assert.equal("rawPaths" in limitOne.details, false);

  assert.equal(limitDefault.details.effectiveLimit, 6);
  assert.equal(limitDefault.details.requestedLimit, 6);

  assert.equal(limitMax.details.effectiveLimit, 6);
  assert.equal(limitMax.details.truncationNotice, undefined);
  assert.deepEqual(limitMax.details.rawPaths, ["snyk-code.sarif", "snyk-code-clean.json"]);

  const malformedRepeat = await runToolAndCapture(tool, "tool-call-5", { limit: "1", debug: true });
  const malformedRepeatAgain = await runToolAndCapture(tool, "tool-call-6", { limit: "1", debug: true });
  assert.deepEqual(malformedRepeat.details, malformedRepeatAgain.details);
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

test("summarizeSnykIssues normalizes message text from object and array payloads", () => {
  const summary = summarizeSnykIssues([
    { message: [{ text: "Array message one", help: "Help for array one" }], severity: "low", ruleId: "SNYK-300" },
    { message: [{ help: "Array help item" }, { text: "Fallback text" }], severity: "low", ruleId: "SNYK-301" },
    { message: { text: "Object message", description: "Object description" }, severity: "low", ruleId: "SNYK-302" },
    { message: "String message", severity: "low", ruleId: "SNYK-303" },
    { message: [], severity: "low", ruleId: "SNYK-304", where: "src/legacy.ts" },
    { message: ["", { help: "Whitespace trimmed" }, "Second message"], severity: "low", ruleId: "SNYK-305" },
  ]);

  assert.equal(summary.total, 6);
  assert.equal(summary.invalidCount, 0);
  assert.equal(summary.bySeverity.low, 6);
});

test("summarizeSnykIssues reads location sources from array, object, and empty arrays", () => {
  const summary = summarizeSnykIssues([
    { severity: "medium", ruleId: "SNYK-310", locations: [{ physicalLocation: { artifactLocation: { uri: "src/array.ts" } } }] },
    { severity: "medium", ruleId: "SNYK-311", locations: { physicalLocation: { artifactLocation: { uri: "src/object.ts" } } } },
    { severity: "medium", ruleId: "SNYK-312", locations: [], where: "src/fallback-array.ts" },
    { severity: "medium", ruleId: "SNYK-313", locations: [{}], where: "src/fallback-array-item.ts" },
    { severity: "medium", ruleId: "SNYK-314", locations: {}, where: "src/fallback-object.ts" },
  ]);

  assert.equal(summary.total, 5);
  assert.equal(summary.invalidCount, 0);
  assert.equal(summary.bySeverity.medium, 5);
});

test("summarizeSnykIssues tolerates malformed cwe payloads deterministically", () => {
  const summary = summarizeSnykIssues([
    { severity: "low", ruleId: "SNYK-320", properties: { cwe: ["CWE-020", 79, { id: "CWE-79" }, ""] } },
    { severity: "low", ruleId: "SNYK-321", cwe: ["CWE-089", " CWE-79 ", null, "", 0] },
    { severity: "low", ruleId: "SNYK-322", properties: { cwe: "not-a-list" } },
    { severity: "low", ruleId: "SNYK-323", properties: { }, cwe: ["CWE-123"] },
  ]);

  assert.equal(summary.total, 4);
  assert.equal(summary.invalidCount, 0);
  assert.equal(summary.bySeverity.low, 4);
});

test("summarizeSnykIssues maps unsupported severities to unknown with warnings", () => {
  const summary = summarizeSnykIssues([
    { severity: "criticality", ruleId: "SNYK-330" },
    { severity: 0, ruleId: "SNYK-331" },
    { level: "", ruleId: "SNYK-332" },
    { properties: { severity: "extreme" }, ruleId: "SNYK-333" },
    { properties: { severity: "" }, ruleId: "SNYK-334" },
    { level: "warning", ruleId: "SNYK-335" },
  ]);

  assert.equal(summary.total, 6);
  assert.equal(summary.invalidCount, 5);
  assert.equal(summary.bySeverity.warning, 1);
  assert.equal(summary.bySeverity.unknown, 5);
  assert.equal(summary.warnings.length, 5);
  assert.ok(summary.warnings[0].includes("index 0"));
  assert.ok(summary.warnings[4].includes("index 4"));
});

test("summarizeSnykIssues surfaces malformed issue fragments", () => {
  const summary = summarizeSnykIssues([
    "not-an-object",
    12,
    null,
    { ruleId: "SNYK-200" },
    { severity: 5, ruleId: "SNYK-201" },
  ]);

  assert.equal(summary.total, 2);
  assert.equal(summary.invalidCount, 5);
  assert.deepEqual(summary.bySeverity, {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    warning: 0,
    info: 0,
    unknown: 2,
  });
  assert.equal(summary.warnings.length, 5);
  assert.ok(summary.warnings[0].includes("index 0"));
  assert.ok(summary.warnings[1].includes("index 1"));
  assert.ok(summary.warnings[2].includes("index 2"));
  assert.ok(summary.warnings[3].includes("index 3"));
});

test("summarizeSnykIssues uses own-property severity checks for inherited keys", () => {
  const inheritedSeverity = Object.create({ severity: "critical" });
  inheritedSeverity.ruleId = "SNYK-400";

  const inheritedLevel = Object.create({ level: "high" });
  inheritedLevel.ruleId = "SNYK-401";

  const summary = summarizeSnykIssues([
    inheritedSeverity,
    inheritedLevel,
    { severity: "__proto__", ruleId: "SNYK-402" },
    { severity: "constructor", ruleId: "SNYK-403" },
    { severity: "definitely-unknown", ruleId: "SNYK-404" },
    { severity: 99, ruleId: "SNYK-405" },
  ]);

  assert.equal(summary.total, 6);
  assert.equal(summary.bySeverity.unknown, 6);
  assert.equal(summary.invalidCount, 6);
  assert.equal(summary.warnings.length, 6);
  assert.ok(summary.warnings[0].includes("index 0"));
  assert.ok(summary.warnings[1].includes("index 1"));
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
