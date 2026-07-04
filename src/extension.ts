import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSnykMeCommand } from "./commands/snykme-command.ts";
import { registerSnykMeTool } from "./tools/snykme-get-issues-tool.ts";
import { runSnykScanWorkflow } from "./utils/snyk-runner.ts";

/**
 * SnykMe extension entry point.
 */
export default function registerSnykMeExtension(pi: ExtensionAPI) {
  registerSnykMeCommand(pi, { scanExecutor: runSnykScanWorkflow });
  registerSnykMeTool(pi, { scanExecutor: runSnykScanWorkflow });
}
