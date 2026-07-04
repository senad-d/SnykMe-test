# Second-pass Pi extension review tasks

## Review scope and date
- Date: 2026-07-04
- Scope: Maintainability, logic correctness, and TypeScript hygiene pass after security-first review.

## Files / areas reviewed
- `src/utils/snyk-issues.ts`
- `src/commands/snykme-command.ts`
- `src/tools/snykme-get-issues-tool.ts`
- `src/extension.ts`
- `test/template.test.mjs`
- `scripts/check-format.mjs`
- `package.json` / CI workflows (`.github/workflows/*.yml`)

## Safe commands run and results
- `npm run typecheck` ✅
- `npm run test` ✅
- `npm run test:coverage` ✅
- `npm run check:format` ✅
- `npm run check:pack` ✅
- `npm run validate` ✅

## Findings summary by severity/category
### High
- **Type-safety/logical clarity risk:** `src/utils/snyk-issues.ts` uses several broad `unknown`/cast patterns (`UnknownRecord`, `isObject`, manual property assertions), which makes correctness boundaries hard to reason about and increases accidental behavior drift as SARIF schema handling expands.

### Medium
- **Maintainability and test-gap risk:** coverage report shows notable uncovered utility paths (`src/utils/snyk-issues.ts`), including warning branches and mixed-shape message extraction paths.
- **Dead surface risk:** `src/archive/*` and `src/commands/example-command.ts`/`src/tools/example-tool.ts` are compiled in `tsconfig` and published via `package.json` files; keeping obsolete modules in production package surface adds review noise and weakens future cleanup checks.

### Low
- **Validation pipeline risk:** validation in CI currently only runs formatting/package checks and does not include explicit lint/test/typecheck commands from package scripts.

## Blocked checks / areas not reviewed
- Runtime behavior for actual `snyk`/`jq` execution is deferred; no end-to-end scan command integration is present to validate here.
- Artifact lifecycle behavior (cleanup on failure/success) is not reviewable until implementation phase.

## Ordered tasks

- [ ] Introduce typed SARIF issue models to reduce implicit casts in summary logic

#### Why

The parser currently relies on broad unknown-object checks and repeated casting, making edge-case behavior difficult to audit and to extend safely. This increases the chance of subtle logic regressions when the planned Snyk/SARIF schema changes.

#### How to resolve

- Define explicit TypeScript interfaces/types for the expected SARIF issue fragment shape and optional sub-objects.
- Centralize extraction helpers with narrow return types (e.g., `extractSeverity`, `extractWhere`, `extractMessage`, `extractWhy`).
- Replace ad-hoc casts in `buildIssueRecord`/`extractWhere`/`extractWhat`/`extractWhy` with strict guard methods.

#### Acceptance criteria

- `summarizeSnykIssues` input/output contracts are preserved.
- `tsc --noEmit` passes without additional suppression comments.
- No unsafe casts are needed for core extraction paths in `src/utils/snyk-issues.ts`.

- [ ] Expand parser unit tests to cover all uncovered logic branches

#### Why

Coverage shows unexecuted branches in summary normalization and warning generation. Untested branches around message extraction and malformed record handling can hide real logic regressions when scan output evolves.

#### How to resolve

- Add focused tests in `test/template.test.mjs` for:
  - objects using `issue.message` as array vs object,
  - locations as object and empty location arrays,
  - malformed `cwe` payloads,
  - unsupported severity values mapped to `unknown` after the second-pass normalization decision.
- Assert deterministic `invalidCount` and warnings for each branch.

#### Acceptance criteria

- `npm run test` and `npm run test:coverage` show increased coverage for `src/utils/snyk-issues.ts` and include assertions for every prior dead branch.
- New tests fail under current behavior and pass after parser adjustments.

- [ ] Clean up non-active archive/example modules from the shipped extension footprint

#### Why

`src/archive/*` and example modules are currently retained for traceability but still included in TypeScript compilation and package file list; this increases package size and can confuse future reviewers about active behavior.

#### How to resolve

- Decide whether archive content should remain as documentation-only artifacts or be moved outside the distributable (`src/archive` -> docs or dedicated migration notes).
- If kept for reference, update `tsconfig.json` and/or `package.json.files` to prevent dead modules from entering the published package.
- Add or adjust tests/checks to explicitly allow-list only active modules (`extension`, `command`, `tool`, `utils`) for runtime review.

#### Acceptance criteria
- Package tarball no longer includes obsolete scaffold modules.
- Runtime/code-path review can focus only on active modules listed in `src/extension.ts` and related folders.
- CI/package checks fail if an inactive stub re-enters the shipped surface.

- [ ] Add maintainable validation pipeline checks to CI

#### Why

Current validate step in `.github/workflows/ci.yml` runs only `npm run validate` (format + packaging). This leaves lint and explicit unit coverage out of the default CI safety net and weakens regression confidence.

#### How to resolve

- Add explicit scripts for lint (if already desired) and include `npm run test` and `npm run typecheck` in validation workflow after `npm install`.
- Keep command output bounded and documents (`CONTRIBUTING.md`, `SECURITY.md`) aligned with the new gate.

#### Acceptance criteria
- CI gate runs formatting, package-content checks, type-check, and test suite.
- A failing test/typecheck blocks pull requests before merge.
- Validation workflow changes are documented and reviewed by maintainers.
