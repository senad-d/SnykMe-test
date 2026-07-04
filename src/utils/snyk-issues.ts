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

type SeverityBucket = (typeof SEVERITY_BUCKETS)[number];

type SarifIssueRecord = Readonly<{
  severity: unknown;
  level: unknown;
  properties: SarifIssueProperties | undefined;
  locations: unknown;
  where: unknown;
  message: unknown;
  what: unknown;
  ruleId: unknown;
  rule: unknown;
  why: unknown;
  description: unknown;
  shortDescription: unknown;
  cwe: unknown;
}>;

type SarifIssueProperties = Readonly<{
  severity: unknown;
  cwe: unknown;
}>;

const SEVERITY_BUCKETS = [
  "critical",
  "high",
  "medium",
  "low",
  "warning",
  "info",
  "unknown",
] as const;

const SEVERITY_ALIAS_MAP = new Map<string, SeverityBucket>([
  ["blocker", "high"],
  ["critical", "critical"],
  ["danger", "high"],
  ["error", "high"],
  ["fatal", "critical"],
  ["high", "high"],
  ["info", "info"],
  ["informational", "info"],
  ["low", "low"],
  ["medium", "medium"],
  ["moderate", "medium"],
  ["note", "warning"],
  ["none", "unknown"],
  ["undefined", "unknown"],
  ["warning", "warning"],
]);

function normalizeSeverityAlias(rawSeverity: string): SeverityBucket | undefined {
  return SEVERITY_ALIAS_MAP.get(rawSeverity);
}

function normalizeSeverityBucket(rawSeverity: string): SeverityBucket | undefined {
  return SEVERITY_BUCKETS.find((bucket) => bucket === rawSeverity);
}


function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnProperty(value: UnknownRecord, key: string): boolean {
  return Object.hasOwn(value, key);
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readString(value: unknown): string | undefined {
  return normalizeText(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(readString).filter((entry): entry is string => entry !== undefined);
}

function normalizeMessageText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return readString(value);
  }

  if (isObject(value) && hasOwnProperty(value, "text")) {
    return readString(value.text);
  }

  return undefined;
}

function normalizeMessageBody(payload: unknown, kind: "what" | "why"): string | undefined {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const candidate = normalizeMessageBody(entry, kind);
      if (candidate !== undefined) {
        return candidate;
      }
    }
    return undefined;
  }

  if (typeof payload === "string") {
    return readString(payload);
  }

  if (!isObject(payload)) {
    return undefined;
  }

  if (kind === "what" && hasOwnProperty(payload, "text")) {
    return normalizeMessageText(payload);
  }

  if (kind === "why") {
    if (hasOwnProperty(payload, "help")) {
      const helpText = readString(payload.help);
      if (helpText !== undefined) return helpText;
    }

    if (hasOwnProperty(payload, "description")) {
      const descriptionText = readString(payload.description);
      if (descriptionText !== undefined) return descriptionText;
    }

    if (hasOwnProperty(payload, "text")) {
      const text = readString(payload.text);
      if (text !== undefined) return text;
    }
  }

  return undefined;
}

function normalizeIssueRecord(raw: UnknownRecord): SarifIssueRecord {
  const propertiesRaw = isObject(raw.properties) ? raw.properties : undefined;

  return {
    severity: hasOwnProperty(raw, "severity") ? raw.severity : undefined,
    level: hasOwnProperty(raw, "level") ? raw.level : undefined,
    properties: hasOwnProperty(raw, "properties") && propertiesRaw
      ? {
          severity: hasOwnProperty(propertiesRaw, "severity") ? propertiesRaw.severity : undefined,
          cwe: hasOwnProperty(propertiesRaw, "cwe") ? propertiesRaw.cwe : undefined,
        }
      : undefined,
    locations: hasOwnProperty(raw, "locations") ? raw.locations : undefined,
    where: hasOwnProperty(raw, "where") ? raw.where : undefined,
    message: hasOwnProperty(raw, "message") ? raw.message : undefined,
    what: hasOwnProperty(raw, "what") ? raw.what : undefined,
    ruleId: hasOwnProperty(raw, "ruleId") ? raw.ruleId : undefined,
    rule: hasOwnProperty(raw, "rule") ? raw.rule : undefined,
    why: hasOwnProperty(raw, "why") ? raw.why : undefined,
    description: hasOwnProperty(raw, "description") ? raw.description : undefined,
    shortDescription: hasOwnProperty(raw, "shortDescription") ? raw.shortDescription : undefined,
    cwe: hasOwnProperty(raw, "cwe") ? raw.cwe : undefined,
  };
}

function normalizeSeverityField(rawSeverity: unknown, index: number, warnings: string[]): SeverityBucket {
  const normalized = normalizeText(rawSeverity);

  if (!normalized) {
    warnings.push(`Issue at index ${index} is missing severity, mapped to unknown.`);
    return "unknown";
  }

  const lowered = normalized.toLowerCase();

  const aliasBucket = normalizeSeverityAlias(lowered);
  if (aliasBucket !== undefined) {
    return aliasBucket;
  }

  const explicitBucket = normalizeSeverityBucket(lowered);
  if (explicitBucket !== undefined) {
    return explicitBucket;
  }

  warnings.push(`Issue at index ${index} has unsupported severity "${normalized}", mapped to unknown.`);
  return "unknown";
}

function extractSeverity(issue: SarifIssueRecord, index: number, warnings: string[]): SeverityBucket {
  const fromProperties = issue.properties?.severity;
  const rawSeverity = issue.severity ?? issue.level ?? fromProperties;
  return normalizeSeverityField(rawSeverity, index, warnings);
}

function extractWhere(issue: SarifIssueRecord): unknown {
  if (Array.isArray(issue.locations) && issue.locations.length > 0) {
    const firstLocation = issue.locations[0];
    if (isObject(firstLocation) && isObject(firstLocation.physicalLocation) && isObject(firstLocation.physicalLocation.artifactLocation)) {
      const candidate = firstLocation.physicalLocation.artifactLocation.uri;
      if (typeof candidate === "string") {
        return candidate;
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

function extractWhat(issue: SarifIssueRecord): unknown {
  const fromMessage = normalizeMessageBody(issue.message, "what");
  if (fromMessage !== undefined) {
    return fromMessage;
  }

  if (issue.what !== undefined) {
    return issue.what;
  }

  return issue.ruleId ?? issue.rule;
}

function extractWhy(issue: SarifIssueRecord): unknown {
  const fromMessage = normalizeMessageBody(issue.message, "why");
  if (fromMessage !== undefined) {
    return fromMessage;
  }

  if (issue.why !== undefined) {
    return issue.why;
  }

  if (issue.description !== undefined) {
    return issue.description;
  }

  return issue.shortDescription;
}

function createSeverityBucketMap(): Record<SeverityBucket, number> {
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
    const issue = issues[index];

    if (!isObject(issue)) {
      warnings.push(`Skipping issue at index ${index}: issue fragment is not a plain object`);
      continue;
    }

    const normalizedIssue = normalizeIssueRecord(issue);
    const severity = extractSeverity(normalizedIssue, index, warnings);
    const where = readString(extractWhere(normalizedIssue)) ?? "<unknown-location>";
    const cwe = readStringArray(normalizedIssue.properties?.cwe ?? normalizedIssue.cwe);

    void readString(extractWhat(normalizedIssue));
    void readString(extractWhy(normalizedIssue));

    bySeverity[severity] += 1;
    validIssueCount += 1;
  }

  return {
    total: validIssueCount,
    bySeverity,
    invalidCount: warnings.length,
    warnings,
  };
}
