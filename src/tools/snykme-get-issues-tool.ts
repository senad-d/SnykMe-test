import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
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

/**
 * Preparation-phase tool registration.
 *
 * The tool is registered so future implementation can directly call the planned
 * Snyk scan + summary retrieval flow.
 */
export function registerSnykMeTool(pi: ExtensionAPI) {
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
    async execute(_toolCallId, params) {
      const _ = params; // reserved for next implementation phase
      return {
        content: [
          {
            type: "text",
            text:
              `${EXTENSION_DISPLAY_NAME} tool is prepared; implementation is deferred in this preparation phase and no scan has run yet.`,
          },
        ],
        details: {
          plannedCommand: "snyk code test . --sarif > snyk-code.sarif",
          plannedCleanupTargets: ["snyk-code.sarif", "snyk-code-clean.json"],
        },
      };
    },
  });
}
