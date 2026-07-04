export type SnykSummaryIssue = {
  severity: string;
  where: string;
  what: string;
  why: string;
  cwe: string[];
};

export interface SummarizedSnykIssueReport {
  total: number;
  bySeverity: Record<string, number>;
  invalidCount: number;
  warnings: string[];
}

type UnknownRecord = Record<string, unknown>;

type SarifIssueRecord = UnknownRecord & {
  severity?: unknown;
  level?: unknown;
  properties?: unknown;
};

const SEVERITY_BUCKETS = [
  "critical",
  "high",
  "medium",
  "low",
  "warning",
  "info",
  "unknown",
] as const;

const SEVERITY_ALIASES: Record<string, string> = {
  blocker: "high",
  critical: "critical",
  danger: "high",
  error: "high",
  fatal: "critical",
  high: "high",
  info: "info",
  informational: "info",
  low: "low",
  medium: "medium",
  moderate: "medium",
  note: "warning",
  none: "unknown",
  undefined: "unknown",
  warning: "warning",
};

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePathPart(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readString(value: unknown): string | undefined {
  return normalizePathPart(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readString(item))
    .filter((item): item is string => item !== undefined);
}

function extractSeverityField(value: unknown): unknown {
  if (!isObject(value)) {
    return undefined;
  }

  if ("severity" in value) {
    return value.severity;
  }

  if ("level" in value) {
    return value.level;
  }

  if (isObject(value.properties) && "severity" in value.properties) {
    return value.properties.severity;
  }

  return undefined;
}

function normalizeSeverity(rawSeverity: unknown): string | undefined {
  const severity = readString(rawSeverity);
  if (!severity) {
    return undefined;
  }

  const normalized = severity.toLowerCase().trim();
  const knownSeverity = normalized as (typeof SEVERITY_BUCKETS)[number];

  if (knownSeverity in SEVERITY_ALIASES) {
    return SEVERITY_ALIASES[normalized];
  }

  return SEVERITY_BUCKETS.includes(knownSeverity) ? knownSeverity : undefined;
}

function buildIssueRecord(raw: unknown, index: number, warnings: string[]): SnykSummaryIssue | null {
  if (!isObject(raw)) {
    warnings.push(`Skipping issue at index ${index}: issue fragment is not a plain object`);
    return null;
  }

  const issue = raw as SarifIssueRecord;
  const severity = normalizeSeverity(extractSeverityField(issue));
  if (!severity) {
    warnings.push(`Skipping issue at index ${index}: missing or unsupported severity`);
    return null;
  }

  const where = readString(extractWhere(issue)) ?? "<unknown-location>";
  const what = readString(extractWhat(issue)) ?? "<unknown-rule>";
  const why = readString(extractWhy(issue)) ?? "<no-description>";

  const cwe = readStringArray(
    isObject(issue.properties) ? (issue.properties as UnknownRecord).cwe : issue.cwe,
  );

  return {
    severity,
    where,
    what,
    why,
    cwe,
  };
}

function extractWhere(issue: UnknownRecord): unknown {
  if (Array.isArray(issue.locations) && issue.locations.length > 0) {
    const firstLocation = issue.locations[0];
    if (isObject(firstLocation)) {
      const location = firstLocation.physicalLocation;
      if (isObject(location) && isObject(location.artifactLocation)) {
        const candidate = location.artifactLocation.uri;
        if (typeof candidate === "string") {
          return candidate;
        }
      }
    }
  }

  if (isObject(issue.locations) && isObject(issue.locations.physicalLocation) && isObject(issue.locations.physicalLocation.artifactLocation)) {
    const candidate = issue.locations.physicalLocation.artifactLocation.uri;
    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return issue.where;
}

function extractWhat(issue: UnknownRecord): unknown {
  if (isObject(issue.message)) {
    const message = issue.message as UnknownRecord;
    if (typeof message.text === "string") {
      return message.text;
    }
  }

  return issue.what ?? issue.ruleId ?? issue.rule;
}

function extractWhy(issue: UnknownRecord): unknown {
  if (isObject(issue.message)) {
    const message = issue.message as UnknownRecord;
    if (typeof message.help === "string") {
      return message.help;
    }
    if (typeof message.description === "string") {
      return message.description;
    }
  }

  if (typeof issue.why === "string") {
    return issue.why;
  }

  return issue.description ?? issue.shortDescription;
}

function createSeverityBucketMap(): Record<(typeof SEVERITY_BUCKETS)[number], number> {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    warning: 0,
    info: 0,
    unknown: 0,
  };
}

/**
 * Pure helper that summarizes parsed Snyk/SARIF issues by normalized severity.
 */
export function summarizeSnykIssues(issues: unknown[]): SummarizedSnykIssueReport {
  const bySeverity = createSeverityBucketMap();

  if (!Array.isArray(issues)) {
    return {
      total: 0,
      bySeverity,
      invalidCount: 1,
      warnings: ["summarizeSnykIssues expects an array input"],
    };
  }

  const warnings: string[] = [];
  let validIssueCount = 0;

  for (let index = 0; index < issues.length; index += 1) {
    const issue = buildIssueRecord(issues[index], index, warnings);
    if (!issue) {
      continue;
    }

    const severityBucket = issue.severity as keyof typeof bySeverity;
    bySeverity[severityBucket] = bySeverity[severityBucket] + 1;
    validIssueCount += 1;
  }

  return {
    total: validIssueCount,
    bySeverity,
    invalidCount: warnings.length,
    warnings,
  };
}
