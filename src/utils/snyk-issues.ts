export type SnykSummaryIssue = {
  severity: string;
  rawSeverity?: string;
  where: string;
  what: string;
  why: string;
  howToFix?: string;
  cwe: string[];
};

export interface SummarizedSnykIssueReport {
  total: number;
  bySeverity: Record<string, number>;
  invalidCount: number;
  warnings: string[];
  items?: SnykSummaryIssue[];
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
  snykRule: UnknownRecord | undefined;
  why: unknown;
  description: unknown;
  shortDescription: unknown;
  cwe: unknown;
  help: unknown;
  helpUri: unknown;
}>;

type SarifRuleMetadata = Readonly<{
  shortDescription?: unknown;
  properties?: unknown;
}>;

type SarifIssueProperties = Readonly<{
  severity: unknown;
  cwe: unknown;
  remediation: unknown;
  fix: unknown;
  recommendation: unknown;
  recommendationText: unknown;
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

  if (isObject(value) && hasOwnProperty(value, "message")) {
    return normalizeMessageBody(value.message, "what");
  }

  if (isObject(value) && hasOwnProperty(value, "help")) {
    return normalizeHelpBody(value.help);
  }

  return undefined;
}

function normalizeHelpBody(payload: unknown): string | undefined {
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const candidate = normalizeHelpBody(entry);
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

  const candidateKeys: readonly string[] = [
    "text",
    "help",
    "description",
    "message",
    "details",
    "fix",
    "remediation",
    "recommendation",
    "recommendationText",
    "what",
    "why",
  ];

  for (const key of candidateKeys) {
    if (!hasOwnProperty(payload, key)) {
      continue;
    }

    const candidate = normalizeHelpBody(payload[key]);
    if (candidate !== undefined) {
      return candidate;
    }
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

    if (hasOwnProperty(payload, "message")) {
      const messageText = normalizeMessageBody(payload.message, kind);
      if (messageText !== undefined) return messageText;
    }

    if (hasOwnProperty(payload, "shortDescription")) {
      const shortDescriptionText = normalizeMessageText(payload.shortDescription);
      if (shortDescriptionText !== undefined) return shortDescriptionText;
    }

    if (hasOwnProperty(payload, "why")) {
      const whyText = normalizeMessageBody(payload.why, kind);
      if (whyText !== undefined) return whyText;
    }
  }

  if (kind === "what" && hasOwnProperty(payload, "message")) {
    const messageText = normalizeMessageBody(payload.message, kind);
    if (messageText !== undefined) {
      return messageText;
    }
  }

  return undefined;
}

function normalizeIssueRecord(raw: UnknownRecord): SarifIssueRecord {
  const propertiesRaw = isObject(raw.properties) ? raw.properties : undefined;
  const snykRule = hasOwnProperty(raw, "snykRule") && isObject(raw.snykRule) ? raw.snykRule : undefined;

  return {
    severity: hasOwnProperty(raw, "severity") ? raw.severity : undefined,
    level: hasOwnProperty(raw, "level") ? raw.level : undefined,
    properties: hasOwnProperty(raw, "properties") && propertiesRaw
      ? {
          severity: hasOwnProperty(propertiesRaw, "severity") ? propertiesRaw.severity : undefined,
          cwe: hasOwnProperty(propertiesRaw, "cwe") ? propertiesRaw.cwe : undefined,
          remediation: hasOwnProperty(propertiesRaw, "remediation") ? propertiesRaw.remediation : undefined,
          fix: hasOwnProperty(propertiesRaw, "fix") ? propertiesRaw.fix : undefined,
          recommendation: hasOwnProperty(propertiesRaw, "recommendation") ? propertiesRaw.recommendation : undefined,
          recommendationText: hasOwnProperty(propertiesRaw, "recommendationText")
            ? propertiesRaw.recommendationText
            : undefined,
        }
      : undefined,
    locations: hasOwnProperty(raw, "locations") ? raw.locations : undefined,
    where: hasOwnProperty(raw, "where") ? raw.where : undefined,
    message: hasOwnProperty(raw, "message") ? raw.message : undefined,
    what: hasOwnProperty(raw, "what") ? raw.what : undefined,
    ruleId: hasOwnProperty(raw, "ruleId") ? raw.ruleId : undefined,
    rule: hasOwnProperty(raw, "rule") ? raw.rule : undefined,
    snykRule,
    why: hasOwnProperty(raw, "why") ? raw.why : undefined,
    description: hasOwnProperty(raw, "description") ? raw.description : undefined,
    shortDescription: hasOwnProperty(raw, "shortDescription") ? raw.shortDescription : undefined,
    cwe: hasOwnProperty(raw, "cwe") ? raw.cwe : undefined,
    help: hasOwnProperty(raw, "help") ? raw.help : undefined,
    helpUri: hasOwnProperty(raw, "helpUri") ? raw.helpUri : undefined,
  };
}

function extractSeverityFromIssue(issue: SarifIssueRecord, index: number, warnings: string[]): {
  severity: string;
  severityBucket: SeverityBucket;
} {
  const fromProperties = issue.properties?.severity;
  const rawSeverity = issue.severity ?? issue.level ?? fromProperties;
  const normalizedSeverityText = normalizeText(rawSeverity);

  if (!normalizedSeverityText) {
    warnings.push(`Issue at index ${index} is missing severity, mapped to unknown.`);
    return {
      severity: "unknown",
      severityBucket: "unknown",
    };
  }

  const lowered = normalizedSeverityText.toLowerCase();
  const aliasBucket = normalizeSeverityAlias(lowered);
  if (aliasBucket !== undefined) {
    return {
      severity: lowered,
      severityBucket: aliasBucket,
    };
  }

  const explicitBucket = normalizeSeverityBucket(lowered);
  if (explicitBucket !== undefined) {
    return {
      severity: lowered,
      severityBucket: explicitBucket,
    };
  }

  warnings.push(`Issue at index ${index} has unsupported severity "${normalizedSeverityText}", mapped to unknown.`);

  return {
    severity: lowered,
    severityBucket: "unknown",
  };
}

function readRuleShortDescription(rule: SarifRuleMetadata | undefined): string | undefined {
  if (rule === undefined) {
    return undefined;
  }

  const candidate = isObject(rule)
    ? (rule.shortDescription as unknown)
    : undefined;

  if (candidate === undefined) {
    return undefined;
  }

  if (typeof candidate === "string") {
    return readString(candidate);
  }

  if (isObject(candidate) && hasOwnProperty(candidate, "text")) {
    return readString(candidate.text);
  }

  return undefined;
}

function extractLineFromPhysicalLocation(physicalLocation: UnknownRecord): string | undefined {
  const region = physicalLocation.region;
  if (!isObject(region)) {
    return undefined;
  }

  return extractLineNumber(region.startLine);
}

function extractLineNumber(rawLine: unknown): string | undefined {
  if (typeof rawLine === "number" && Number.isInteger(rawLine) && rawLine > 0) {
    return String(rawLine);
  }

  const lineText = readString(rawLine);
  return lineText !== undefined && lineText.length > 0 ? lineText : undefined;
}

function extractCwe(issue: SarifIssueRecord): string[] {
  const fromRuleProperties = issue.snykRule?.properties as UnknownRecord | undefined;
  const fromRulePropertiesCwe = fromRuleProperties ? readStringArray(fromRuleProperties.cwe) : [];

  if (fromRulePropertiesCwe.length > 0) {
    return fromRulePropertiesCwe;
  }

  return readStringArray(issue.properties?.cwe ?? issue.cwe);
}

function extractWhere(issue: SarifIssueRecord): unknown {
  if (Array.isArray(issue.locations) && issue.locations.length > 0) {
    const firstLocation = issue.locations[0];
    if (
      isObject(firstLocation) &&
      isObject(firstLocation.physicalLocation) &&
      isObject(firstLocation.physicalLocation.artifactLocation)
    ) {
      const physicalLocation = firstLocation.physicalLocation;
      const artifactLocation = physicalLocation.artifactLocation as UnknownRecord;
      const lineNumber = extractLineFromPhysicalLocation(physicalLocation);
      const candidate = artifactLocation.uri;

      if (typeof candidate === "string") {
        return lineNumber === undefined ? candidate : `${candidate}:${lineNumber}`;
      }
    }
  }

  if (
    isObject(issue.locations) &&
    isObject(issue.locations.physicalLocation) &&
    isObject(issue.locations.physicalLocation.artifactLocation)
  ) {
    const physicalLocation = issue.locations.physicalLocation;
    const artifactLocation = physicalLocation.artifactLocation as UnknownRecord;
    const lineNumber = extractLineFromPhysicalLocation(physicalLocation);
    const candidate = artifactLocation.uri;

    if (typeof candidate === "string") {
      return lineNumber === undefined ? candidate : `${candidate}:${lineNumber}`;
    }
  }

  return issue.where;
}

function extractWhat(issue: SarifIssueRecord): unknown {
  const fromRule = readRuleShortDescription(issue.snykRule);
  if (fromRule !== undefined) {
    return fromRule;
  }

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

function extractHowToFix(issue: SarifIssueRecord): unknown {
  const fromHelp = normalizeHelpBody(issue.help);
  if (fromHelp !== undefined) {
    return fromHelp;
  }

  if (issue.helpUri !== undefined) {
    const helpUri = readString(issue.helpUri);
    if (helpUri !== undefined) {
      return `See Snyk guidance: ${helpUri}`;
    }
  }

  if (issue.rule && isObject(issue.rule)) {
    const ruleHelp = normalizeHelpBody(issue.rule.help);
    if (ruleHelp !== undefined) {
      return ruleHelp;
    }

    if (hasOwnProperty(issue.rule, "helpUri")) {
      const ruleHelpUri = readString(issue.rule.helpUri);
      if (ruleHelpUri !== undefined) {
        return `See Snyk guidance: ${ruleHelpUri}`;
      }
    }
  }

  const fromPropertiesRemediation = normalizeHelpBody(issue.properties?.remediation);
  if (fromPropertiesRemediation !== undefined) {
    return fromPropertiesRemediation;
  }

  const fromPropertiesFix = normalizeHelpBody(issue.properties?.fix);
  if (fromPropertiesFix !== undefined) {
    return fromPropertiesFix;
  }

  const fromPropertiesRecommendation = normalizeHelpBody(issue.properties?.recommendation);
  if (fromPropertiesRecommendation !== undefined) {
    return fromPropertiesRecommendation;
  }

  const fromPropertiesRecommendationText = normalizeHelpBody(issue.properties?.recommendationText);
  if (fromPropertiesRecommendationText !== undefined) {
    return fromPropertiesRecommendationText;
  }

  const fromMessage = normalizeHelpBody(issue.message);
  if (fromMessage !== undefined && fromMessage !== extractWhat(issue)) {
    return fromMessage;
  }

  return undefined;
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
      items: [],
    };
  }

  const warnings: string[] = [];
  const normalizedItems: SnykSummaryIssue[] = [];
  let validIssueCount = 0;

  for (let index = 0; index < issues.length; index += 1) {
    const issue = issues[index];

    if (!isObject(issue)) {
      warnings.push(`Skipping issue at index ${index}: issue fragment is not a plain object`);
      continue;
    }

    const normalizedIssue = normalizeIssueRecord(issue);
    const severityData = extractSeverityFromIssue(normalizedIssue, index, warnings);
    const severity = severityData.severity;
    const where = readString(extractWhere(normalizedIssue)) ?? "<unknown-location>";
    const what = readString(extractWhat(normalizedIssue)) ?? "<no rule text>";
    const why = readString(extractWhy(normalizedIssue)) ?? "<no details provided>";
    const howToFix = readString(extractHowToFix(normalizedIssue)) ?? "<no direct fix guidance in scan output>";
    const cwe = extractCwe(normalizedIssue);

    normalizedItems.push({
      severity: severityData.severityBucket,
      rawSeverity: severity,
      where,
      what,
      why,
      howToFix,
      cwe,
    });

    bySeverity[severityData.severityBucket] += 1;
    validIssueCount += 1;
  }

  return {
    total: validIssueCount,
    bySeverity,
    invalidCount: warnings.length,
    warnings,
    items: normalizedItems,
  };
}
