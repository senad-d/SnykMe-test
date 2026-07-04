# Architecture Specification: SnykMe

## 1. Scope and objective
SnykMe is a Pi extension for running a Snyk code scan in the current repository and returning a concise, clean issue summary that is easy for the LLM to consume.

This session is preparation-only. No runtime scan or file mutation behavior will be implemented yet.

## 2. Primary architecture goals
- Single-purpose focus: retrieve and summarize Snyk findings from the current repository.
- Explicitly read-only output path during implemented phase: commands/tools should not mutate user files.
- Clean integration with Pi: command `/snykme` and tool `snykme_get_issues`.
- Minimal user friction: clear “not connected” / setup messaging when Snyk CLI cannot be used.

## 3. Extension structure
- `src/extension.ts`: bootstrap file.
  - Keep small and only register submodules.
- `src/constants.ts`: extension naming keys.
- `src/commands/snykme-command.ts`: command entrypoint registration.
- `src/tools/snykme-get-issues-tool.ts`: tool definition and schema.
- `src/utils/snyk-issues.ts`: helper utilities for normalizing and formatting summary records.
- `src/archive/*`: intentionally retained placeholders for migration traceability; these are not active in extension wiring.
- `docs/project-definition-brief.md`: approved plan source.
- `specs/`:
  - `spec-architecture.md`
  - `spec-guidelines.md`
  - `spec-tasks.md`

## 4. Planned Pi surfaces and contracts

### 4.1 Slash command: `/snykme`
- Input: optional flags for future options (planned as optional extension of schema).
- Initial behavior (planned):
  1. Run scan in current working repo context.
  2. Convert SARIF to compact JSON summary.
  3. Return summary for LLM readability.
- Default scope: current repo only.
- No directory/target argument in MVP.

### 4.2 Tool: `snykme_get_issues`
- Tool role: same intent as command, agent-invokable form.
- Planned parameters:
  - `includeRaw` (optional boolean) for future expansion.
  - `limit` (optional number) for cap in response body.
- Planned output contract (summary-only): list of normalized findings with:
  - `severity`
  - `where`
  - `what`
  - `why`
  - `cwe`
- Tool must emit an explicit message when Snyk is unavailable or unauthenticated.

### 4.3 Events
- `session_start` and `session_shutdown` hooks may set/clear a lightweight status string only.
- No background services, watchers, or persistent process state.

## 5. Data flow (planned implementation session)
1. User invokes `/snykme` or tool.
2. Extension executes Snyk scan command in `ctx.cwd`:
   - `snyk code test . --sarif > snyk-code.sarif`
3. Parse SARIF to clean JSON shape using `jq` transformation:
   - output to `snyk-code-clean.json`
4. Read results and shape final normalized summary records.
5. Return summary text with severity grouping and concise issue count.
6. If scan/CLI/auth fails, return a clear error message and suggested remediation.

## 6. Security and trust boundaries
- Trust boundary is local filesystem + Snyk CLI.
- Extension must never store credentials.
- `snyk` authentication remains a precondition managed by the user outside the extension.
- Command execution should only run in current repository path.
- Keep output concise; include truncation notice when data is clipped.

## 7. Module boundaries and constraints
- Pure formatting/parsing helpers in `src/utils` for testability.
- No cross-module mutable global state.
- Command module should remain synchronous/await-safe and rely on `ExtensionContext` and `pi.registerCommand` only.
- Tool module should define strict TypeBox schema and stable prompt guidance.

## 8. Dependencies and packaging
- Keep Pi runtime dependencies in `peerDependencies` with `"*"`:
  - `@earendil-works/pi-ai`
  - `@earendil-works/pi-coding-agent`
  - `typebox`
- Runtime command-line dependency expectation is external (`snyk`, `jq`) and documented.
- Node engine from template remains `>=22.19.0`.

## 9. Planned decisions that drive implementation
- Command name: `/snykme`.
- Tool name: `snykme_get_issues`.
- Scope: current repository only.
- Output style: summary JSON-like records for LLM readability.
- Installation/authentication handling: documented manual prerequisite, no in-extension credential flow.

## 10. Open risks and mitigations
- **Risk:** Snyk/JQ unavailable in runtime environment.
  - Mitigation: detect and return explicit setup message.
- **Risk:** Large result set may exceed model context.
  - Mitigation: summarize counts by severity and cap per-call item list.
- **Risk:** Missing `snyk-code.sarif` due command failures.
  - Mitigation: clear actionable error text with command re-run recommendation.
