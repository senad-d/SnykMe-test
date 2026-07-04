# Guidelines Specification: SnykMe

## 1. Purpose
These guidelines define how SnykMe should be implemented in the next session after preparation.

- Keep implementation focused on security-surface clarity and LLM-readable summaries.
- Keep shell use explicit, minimal, and scoped to the current repository.

## 2. Repository and module rules
- `src/extension.ts` must stay small and only wire feature modules via `register*` calls.
- Feature files should be grouped by purpose under `src/commands`, `src/tools`, `src/utils`.
- `src/constants.ts` holds extension identifiers and status keys.
- No implementation should be placed outside these modules unless required for planning/docs.

## 3. Pi extension behavior rules
- Register one slash command: `/snykme`.
- Register one tool: `snykme_get_issues`.
- Add tool `promptSnippet` and `promptGuidelines`.
- Register optional session status hooks only for non-invasive status visibility.
- Do not start long-lived processes in factory or module top level.
- Session-scoped resources (if any) are started on demand and cleaned in `session_shutdown`.

## 4. Command/tool contracts
- Command `/snykme` should support:
  - default execution,
  - optional `--help` behavior if available.
- Tool `snykme_get_issues` schema must be explicit and stable.
- Tool output must be summary-only; no raw SARIF dump.
- Error paths must explicitly state:
  - `snyk` not installed,
  - not authenticated/connection issue,
  - parse/permission errors.

## 5. Security and privacy rules
- Do not handle tokens/secrets in extension code.
- Do not send output or credentials to external services from extension logic.
- Do not mutate repository files during scan execution.
- Temporary SARIF files are expected artifacts; document cleanup behavior if created.
- Use exact command paths only in current `cwd`.
- Prefer concise outputs; truncate with explicit notice when limits are exceeded.

## 6. Documentation rules
- Keep README minimal and precise.
- Include explicit prerequisites:
  - Snyk CLI installed,
  - Snyk account authentication completed outside extension.
- Document both command and tool surfaces.
- Update CHANGELOG and SECURITY during preparation and whenever behavior changes.

## 7. Validation and quality rules
- Before feature implementation, run:
  - `npm run typecheck`
  - `npm run test`
  - `npm run test:coverage`
  - `npm run check:pack`
  - `npm run validate` (when dependencies installed and all checks are ready).
- Smoke validation command: `pi --no-extensions -e .`.
- Keep checks focused on metadata and structure for this preparation phase.

## 8. Testing rules (next implementation session)
- Add unit/integration tests for:
  - command/tool registration,
  - summary normalization helper,
  - error messaging for missing Snyk/JQ/auth.
- Avoid testing against external Snyk accounts in unit tests; use controlled fixtures or mocks.

## 9. Operational constraints
- No background jobs, timers, sockets, watchers, or file watchers in extension startup.
- Avoid any file writes except intentionally documented artifacts and only when feature is implemented in a later session.
- Keep dependencies minimal and avoid adding nonessential runtime packages.

## 10. Dependency and packaging expectations
- Keep Pi core packages in `peerDependencies` with `"*"`.
- Use `dependencies` only for non-core runtime needs.
- Avoid adding tooling packages unless needed for command output shaping/validation.
