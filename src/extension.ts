import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSnykMeCommand } from "./commands/snykme-command.ts";
import { registerSnykMeTool } from "./tools/snykme-get-issues-tool.ts";

/**
 * SnykMe extension entry point.
 *
 * Preparation-only: wires planned command/tool registrations only.
 */
export default function registerSnykMeExtension(pi: ExtensionAPI) {
  registerSnykMeCommand(pi);
  registerSnykMeTool(pi);
}
