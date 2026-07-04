# Project Definition Brief

## 1. Bootstrap

- Source of truth for preparation handoff: `docs/project-definition-brief.md` plus `specs/spec-architecture.md`, `specs/spec-guidelines.md`, `specs/spec-tasks.md`.
- Template source: `/Users/senad/Documents/Code/Moj_git/pi-tmp`
- Target directory: `/Users/senad/Documents/Code/Moj_git/pi-snykme`
- Copy status: Completed (template files copied into target directory before this phase)

## 2. Project identity
- Package name: `@senad-d/snykme`
- Display name: `SnykMe`
- Exported extension function: `registerSnykMeExtension`
- Repository URL: `https://github.com/senad-d/SnykMe`
- One-sentence pitch: SnykMe runs the project-local Snyk CLI scan and returns a concise, LLM-friendly issue summary for the current repository.

## 3. Users and use cases
- Primary users: CI reviewers, app developers, LLM agents inside Pi.
- Primary use cases:
  - Pull security findings for the current repository directly from Pi.
  - Consume clean summaries instead of raw SARIF.
  - Surface explicit authentication/connection errors to the user.
- Non-goals:
  - Managing Snyk installation or login flow.
  - Applying fixes or mutating project state.
  - Running scans outside the current working repository.

## 4. Pi integration surface
| Surface | Name | Purpose | Notes |
| --- | --- | --- | --- |
| Command | `/snykme` | Trigger scan + summarize flow for current repo | Planned only; implementation deferred to next session |
| Tool | `snykme_get_issues` | Retrieve scan summary from SARIF conversion output | Planned only; no mutation behavior |
| Event | `session_start` | Optional lightweight status indicator | No long-lived resources in this phase |
| Event | `session_shutdown` | Optional cleanup if any session state is added later | Not required for initial preparation |
| UI | command notification | Display connected/not-connected/failure messages | Notification only |
| Resource | none | No additional prompts/skils/themes | Planned for future if needed |

## 5. Architecture
- Planned files:
  - `src/extension.ts` (factory bootstrap only)
  - `src/commands/snykme-command.ts`
  - `src/tools/snykme-get-issues-tool.ts`
  - `src/constants.ts`
  - `src/utils/snyk-issues.ts` (shared parsing helper skeleton)
  - `src/archive/*` (intentionally retained placeholders and migration notes)
  - `specs/spec-architecture.md`
  - `specs/spec-guidelines.md`
  - `specs/spec-tasks.md`
  - `docs/project-definition-brief.md`
- Module boundaries:
  - `extension.ts`: registers command/tool/event modules only.
  - `commands/*`: user-triggered interactions and option handling.
  - `tools/*`: schema-driven callable tool behavior.
  - `utils/*`: pure helpers for shaping summary output and validation.
- Dependencies:
  - Keep Pi core packages in `peerDependencies` and command/tool dependencies minimal.
  - No additional runtime dependency required in prep session.

## 6. Config, state, and persistence
- Config source: no extension-specific config in MVP (defaults in code).
- Session state: no durable extension state.
- Files written: only planned command output artifacts (`snyk-code.sarif`, `snyk-code-clean.json`) during runtime implementation (not this prep pass).
- Cleanup behavior: no long-lived sessions/processes.

## 7. Security and privacy
- Shell execution: planned `snyk code test` + `jq` commands via tool/command; requires user-supplied Snyk setup.
- File access/mutation: planned reads of generated SARIF files in current repo only.
- Network access: performed by authenticated `snyk` CLI against user-linked account.
- Credentials/secrets: extension does not handle secrets; users authenticate externally.
- Telemetry/retention: no telemetry; output shown only in session messages.
- User confirmations: no destructive actions; return clear connection/error guidance.

## 8. Documentation and packaging
- README changes: replace template text with SnykMe command/tool docs and command usage.
- SECURITY changes: add Snyk auth/install prerequisites and no-secret handling.
- CHANGELOG changes: add initial SnykMe project entry.
- package.json changes: update name/metadata, remove template-specific placeholders.
- npm/git distribution plan: publish/package as `@senad-d/snykme` and install via `pi install`.

## 9. Validation plan
- Typecheck: `npm run typecheck`
- Tests: update template tests for renamed metadata and required surfaces.
- Package dry-run: `npm pack --dry-run`
- Isolated Pi smoke test: `pi --no-extensions -e .`

## 10. Open questions and assumptions
- Questions (assumed defaults):
  - Author metadata defaults to `Senad Dizdarević`.
  - License defaults to `MIT`.
  - Session status hooks remain optional placeholders only.
- Assumptions:
  - Current directory is the target repository.
  - Users install and authenticate Snyk manually before use.
  - Output should be summary-only, not raw SARIF dump.
- Decisions:
  - Keep command and tool names fixed as requested: `/snykme`, `snykme_get_issues`.
  - Keep command/tool behavior discovery/summarization scope to current repo only.
  - Output must be summary format and concise for model context.
