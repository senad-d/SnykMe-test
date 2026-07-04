import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { summarizeSnykIssues, type SummarizedSnykIssueReport } from "./snyk-issues.ts";

export type SnykCommandErrorCode = "binaryMissing" | "permissionDenied" | "timedOut" | "scanFailed";

export type SnykScanWorkflowFailureCode =
  | SnykCommandErrorCode
  | "artifactPolicy"
  | "artifactReadFailed"
  | "artifactWriteFailed"
  | "malformedSarif";

export interface SnykScanCommandPlan {
  command: string;
  args: string[];
  repositoryPath: string;
  targetPath: string;
}

export interface SnykScanArtifactPlan {
  repositoryPath: string;
  rawSarifPath: string;
  cleanSarifPath: string;
  plannedCleanupTargets: readonly string[];
}

export interface SnykScanExecutionSuccess {
  success: true;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: false;
}

export interface SnykScanExecutionFailure {
  success: false;
  code: SnykCommandErrorCode;
  message: string;
  timedOut: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export type SnykScanExecutionResult = SnykScanExecutionSuccess | SnykScanExecutionFailure;

export interface SnykScanPlanValidationSuccess {
  success: true;
  plan: SnykScanCommandPlan;
  plannedCleanupTargets: readonly string[];
}

export interface SnykScanPlanValidationFailure {
  success: false;
  code: "scanFailed" | "permissionDenied";
  message: string;
}

export type SnykScanPlanValidationResult = SnykScanPlanValidationSuccess | SnykScanPlanValidationFailure;

export interface RunSnykScanOptions {
  repositoryPath: string;
  targetPath?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface SnykScanArtifactCleanupSummary {
  attempted: readonly string[];
  removed: string[];
  missing: string[];
  failed: Array<{ path: string; reason: string }>;
}

export interface SnykScanWorkflowFailure {
  status: "failure";
  code: SnykScanWorkflowFailureCode;
  message: string;
  remediation: string;
  plannedCommand: string;
  plannedCleanupTargets: readonly string[];
  plannedArtifacts: SnykScanArtifactPlan;
  cleanup: SnykScanArtifactCleanupSummary;
  exitCode?: number | null;
  timedOut?: boolean;
  summary?: SummarizedSnykIssueReport;
  details?: string;
  stdout?: string;
  stderr?: string;
}

export interface SnykScanWorkflowSuccess {
  status: "success";
  message: string;
  plannedCommand: string;
  plannedCleanupTargets: readonly string[];
  plannedArtifacts: SnykScanArtifactPlan;
  cleanup: SnykScanArtifactCleanupSummary;
  summary: SummarizedSnykIssueReport;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export type SnykScanWorkflowResult = SnykScanWorkflowSuccess | SnykScanWorkflowFailure;

export interface SnykScanWorkflowDependencies {
  executeSnykScan: (options: RunSnykScanOptions) => Promise<SnykScanExecutionResult>;
  readFile: (artifactPath: string) => Promise<string>;
  writeFile: (artifactPath: string, contents: string) => Promise<void>;
  removeFile: (artifactPath: string) => Promise<void>;
  fileInfo: (artifactPath: string) => Promise<unknown>;
}

export interface RunSnykScanWorkflowOptions extends RunSnykScanOptions {
  cleanupArtifacts?: boolean;
  artifactNames?: readonly string[];
  dependencies?: Partial<SnykScanWorkflowDependencies>;
}

export const PLANNED_SCAN_ARTIFACTS = ["snyk-code.sarif", "snyk-code-clean.json"] as const;
export const MAX_ALLOWED_OUTPUT_BYTES = 120_000;
export const DEFAULT_SCAN_TIMEOUT_MS = 120_000;
export const DEFAULT_SNYK_SCAN_COMMAND = "snyk";

const REQUIRED_ENVIRONMENT_KEYS = ["PATH"];
const CONTROL_CHAR_PATTERN = /[\u0000\r\n\t]/;
const ARTIFACT_ALLOWLIST = new Set<string>(PLANNED_SCAN_ARTIFACTS);

function hasInvalidPathCharacters(candidate: string): boolean {
  return CONTROL_CHAR_PATTERN.test(candidate);
}

function hasOwn<T extends Record<string, unknown>>(value: T, key: string): boolean {
  return Object.hasOwn(value, key);
}

function isInsideRepository(repositoryPath: string, targetPath: string): boolean {
  const relativePath = path.relative(repositoryPath, targetPath);

  if (relativePath === "") {
    return true;
  }

  if (relativePath === "..") {
    return false;
  }

  return (
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath) &&
    !relativePath.startsWith("..")
  );
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validateExecutionEnvironment(env: NodeJS.ProcessEnv): string | null {
  for (const requiredKey of REQUIRED_ENVIRONMENT_KEYS) {
    const value = normalizeString(env[requiredKey]);

    if (value.length === 0) {
      return `Missing required environment variable: ${requiredKey}`;
    }
  }

  return null;
}

function isAllowedArtifactName(candidate: string): boolean {
  if (path.isAbsolute(candidate)) {
    return false;
  }

  if (path.basename(candidate) !== candidate) {
    return false;
  }

  return ARTIFACT_ALLOWLIST.has(candidate);
}

function parseArtifactNames(rawNames: readonly string[]): readonly string[] {
  const names = rawNames.length === 0 ? [...PLANNED_SCAN_ARTIFACTS] : [...rawNames];
  const sanitized = [...new Set(names.map((name) => name.trim()))];

  if (sanitized.length !== 2) {
    throw new Error("Scan artifact configuration must contain exactly two artifact names.");
  }

  for (const artifactName of sanitized) {
    if (!isAllowedArtifactName(artifactName)) {
      throw new Error("Scan artifact path is not in the allowlist.");
    }
  }

  return sanitized;
}

function describeFailureRemediation(code: SnykScanWorkflowFailureCode): string {
  switch (code) {
    case "binaryMissing":
      return "Install `snyk` and ensure it is available on PATH.";
    case "permissionDenied":
      return "Check command and repository permissions before re-running the scan.";
    case "timedOut":
      return "Increase the scan timeout or narrow scan scope to reduce execution time.";
    case "artifactPolicy":
      return "Verify scan artifact names are from the allowlist and retry.";
    case "artifactReadFailed":
      return "Check repository read permissions for planned scan artifacts.";
    case "artifactWriteFailed":
      return "Check repository write permissions for planned scan artifacts.";
    case "malformedSarif":
      return "Regenerate scan output by re-running the command with a compatible Snyk version.";
    case "scanFailed":
    default:
      return "Run the equivalent Snyk command directly and inspect its exit output.";
  }
}

function describePlanMessage(plan: SnykScanCommandPlan, artifactNames: readonly string[]): string {
  const resolvedTarget = path.relative(plan.repositoryPath, plan.targetPath) || ".";
  const outputTarget = artifactNames[0] ?? PLANNED_SCAN_ARTIFACTS[0];
  return `${plan.command} code test ${resolvedTarget} --sarif > ${outputTarget}`;
}

function isCommandFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string");
}

function classifyScanCommandError(error: unknown): Omit<SnykScanExecutionFailure, "success" | "timedOut" | "stdout" | "stderr"> {
  if (isCommandFileError(error)) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return {
        code: "binaryMissing",
        message: "Required scan binary could not be located",
      };
    }

    if (code === "EACCES" || code === "EPERM") {
      return {
        code: "permissionDenied",
        message: "Insufficient permissions to execute scan command",
      };
    }
  }

  return {
    code: "scanFailed",
    message: "Scan execution failed before process startup",
  };
}

function emptyCleanup(attempted: readonly string[]): SnykScanArtifactCleanupSummary {
  return {
    attempted,
    removed: [],
    missing: [],
    failed: [],
  };
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

export function resolveSnykScanArtifacts(repositoryPath: string, artifactNames: readonly string[] = PLANNED_SCAN_ARTIFACTS): SnykScanArtifactPlan {
  const names = parseArtifactNames(artifactNames);
  const repositoryRoot = path.resolve(repositoryPath);
  const rawSarifPath = path.resolve(repositoryRoot, names[0]);
  const cleanSarifPath = path.resolve(repositoryRoot, names[1]);

  if (!isInsideRepository(repositoryRoot, rawSarifPath) || !isInsideRepository(repositoryRoot, cleanSarifPath)) {
    throw new Error("Planned scan artifact path resolves outside repository root.");
  }

  return {
    repositoryPath: repositoryRoot,
    rawSarifPath,
    cleanSarifPath,
    plannedCleanupTargets: names,
  };
}

export function createSnykScanPlan(
  repositoryPath: string,
  targetPath = ".",
): SnykScanPlanValidationResult {
  if (hasInvalidPathCharacters(targetPath)) {
    return {
      success: false,
      code: "permissionDenied",
      message: "Rejecting scan target containing control characters",
    };
  }

  const repositoryRoot = path.resolve(repositoryPath);
  const resolvedTarget = path.resolve(repositoryRoot, targetPath);

  if (!isInsideRepository(repositoryRoot, resolvedTarget)) {
    return {
      success: false,
      code: "scanFailed",
      message: "Scan target must stay within the active repository directory",
    };
  }

  return {
    success: true,
    plannedCleanupTargets: PLANNED_SCAN_ARTIFACTS,
    plan: {
      command: DEFAULT_SNYK_SCAN_COMMAND,
      args: ["code", "test", path.relative(repositoryRoot, resolvedTarget) || ".", "--sarif"],
      repositoryPath: repositoryRoot,
      targetPath: resolvedTarget,
    },
  };
}

function classifyDependencyError(error: unknown): "artifactReadFailed" | "artifactWriteFailed" | null {
  if (!isCommandFileError(error)) {
    return null;
  }

  const code = (error as { code?: string }).code;
  if (code === "EACCES" || code === "EPERM") {
    return "artifactWriteFailed";
  }

  return null;
}

async function collectOutput(
  stream: NodeJS.ReadableStream | null,
  maxBytes: number,
  chunks: Buffer[],
  counter: { value: number },
): Promise<void> {
  if (!stream || maxBytes <= 0) {
    return;
  }

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      const remaining = maxBytes - counter.value;
      if (remaining <= 0) {
        return;
      }

      const safeChunk = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining);
      chunks.push(safeChunk);
      counter.value += safeChunk.length;
    });

    stream.on("end", () => resolve());
    stream.on("error", (error) => reject(error));
  });
}

function createFailureResult(
  code: SnykCommandErrorCode,
  message: string,
  timedOut: boolean,
  exitCode?: number,
  stdout?: string,
  stderr?: string,
): SnykScanExecutionFailure {
  return {
    success: false,
    code,
    message,
    timedOut,
    exitCode,
    stdout,
    stderr,
  };
}

async function cleanupArtifacts(
  artifactPlan: SnykScanArtifactPlan,
  dependencies: SnykScanWorkflowDependencies,
): Promise<SnykScanArtifactCleanupSummary> {
  const attempted: string[] = [artifactPlan.rawSarifPath, artifactPlan.cleanSarifPath];
  const summary = emptyCleanup(attempted);

  for (const artifactPath of attempted) {
    const isInside = isInsideRepository(artifactPlan.repositoryPath, artifactPath);
    if (!isInside) {
      summary.failed.push({
        path: artifactPath,
        reason: "artifact path is outside repository root",
      });
      continue;
    }

    try {
      await dependencies.fileInfo(artifactPath);
    } catch (error) {
      if (isNotFoundError(error)) {
        summary.missing.push(artifactPath);
        continue;
      }

      summary.failed.push({
        path: artifactPath,
        reason: isCommandFileError(error) ? `read check failed: ${(error as { message?: string }).message ?? String(error)}` : "unknown error",
      });
      continue;
    }

    try {
      await dependencies.removeFile(artifactPath);
      summary.removed.push(artifactPath);
    } catch (error) {
      summary.failed.push({
        path: artifactPath,
        reason: isCommandFileError(error)
          ? `remove failed: ${(error as { message?: string }).message ?? String(error)}`
          : "remove failed",
      });
    }
  }

  return summary;
}

function parseSarifPayload(rawOutput: string): { issues: unknown[]; warnings: string[] } {
  const trimmed = rawOutput.trim();
  if (trimmed.length === 0) {
    return { issues: [], warnings: ["Scan artifact is empty; treating as zero findings."] };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch (error) {
    return {
      issues: [],
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (!(payload && typeof payload === "object" && !Array.isArray(payload))) {
    return {
      issues: [],
      warnings: ["Scan output is not an object."],
    };
  }

  const payloadObject = payload as Record<string, unknown>;
  const runs = hasOwn(payloadObject, "runs") ? payloadObject.runs : undefined;
  if (!Array.isArray(runs)) {
    return {
      issues: [],
      warnings: ["Scan output does not expose `runs` as an array."],
    };
  }

  const issues: unknown[] = [];
  const warnings: string[] = [];

  for (const run of runs) {
    if (!run || typeof run !== "object" || Array.isArray(run)) {
      warnings.push("Skipping invalid run entry in scan output.");
      continue;
    }

    if (Object.hasOwn(run, "results") && Array.isArray(run.results)) {
      issues.push(...run.results);
      continue;
    }

    warnings.push("Skipping run entry with missing results array.");
  }

  return { issues, warnings };
}

export async function runSnykScanWorkflow(
  options: RunSnykScanWorkflowOptions,
): Promise<SnykScanWorkflowResult> {
  const cleanupArtifactsFlag = options.cleanupArtifacts !== false;
  const artifactPlan = resolveSnykScanArtifacts(options.repositoryPath, options.artifactNames);

  const baseDependencies: SnykScanWorkflowDependencies = {
    executeSnykScan,
    readFile: (artifactPath) => readFile(artifactPath, "utf8"),
    writeFile: (artifactPath, contents) => writeFile(artifactPath, contents, "utf8"),
    removeFile: (artifactPath) => rm(artifactPath, { force: true }),
    fileInfo: (artifactPath) => stat(artifactPath),
  };

  const mergedDependencies: SnykScanWorkflowDependencies = {
    ...baseDependencies,
    ...(options.dependencies ?? {}),
  };

  const planResult = createSnykScanPlan(options.repositoryPath, options.targetPath);
  if (!planResult.success) {
    return {
      status: "failure",
      code: planResult.code,
      message: `Scan plan failed: ${planResult.message}`,
      remediation: describeFailureRemediation(planResult.code),
      plannedCommand: "snyk code test . --sarif > snyk-code.sarif",
      plannedCleanupTargets: artifactPlan.plannedCleanupTargets,
      plannedArtifacts: artifactPlan,
      cleanup: cleanupArtifactsFlag ? await cleanupArtifacts(artifactPlan, mergedDependencies) : emptyCleanup([]),
    };
  }

  let scanResult: SnykScanExecutionResult;
  try {
    scanResult = await mergedDependencies.executeSnykScan({
      repositoryPath: options.repositoryPath,
      targetPath: options.targetPath,
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
      env: options.env,
      signal: options.signal,
    });
  } catch (error) {
    const failure = classifyScanCommandError(error);
    return {
      status: "failure",
      code: failure.code,
      message: failure.message,
      remediation: describeFailureRemediation(failure.code),
      plannedCommand: describePlanMessage(planResult.plan, artifactPlan.plannedCleanupTargets),
      plannedCleanupTargets: artifactPlan.plannedCleanupTargets,
      plannedArtifacts: artifactPlan,
      cleanup: cleanupArtifactsFlag ? await cleanupArtifacts(artifactPlan, mergedDependencies) : emptyCleanup([]),
      exitCode: undefined,
      timedOut: false,
      stdout: undefined,
      stderr: undefined,
    };
  }

  const hasFindingsExit = !scanResult.success && scanResult.code === "scanFailed" && scanResult.exitCode === 1;

  if (!scanResult.success && !hasFindingsExit) {
    return {
      status: "failure",
      code: scanResult.code,
      message: `Scan execution failed: ${scanResult.message}`,
      remediation: describeFailureRemediation(scanResult.code),
      plannedCommand: describePlanMessage(planResult.plan, artifactPlan.plannedCleanupTargets),
      plannedCleanupTargets: artifactPlan.plannedCleanupTargets,
      plannedArtifacts: artifactPlan,
      cleanup: cleanupArtifactsFlag ? await cleanupArtifacts(artifactPlan, mergedDependencies) : emptyCleanup([]),
      exitCode: scanResult.exitCode,
      timedOut: scanResult.timedOut,
      stdout: scanResult.stdout,
      stderr: scanResult.stderr,
    };
  }

  const output = scanResult.success ? scanResult.stdout : scanResult.stdout ?? "";

  try {
    await mergedDependencies.writeFile(artifactPlan.rawSarifPath, output);
    await mergedDependencies.writeFile(artifactPlan.cleanSarifPath, output);
  } catch (error) {
    const cause = classifyDependencyError(error);
    return {
      status: "failure",
      code: cause ?? "artifactWriteFailed",
      message: "Could not persist scan artifacts",
      remediation: describeFailureRemediation(cause ?? "artifactWriteFailed"),
      plannedCommand: describePlanMessage(planResult.plan, artifactPlan.plannedCleanupTargets),
      plannedCleanupTargets: artifactPlan.plannedCleanupTargets,
      plannedArtifacts: artifactPlan,
      cleanup: cleanupArtifactsFlag ? await cleanupArtifacts(artifactPlan, mergedDependencies) : emptyCleanup([]),
      exitCode: scanResult.exitCode,
      timedOut: scanResult.timedOut,
      stdout: scanResult.stdout,
      stderr: scanResult.stderr,
    };
  }

  let artifactsText: string;
  try {
    artifactsText = await mergedDependencies.readFile(artifactPlan.cleanSarifPath);
  } catch (error) {
    return {
      status: "failure",
      code: "artifactReadFailed",
      message: "Could not read scan artifact",
      remediation: describeFailureRemediation("artifactReadFailed"),
      plannedCommand: describePlanMessage(planResult.plan, artifactPlan.plannedCleanupTargets),
      plannedCleanupTargets: artifactPlan.plannedCleanupTargets,
      plannedArtifacts: artifactPlan,
      cleanup: cleanupArtifactsFlag ? await cleanupArtifacts(artifactPlan, mergedDependencies) : emptyCleanup([]),
      exitCode: scanResult.exitCode,
      timedOut: scanResult.timedOut,
      stdout: scanResult.stdout,
      stderr: scanResult.stderr,
      details: error instanceof Error ? error.message : String(error),
    };
  }

  const parseResult = parseSarifPayload(artifactsText);
  if (parseResult.warnings.length > 0 && parseResult.issues.length === 0 && parseResult.warnings[0] !== "Scan artifact is empty; treating as zero findings.") {
    return {
      status: "failure",
      code: "malformedSarif",
      message: "Could not parse scan artifact as SARIF",
      remediation: describeFailureRemediation("malformedSarif"),
      plannedCommand: describePlanMessage(planResult.plan, artifactPlan.plannedCleanupTargets),
      plannedCleanupTargets: artifactPlan.plannedCleanupTargets,
      plannedArtifacts: artifactPlan,
      cleanup: cleanupArtifactsFlag ? await cleanupArtifacts(artifactPlan, mergedDependencies) : emptyCleanup([]),
      exitCode: scanResult.exitCode,
      timedOut: scanResult.timedOut,
      stdout: scanResult.stdout,
      stderr: scanResult.stderr,
      details: parseResult.warnings.join(" | "),
    };
  }

  const summary = summarizeSnykIssues(parseResult.issues);

  return {
    status: "success",
    message: `Scan completed: ${summary.total} issues total.`,
    plannedCommand: describePlanMessage(planResult.plan, artifactPlan.plannedCleanupTargets),
    plannedCleanupTargets: artifactPlan.plannedCleanupTargets,
    plannedArtifacts: artifactPlan,
    cleanup: cleanupArtifactsFlag ? await cleanupArtifacts(artifactPlan, mergedDependencies) : emptyCleanup([]),
    summary,
    exitCode: scanResult.exitCode ?? null,
    timedOut: scanResult.timedOut,
    stdout: output,
    stderr: scanResult.stderr ?? "",
  };
}

export async function executeSnykScan(options: RunSnykScanOptions): Promise<SnykScanExecutionResult> {
  const targetPath = options.targetPath ?? ".";
  const planResult = createSnykScanPlan(options.repositoryPath, targetPath);

  if (!planResult.success) {
    return createFailureResult(
      planResult.code,
      planResult.message,
      false,
    );
  }

  const plan = planResult.plan;
  const commandEnvironment = {
    ...process.env,
    ...(options.env ?? {}),
  };

  const missingEnvironment = validateExecutionEnvironment(commandEnvironment);
  if (missingEnvironment !== null) {
    return createFailureResult("permissionDenied", missingEnvironment, false);
  }

  if (!hasOwn(
    {
      ["snyk"]: true,
    },
    plan.command,
  )) {
    return createFailureResult("permissionDenied", "Scan command is outside allow-list", false);
  }

  const maxOutputBytes = options.maxOutputBytes ?? MAX_ALLOWED_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCAN_TIMEOUT_MS;

  return new Promise<SnykScanExecutionResult>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const outputLimit = Math.max(0, Math.floor(maxOutputBytes));
    let settled = false;

    let timedOut = false;
    let spawnError: unknown;

    const child = spawn(plan.command, plan.args, {
      cwd: plan.repositoryPath,
      env: commandEnvironment,
      signal: options.signal,
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const finish = (code: number | null, signal: NodeJS.Signals | number | null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutHandle);
      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();

      if (spawnError !== undefined) {
        const classification = classifyScanCommandError(spawnError);
        resolve(createFailureResult(classification.code, classification.message, timedOut));
        return;
      }

      if (timedOut || signal === "SIGKILL" || signal === "SIGTERM") {
        resolve(
          createFailureResult(
            "timedOut",
            "Scan execution timed out",
            true,
            code ?? undefined,
            stdout,
            stderr,
          ),
        );
        return;
      }

      if (code === 0) {
        resolve({
          success: true,
          exitCode: code,
          stdout,
          stderr,
          timedOut: false,
        });
        return;
      }

      resolve(
        createFailureResult(
          "scanFailed",
          `Scan command exited with code ${String(code)}`,
          false,
          code ?? undefined,
          stdout,
          stderr,
        ),
      );
    };

    const collect = Promise.all([
      collectOutput(child.stdout, outputLimit, stdoutChunks, { value: 0 }),
      collectOutput(child.stderr, outputLimit, stderrChunks, { value: 0 }),
    ]);

    const done = (code: number | null, signal: NodeJS.Signals | number | null) => {
      finish(code, signal);
    };

    child.on("error", (error) => {
      spawnError = error;
      done(null, null);
    });

    child.on("close", (code, signal) => {
      collect
        .then(() => {
          done(code, signal);
        })
        .catch((error) => {
          spawnError = error;
          done(code, signal);
        });
    });
  });
}
