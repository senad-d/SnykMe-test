import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { EXTENSION_DISPLAY_NAME } from "../constants.ts";

/**
 * Preparation-phase command registration.
 *
 * Behavior is intentionally non-functional in this phase. The next implementation
 * session should execute:
 * - `snyk code test . --sarif > snyk-code.sarif`
 * - `jq ... > snyk-code-clean.json`
 */
const HELP_MESSAGE = `${EXTENSION_DISPLAY_NAME} preparation command with scaffold-only behavior.

Usage:
  /snykme [--help | --dry-run | --status]

Flags:
  --help      Show this usage text.
  --dry-run   Show the prepared execution plan without running any scan.
  --status    Show current implementation status.
`;

const PREPARED_MESSAGE = `${EXTENSION_DISPLAY_NAME} is prepared and scaffolded. Command implementation is not active yet; run this command in the next implementation session.`;

const DRY_RUN_MESSAGE = `${EXTENSION_DISPLAY_NAME} dry run is not implemented yet; planned scan command:
snyk code test . --sarif > snyk-code.sarif`;

const STATUS_MESSAGE = `${EXTENSION_DISPLAY_NAME} is currently in preparation mode; command and tool are registered, and scan execution is deferred to a later implementation session.`;

const UNKNOWN_FLAG_MESSAGE = `${EXTENSION_DISPLAY_NAME} arguments are not fully supported in preparation mode. Supported flags are --help, --dry-run, and --status.`;

export function registerSnykMeCommand(pi: ExtensionAPI) {
  pi.registerCommand("/snykme", {
    description: `${EXTENSION_DISPLAY_NAME}: collect a summarized Snyk code scan for the current repository`,
    getArgumentCompletions(prefix) {
      const options = ["--help", "--dry-run", "--status"];
      const normalized = prefix.trim().toLowerCase();
      const matches = options.filter((item) => item.startsWith(normalized));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const normalizedArgs = args
        .trim()
        .split(/\s+/)
        .filter((token) => token.length > 0)
        .map((token) => token.toLowerCase());
      const [flag] = normalizedArgs;

      if (normalizedArgs.length === 0) {
        ctx.ui.notify(PREPARED_MESSAGE, "info");
        return;
      }

      if (normalizedArgs.length === 1) {
        switch (flag) {
          case "--help":
            ctx.ui.notify(HELP_MESSAGE, "info");
            return;
          case "--dry-run":
            ctx.ui.notify(DRY_RUN_MESSAGE, "info");
            return;
          case "--status":
            ctx.ui.notify(STATUS_MESSAGE, "info");
            return;
          default:
            ctx.ui.notify(UNKNOWN_FLAG_MESSAGE, "warning");
            return;
        }
      }

      ctx.ui.notify(UNKNOWN_FLAG_MESSAGE, "warning");
    },
  });
}
