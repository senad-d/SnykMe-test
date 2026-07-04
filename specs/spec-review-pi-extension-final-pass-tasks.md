# Final-pass Pi extension review tasks

## Review scope and date
- Date: 2026-07-04
- Scope: Final verification of core assumptions, Pi lifecycle behavior, edge cases, and follow-up coverage needed for implementation readiness.

## Files / areas reviewed
- `src/extension.ts`
- `src/commands/snykme-command.ts`
- `src/tools/snykme-get-issues-tool.ts`
- `src/utils/snyk-issues.ts`
- `test/template.test.mjs`
- `scripts/check-format.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- Previous review outputs:
  - `specs/spec-review-pi-extension-first-pass-tasks.md`
  - `specs/spec-review-pi-extension-second-pass-tasks.md`

## Previous claims or assumptions verified
- `registerSnykMeExtension` remains thin and only wires command/tool registrations (verified via tests and local read).
- Command/tool handlers run in preparation mode and do not execute external processes (verified by source inspection).
- `npm` validation checks currently run successfully on the scaffold with no failing checks.

## Safe commands run and results
- `npm run typecheck` ✅
- `npm run test` ✅
- `npm run test:coverage` ✅
- `npm run check:format` ✅
- `npm run check:pack` ✅
- `npm run validate` ✅
- `pi --no-extensions -e .` ✅

## Findings summary by severity/category
### High
- **Verification gap:** assumptions about future scan execution behavior (artifact handling, cwd scoping, and error states) are not yet exercised because runtime code paths are still deferred.

### Medium
- **Edge-case gap:** lifecycle/error behaviors around command/tool failure modes are only partially covered; current tests focus on contract shape, not abort/time-to-fail scenarios or partial data conditions.

### Low
- **Assumption management gap:** current docs and comments mention deferred behavior but there is no explicit follow-up checklist tied to each deferred failure mode (e.g., CLI missing, auth denied, permission errors).

## Blocked checks / not reviewed
- Full runtime validation against actual `snyk` CLI output and auth states is currently blocked by preparation scope (no scan implementation).
- Network-dependent behavior (e.g., SonarQube endpoint responses) not reviewed in this pass.

## Ordered tasks

- [ ] Add end-to-end verification tests for scan preconditions once runtime implementation is enabled

#### Why

The highest-impact assumptions (external command availability, auth state, and repository scope) are not yet verifiable in this scaffold state. These are exactly the behaviors that can fail in production and produce misleading tool output.

#### How to resolve

- Add an integration test layer that injects controlled scan execution outcomes:
  - missing `snyk` binary,
  - command timeout,
  - permission/read error,
  - malformed SARIF input,
  - successful scan with known issue set.
- Reuse a mocked command runner (from first-pass hardening design) so tests are deterministic.

#### Acceptance criteria

- Each outcome returns a deterministic, user-facing message and no uncaught rejection.
- Tool/command behavior includes clear remediation guidance for each precondition failure.
- Tests can run in CI without external network/CLI dependencies.

- [ ] Verify argument and payload edge cases after implementation against Pi lifecycle contract

#### Why

Current tests verify happy-path parser and some malformed input cases, but edge conditions relevant after implementation (rapid repeated invocations, malformed `ctx` state, invalid argument combinations, and zero-length artifact results) are not yet locked.

#### How to resolve

- Extend tests around `/snykme` and `snykme_get_issues` for:
  - repeated rapid calls and deterministic responses,
  - unexpected `ctx` values,
  - combined/duplicate flags,
  - empty scan result files,
  - large-result truncation with `limit`.
- Keep `src/extension.ts` invariant check (single command/tool registration, no hooks) and add a regression for it if it drifts.

#### Acceptance criteria

- New test cases cover the listed edge cases and are deterministic.
- Command/tool responses do not mutate extension-level state across repeated calls.
- Failures remain readable and localized in `ctx.ui.notify`/tool result details.

- [ ] Add explicit teardown and artifact-cleanup verification

#### Why

Planned artifacts (`snyk-code.sarif`, `snyk-code-clean.json`) are central to this extension. Without verified cleanup and path rules, stale or oversized files can leak data and accumulate across sessions.

#### How to resolve

- Add lifecycle-aware tests and helper docs for scan artifacts:
  - artifact created inside active repo root only,
  - overwritten only intentionally,
  - cleanup performed on success and failure paths,
  - explicit path allowlist/denylist in execution helper.

#### Acceptance criteria

- Scan invocation leaves no unexpected artifacts after completion or failure in tests.
- `ctx.cwd`-scoped restrictions are enforced and proven by regression tests.
- Cleanup behavior is documented in README + SECURITY and mirrored in tool results.
