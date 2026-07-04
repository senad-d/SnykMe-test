import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  createSnykScanPlan,
  type RunSnykScanWorkflowOptions,
  type SnykScanWorkflowResult,
} from "../utils/snyk-runner.ts";
import { EXTENSION_DISPLAY_NAME } from "../constants.ts";

/**
 * Command registration for /snykme.
 *
 * In scaffold mode (no scan executor injected), behavior is intentionally deferred.
 * When a scan executor is provided, `/snykme --run <path>` executes the workflow.
 *
 * Planned external workflow:
 * - `snyk code test . --sarif > snyk-code.sarif`
 * - `jq <normalize> snyk-code.sarif > snyk-code-clean.json`
 */
const HELP_MESSAGE = `${EXTENSION_DISPLAY_NAME} preparation command with scaffold-only behavior.

Usage:
  /snykme [--help | --dry-run [path] | --run [path] | --status]

Flags:
  --help      Show this usage text.
  --dry-run   Show the planned execution flow for a repository-local path.
  --run       Execute a real scan now (if runtime is enabled).
  --status    Show current implementation status.
`;

const PREPARED_MESSAGE = `${EXTENSION_DISPLAY_NAME} is prepared and scaffolded. Command implementation is not active yet; run this command in the next implementation session.`;
const STATUS_MESSAGE = `${EXTENSION_DISPLAY_NAME} is currently in preparation mode; command and tool are registered, and scan execution is deferred to a later implementation session.`;
const UNKNOWN_FLAG_MESSAGE = `${EXTENSION_DISPLAY_NAME} arguments are not fully supported in preparation mode. Supported flags are --help, --dry-run, --run, and --status.`;
const PREPARED_RUNTIME_MESSAGE = `${EXTENSION_DISPLAY_NAME} scan execution is not enabled in preparation mode.`;

interface CommandRuntimeDependencies {
  scanExecutor?: (options: RunSnykScanWorkflowOptions) => Promise<SnykScanWorkflowResult>;
}

function buildDryRunCommand(targetPath: string): string {
  return `snyk code test ${targetPath} --sarif > snyk-code.sarif`;
}

function formatValidationMessage(message: string): string {
  return `${EXTENSION_DISPLAY_NAME} command validation blocked scan: ${message}`;
}

function formatRuntimeRunMessage(result: SnykScanWorkflowResult): string {
  if (result.status === "failure") {
    return `${EXTENSION_DISPLAY_NAME} scan failed: ${result.message} ${result.remediation}`;
  }

  return `${EXTENSION_DISPLAY_NAME} scan completed: ${result.message}`;
}

function splitCommandArgs(args: string): string[] {
  return args
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token);
}

function notifyContext(ctx: unknown, message: string, level: "info" | "warning" = "info") {
  const context = ctx as { ui?: { notify?: (message: string, level?: string) => void } };
  const notify = context?.ui?.notify;

  if (typeof notify === "function") {
    notify(message, level);
  }
}

function runScanWithExecutor(
  scanExecutor: CommandRuntimeDependencies["scanExecutor"],
  repositoryPath: string,
  targetPath: string,
): Promise<string> {
  if (!scanExecutor) {
    return Promise.resolve(PREPARED_RUNTIME_MESSAGE);
  }

  return scanExecutor({ repositoryPath, targetPath }).then((result) => formatRuntimeRunMessage(result));
}

function isInvalidTarget(targetPath: unknown): boolean {
  return typeof targetPath !== "string" || targetPath.startsWith("--") || targetPath.trim().length === 0;
}

export function registerSnykMeCommand(pi: ExtensionAPI, options: CommandRuntimeDependencies = {}) {
  const getScanExecutor = options.scanExecutor;
  const unknownFlag = UNKNOWN_FLAG_MESSAGE;

  pi.registerCommand("/snykme", {
    description: `${EXTENSION_DISPLAY_NAME}: collect a summarized Snyk code scan for the current repository`,
    getArgumentCompletions(prefix) {
      const allowed = ["--help", "--dry-run", "--run", "--status"];
      const normalized = prefix.trim().toLowerCase();
      const matches = allowed.filter((item) => item.startsWith(normalized));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const tokens = splitCommandArgs(args);
      const normalizedTokens = tokens.map((token) => token.toLowerCase());
      const [flag] = normalizedTokens;
      const repositoryPath = typeof ctx?.cwd === "string" && ctx.cwd.length > 0 ? ctx.cwd : ".";

      if (tokens.length === 0) {
        notifyContext(ctx, PREPARED_MESSAGE, "info");
        return;
      }

      if (normalizedTokens.length === 1 && flag === "--help") {
        notifyContext(ctx, HELP_MESSAGE, "info");
        return;
      }

      if (normalizedTokens.length === 1 && flag === "--status") {
        notifyContext(ctx, STATUS_MESSAGE, "info");
        return;
      }

      if (flag === "--run") {
        if (normalizedTokens.length > 2) {
          notifyContext(ctx, unknownFlag, "warning");
          return;
        }

        const targetPath = tokens[1] ?? ".";
        if (isInvalidTarget(targetPath)) {
          notifyContext(ctx, `${formatValidationMessage("Missing or invalid --run target path.")}`, "warning");
          return;
        }

        const plan = createSnykScanPlan(repositoryPath, targetPath);
        if (!plan.success) {
          notifyContext(ctx, formatValidationMessage(plan.message), "warning");
          return;
        }

        const runtimeMessage = await runScanWithExecutor(getScanExecutor, repositoryPath, targetPath);
        notifyContext(ctx, runtimeMessage, runtimeMessage.includes("failed") ? "warning" : "info");
        return;
      }

      if (flag === "--dry-run") {
        if (normalizedTokens.length > 2) {
          notifyContext(ctx, unknownFlag, "warning");
          return;
        }

        const targetPath = tokens[1] ?? ".";
        if (isInvalidTarget(targetPath)) {
          notifyContext(ctx, formatValidationMessage("Target path cannot be empty."), "warning");
          return;
        }

        const plan = createSnykScanPlan(repositoryPath, targetPath);
        if (!plan.success) {
          notifyContext(ctx, formatValidationMessage(plan.message), "warning");
          return;
        }

        notifyContext(
          ctx,
          `${EXTENSION_DISPLAY_NAME} dry run is not implemented yet, but scan planning passed. Planned scan command:\n${buildDryRunCommand(
            targetPath,
          )}\nPlanned artifacts: ${plan.plannedCleanupTargets.join(", ")}`,
          "info",
        );
        return;
      }

      notifyContext(ctx, unknownFlag, "warning");
    },
  });
}
