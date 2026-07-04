# Changelog

## 0.1.2 - Hardened summary helper and command/tool contract scaffolding

- Implemented `summarizeSnykIssues` as a pure, deterministic SARIF issue summarizer with severity normalization, invalid-shape warnings, and deterministic output buckets.
- Archived legacy template placeholders (`example-command`, `example-tool`, `format`, `lifecycle`) in `src/archive` and marked originals as intentionally non-active.
- Expanded `test/template.test.mjs` to assert command completion/handler contracts, tool schema constraints, prepared-mode execution payload shape, and summarizer behavior for valid/malformed inputs.

## 0.1.1 - SnykMe documentation and scaffold hardening

- Replaced remaining template-oriented docs with SnykMe-specific structure and contribution guidance.
- Finalized command `/snykme` and tool `snykme_get_issues` skeleton contracts in docs.
- Reworked root instructions (`AGENTS.md`) to reflect SnykMe scope and preparation-only behavior.

## 0.1.0 - SnykMe scaffold

- Renamed template project metadata to SnykMe.
- Added command surface planning for `/snykme` and tool surface `snykme_get_issues`.
- Prepared non-functional scaffold modules and updated documentation for Snyk setup expectations.
