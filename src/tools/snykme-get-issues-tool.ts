import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  PLANNED_SCAN_ARTIFACTS,
  createSnykScanPlan,
  type RunSnykScanWorkflowOptions,
  type SnykScanWorkflowFailure,
  type SnykScanWorkflowResult,
  type SnykScanWorkflowSuccess,
} from "../utils/snyk-runner.ts";
import { summarizeSnykIssues, type SnykSummaryIssue } from "../utils/snyk-issues.ts";
import { EXTENSION_DISPLAY_NAME } from "../constants.ts";

const snykMeGetIssuesParams = Type.Object(
  {
    includeRaw: Type.Optional(Type.Boolean({ description: "Include raw SARIF path references in details when available." })),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 200,
        description: "Optional limit on the number of summary items returned.",
      }),
    ),
  },
  { additionalProperties: false },
);

const PREPARED_SUMMARY: readonly SnykSummaryIssue[] = [
  {
    severity: "critical",
    where: "src/commands/snykme-command.ts",
    what: "SNYKME-001",
    why: "Planned Snyk CLI findings should be summarized here.",
    cwe: ["CWE-089"],
  },
  {
    severity: "high",
    where: "src/tools/snykme-get-issues-tool.ts",
    what: "SNYKME-002",
    why: "Placeholder output remains deterministic until runtime scan is enabled.",
    cwe: ["CWE-020"],
  },
  {
    severity: "medium",
    where: "src/utils/snyk-issues.ts",
    what: "SNYKME-003",
    why: "Parser behavior is currently validation-only in preparation mode.",
    cwe: ["CWE-079"],
  },
  {
    severity: "low",
    where: "src/utils/snyk-runner.ts",
    what: "SNYKME-004",
    why: "Command boundary checks run in preparation mode before actual execution.",
    cwe: ["CWE-078"],
  },
  {
    severity: "warning",
    where: "README.md",
    what: "SNYKME-005",
    why: "Documentation should stay consistent while implementation matures.",
    cwe: ["CWE-200"],
  },
  {
    severity: "info",
    where: "specs/spec-review-pi-extension-first-pass-tasks.md",
    what: "SNYKME-006",
    why: "Preparation scope keeps execution deferred until explicit enablement.",
    cwe: ["CWE-703"],
  },
];

const DEFAULT_LIMIT = 6;

interface ToolRuntimeOptions {
  scanExecutor?: (options: RunSnykScanWorkflowOptions) => Promise<SnykScanWorkflowResult>;
}

function hasOwn<T extends Record<string, unknown>>(value: T, key: string): boolean {
  return Object.hasOwn(value, key);
}

function normalizeLimit(rawLimit: unknown): number {
  if (typeof rawLimit === "number" && Number.isInteger(rawLimit)) {
    if (rawLimit < 1) {
      return DEFAULT_LIMIT;
    }

    if (rawLimit > 200) {
      return 200;
    }

    return rawLimit;
  }

  return DEFAULT_LIMIT;
}

function normalizeIncludeRaw(rawIncludeRaw: unknown): boolean {
  return rawIncludeRaw === true;
}

function toSafeRepositoryPath(contextValue: unknown): string {
  return typeof contextValue === "string" && contextValue.length > 0 ? contextValue : process.cwd();
}

function prepareToolSummary(limit: number, includeRaw: boolean, repositoryPath: string) {
  const plan = createSnykScanPlan(repositoryPath, ".");

  if (!plan.success) {
    return {
      summaryText: `${EXTENSION_DISPLAY_NAME} tool is prepared, but scan planning did not pass validation.`,
      details: {
        plannedCommand: "snyk code test . --sarif > snyk-code.sarif",
        error: plan.message,
        plannedCleanupTargets: PLANNED_SCAN_ARTIFACTS,
        issueCount: 0,
      },
    };
  }

  const selected = PREPARED_SUMMARY.slice(0, limit);
  const truncationNotice = selected.length < PREPARED_SUMMARY.length
    ? `Response truncated to ${selected.length} item(s); run with a larger limit to include more placeholders.`
    : undefined;

  const details: Record<string, unknown> = {
    plannedCommand: "snyk code test . --sarif > snyk-code.sarif",
    plannedCleanupTargets: plan.plannedCleanupTargets,
    plannedScanPath: ".",
    requestedLimit: limit,
    effectiveLimit: selected.length,
    issueCount: PREPARED_SUMMARY.length,
    truncationNotice,
    summary: summarizeSnykIssues(selected),
  };

  if (includeRaw) {
    details.rawPaths = plan.plannedCleanupTargets;
  }

  return {
    summaryText: `${EXTENSION_DISPLAY_NAME} tool is prepared; implementation is deferred in this planning session.`,
    details,
  };
}

function formatScanResult(
  result: SnykScanWorkflowSuccess | SnykScanWorkflowFailure,
  requestedLimit: number,
  includeRaw: boolean,
) {
  if (result.status === "failure") {
    return {
      summaryText: `${EXTENSION_DISPLAY_NAME} scan failed: ${result.message} ${result.remediation}`,
      details: {
        plannedCommand: result.plannedCommand,
        plannedCleanupTargets: result.plannedCleanupTargets,
        cleanup: result.cleanup,
        requestedLimit,
        issueCount: result.summary?.total ?? 0,
        error: result.code,
        failureDetails: result.details ?? result.message,
      },
    };
  }

  const truncationNotice = result.summary.total > requestedLimit
    ? `Response truncated to ${requestedLimit} item(s); rerun with a larger limit for more.`
    : undefined;
  const effectiveLimit = Math.min(requestedLimit, result.summary.total);
  const issueItems = Array.isArray(result.summary.items) ? result.summary.items : [];
  const visibleItems = issueItems.slice(0, effectiveLimit);
  const findingsPayload = visibleItems.map((item) => {
    const finding = {
      severity: item.rawSeverity ?? item.severity,
      what: item.what,
      where: item.where,
      why: item.why,
    };

    if (item.cwe.length > 0) {
      return {
        ...finding,
        cwe: item.cwe,
      };
    }

    return finding;
  });

  const summaryText = [
    JSON.stringify(findingsPayload, null, 2),
    truncationNotice ? `\n${truncationNotice}` : "",
  ].join("\n").trim();

  return {
    summaryText,
    details: {
      plannedCommand: result.plannedCommand,
      plannedCleanupTargets: result.plannedCleanupTargets,
      cleanup: result.cleanup,
      requestedLimit,
      effectiveLimit,
      issueCount: result.summary.total,
      truncationNotice,
      summary: {
        total: result.summary.total,
        bySeverity: result.summary.bySeverity,
        items: visibleItems,
      },
      invalidCount: result.summary.invalidCount,
      warnings: result.summary.warnings,
      rawPaths: includeRaw
        ? {
            rawSarif: result.plannedArtifacts.rawSarifPath,
            cleanSarif: result.plannedArtifacts.cleanSarifPath,
          }
        : undefined,
    },
  };
}
/**
 * Tool registration.
 *
 * In scaffold mode (no scan executor injected), the tool reports deterministic
 * prepared-mode placeholders. When a scan executor is provided, the tool executes
 * the same workflow used by /snykme and returns workflow summaries.
 */
export function registerSnykMeTool(pi: ExtensionAPI, options: ToolRuntimeOptions = {}) {
  pi.registerTool({
    name: "snykme_get_issues",
    label: "SnykMe Get Issues",
    description:
      "Retrieve a concise summary of Snyk code scan issues for the current repository. (Prepared only; implementation pending)",
    promptSnippet: "Fetch a concise summary of Snyk code scan findings from the current repository.",
    promptGuidelines: [
      "Use snykme_get_issues when the user asks for Snyk code scan findings with a short summary output.",
    ],
    parameters: snykMeGetIssuesParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const safeParams =
        params && typeof params === "object" && !Array.isArray(params)
          ? (params as Record<string, unknown>)
          : {};

      const limit = hasOwn(safeParams, "limit") ? normalizeLimit(safeParams.limit) : DEFAULT_LIMIT;
      const includeRaw = hasOwn(safeParams, "includeRaw") ? normalizeIncludeRaw(safeParams.includeRaw) : false;
      const repositoryPath = toSafeRepositoryPath(ctx?.cwd);

      if (options.scanExecutor) {
        const result = await options.scanExecutor({ repositoryPath, targetPath: "." });
        const { summaryText, details } = formatScanResult(result, limit, includeRaw);

        return {
          content: [
            {
              type: "text",
              text: summaryText,
            },
          ],
          details,
        };
      }

      const plan = prepareToolSummary(limit, includeRaw, repositoryPath);

      return {
        content: [
          {
            type: "text",
            text: `${EXTENSION_DISPLAY_NAME} tool is prepared; implementation is deferred in this planning session.`,
          },
        ],
        details: {
          ...(typeof plan.details === "object" && plan.details !== null ? plan.details : {}),
          prepared: true,
          requestedLimit: limit,
        },
      };
    },
  });
}
