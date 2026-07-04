# SnykMe

SnykMe is a Pi extension scaffold for summarizing Snyk Code scan findings from the current repository into compact records that are easy for LLM workflows to consume.

## Package

- **Package:** `@senad-d/snykme`
- **Repository:** `https://github.com/senad-d/SnykMe`

## Surfaces

### Command

- **Slash command:** `/snykme`
- **Current behavior (preparation phase):** registers the command and returns a placeholder message that implementation is deferred.
- **Planned behavior:** run `snyk code test` in `ctx.cwd`, normalize findings, and return grouped summary output.

### Tool

- **Tool name:** `snykme_get_issues`
- **Registration state:** prepared and discoverable, currently returns a deterministic deferred placeholder.
- **Planned parameters:**
  - `includeRaw` (`boolean`, optional)
  - `limit` (`number`, optional, min `1`, max `200`)

## Planned output contract

Each finding is normalized to:

- `severity`
- `where`
- `what`
- `why`
- `cwe`

## Prerequisites

Snyk setup is required before this extension can function in a later implementation session:

- Install `snyk` CLI and ensure it is on `PATH`.
- Run `snyk auth` (or equivalent account login) manually.
- Install `jq` (planned for SARIF transformation).

The extension does **not** handle tokens or credentials directly.

## Planned command flow (reference)

```bash
snyk code test . --sarif > snyk-code.sarif
jq '<normalize>' snyk-code.sarif > snyk-code-clean.json
```

## Validation plan

- `npm run typecheck`
- `npm run test`
- `npm run test:coverage`
- `npm run check:pack`
- `npm run validate`
- `pi --no-extensions -e .`

## Status

This repository is currently in a preparation phase. No scan execution or artifact mutation is implemented yet.

## License

MIT
