# First-pass Pi extension review tasks

## Review scope and date
- Date: 2026-07-04
- Scope: Security, runtime bug, and high-risk correctness review of the current scaffold, public command/tool surface, and utility parser.

## Files / areas reviewed
- `src/extension.ts`
- `src/commands/snykme-command.ts`
- `src/tools/snykme-get-issues-tool.ts`
- `src/utils/snyk-issues.ts`
- `test/template.test.mjs`
- `package.json`, `scripts/check-format.mjs`, `scripts/check-package-contents.mjs`
- CI/workflow files under `.github/workflows`

## Safe commands run and results
- `npm run typecheck` ✅ (passes)
- `npm run test` ✅ (12 tests passed)
- `npm run test:coverage` ✅ (12 tests passed; coverage report generated)
- `npm run check:pack` ✅ (package contents check passes)
- `npm run check:format` ✅ (43 files checked)
- `npm run validate` ✅ (format + package checks pass)
- `npm audit --audit-level=moderate --json` ✅ (`vulnerabilities: {}`)
- `pi --no-extensions -e .` ✅ (completed without errors)

## Findings summary by severity/category
### High
- **Security/compliance risk (execution path not yet bounded):** future scan execution is only described as a shell string in placeholders, with no execution guard or policy yet.

### Medium
- **Security/input-handling risk (tool contract mismatch):** tool schema exposes `limit`/`includeRaw` but `snykme_get_issues` currently ignores all input and could return unbounded placeholders or future-unbounded output.
- **Correctness risk (untrusted data handling):** severity mapping in `summarizeSnykIssues` relies on prototype-visible key checks and silently drops non-standard severities.

### Low
- **Attack-surface hardening gap:** no explicit artifact ownership/size policy yet for planned generated files (`snyk-code.sarif`, `snyk-code-clean.json`) before runtime implementation begins.

## Blocked checks / areas not reviewed
- Runtime scan execution (`snyk`, `jq`, and SARIF parsing) is not exercised because implementation remains in scaffold mode.
- Network and external CLI integrations are deferred and were therefore not validated in this review pass.

## Ordered tasks

- [ ] Implement a validated command-execution boundary before enabling any real scan invocation

#### Why

`src/commands/snykme-command.ts` and `src/tools/snykme-get-issues-tool.ts` both declare a planned external command flow (`snyk code test ...`). Running `snyk` through shell without strict argument handling introduces command-injection and working-directory escape risks if arguments or paths are later threaded through user input.

#### How to resolve

- Add a dedicated execution utility (for example `src/utils/snyk-runner.ts`) that:
  - executes using argument arrays (not interpolated shell strings),
  - validates the target working directory is inside `ctx.cwd`,
  - validates command path allowlist (`snyk`) and required env variables,
  - enforces execution timeout and output size limits,
  - returns typed, non-sensitive error categories (`binaryMissing`, `permissionDenied`, `timedOut`, `scanFailed`).
- Wire `/snykme` and `snykme_get_issues` to this utility before enabling real scanning.
- Add command-handler tests that attempt unsafe cwd/path inputs and assert rejection.

#### Acceptance criteria

- Real scan execution only runs when target path is explicitly within the active repository scope.
- No shell-string command composition is used for scan execution.
- Tests prove injection/path-escape attempts are rejected with user-facing actionable errors.
- Executions that fail due missing binary or permissions return deterministic structured tool/command output.

- [ ] Enforce tool `limit` and `includeRaw` semantics before turning on scan output

#### Why

The tool schema already advertises `limit` and `includeRaw` constraints (`minimum: 1`, `maximum: 200`), but current execution ignores parameters. In implementation this can lead to unexpectedly large responses, exposing too much local scan data in one turn.

#### How to resolve

- Implement a deterministic result-limiting path in `src/tools/snykme-get-issues-tool.ts`:
  - default and max cap application,
  - stable ordering before truncation,
  - optional inclusion of raw payload metadata only when `includeRaw === true`,
  - explicit truncation notice in `details`.
- Add tests for edge values (`limit = 1`, `limit = 200`, omitted limit, malformed/extra fields).

#### Acceptance criteria

- Tool response respects `limit` for all code paths.
- `includeRaw: false` excludes raw-path details while default and true behavior are both deterministic.
- A test matrix confirms malformed payloads still return deterministic placeholder output with bounded size.

- [ ] Harden severity normalization against prototype-key and unsupported values

#### Why

In `src/utils/snyk-issues.ts`, severity extraction currently relies on `in` checks and currently drops unsupported severities as invalid fragments. This can produce ambiguous parsing outcomes from malformed SARIF and makes downstream totals harder to trust for security triage.

#### How to resolve

- Replace prototype-chain checks with explicit own-property checks (e.g., `Object.hasOwn`).
- Introduce explicit policy for non-standard severity values (for example: count under `unknown` and retain warning).
- Add unit tests with values such as `__proto__`, `constructor`, and unknown strings/numbers.

#### Acceptance criteria

- Unsupported severity values are handled consistently and do not depend on prototype lookup.
- By-severity totals remain deterministic and aligned with test assertions.
- The invalid/unknown path is covered by unit tests and verified in `npm run test`.
