# Security Policy

## Trust model

SnykMe is a Pi extension package. Pi extension code runs with local user privileges in the current process.

This preparation pass does not implement Snyk execution or report submission.

## Mandatory manual prerequisites

Snyk authentication and setup are **required outside this extension** before any scan can run:

- Install and authenticate `snyk` CLI manually (`snyk auth`).
- Ensure `snyk` is available on `PATH`.
- Install `jq` for planned SARIF normalization.

The extension never stores or asks for Snyk tokens and does not read secrets from local config files.

## Reporting vulnerabilities

Please report suspected security vulnerabilities privately by email:

- <senad.dizdarevic@proton.me>

For non-sensitive issues:

- <https://github.com/senad-d/SnykMe/issues>

Do not include secrets, credentials, or private repository details.

## Development security checklist

- This project currently contains only command/tool registration scaffolding.
- Planned scan paths and artifacts are scoped to the current repository path.
- No background jobs or persistent extension processes are added in preparation.
- Planned runtime artifacts (`snyk-code.sarif`, `snyk-code-clean.json`) should be treated as local temporary outputs and cleaned up in implementation sessions.

## Validation and quality checks

- `npm run validate` performs formatting checks, package surface validation, TypeScript type-checking, and unit tests.
- Keep `npm run check:pack` as the explicit packaging smoke step when release artifacts are assessed.
