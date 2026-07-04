# Contributing

Thank you for helping improve SnykMe.

## Development setup

This project targets Node.js `>=22.19.0`.

Recommended local steps:

```bash
npm install
npm test
```

## Scope of this repository

- Keep `src/extension.ts` as a minimal bootstrap that only wires registrations.
- Keep `/snykme` and `snykme_get_issues` registrations in `src/commands` and `src/tools`.
- Keep runtime scan logic in future implementation tasks; this phase remains a scaffold.
- Keep `docs/` and `README.md` aligned with the planned SnykMe behavior.

## Security notes

Snyk integration is security-sensitive. If adding scan execution:

- keep calls scoped to the active repository (`ctx.cwd`),
- keep errors explicit for missing CLI/authentication,
- avoid secret handling in extension code.

## Documentation hygiene

Update:

- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`

whenever contracts or user-facing behavior changes.

## Validation plan

- `npm install`
- `npm run validate` (format checks, package surface checks, type-check, unit tests)
- `npm run test:coverage`
- `pi --no-extensions -e .`

## Cleanup

Avoid committing local runtime artifacts (e.g., generated `.sarif` files or JSON artifacts).
