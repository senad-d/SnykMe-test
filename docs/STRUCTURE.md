# SnykMe Structure

## Project layout

```text
src/
├── extension.ts               # bootstrap only; imports and registers feature modules
├── constants.ts               # shared extension identifiers
├── commands/
│   └── snykme-command.ts      # /snykme command registration
├── tools/
│   └── snykme-get-issues-tool.ts # snykme_get_issues tool registration
├── utils/
│   └── snyk-issues.ts         # planned summary transformation helpers
├── events/                    # optional status hooks (`session_start`, `session_shutdown`)
└── ...                        # additional feature modules in future sessions

docs/
├── STRUCTURE.md
├── project-definition-brief.md
└── ...

test/
└── (tests)                   # preparation metadata and contract checks (including package, command, and tool registration)
```

## Design rules for SnykMe

- `src/extension.ts` should stay small and only wire modules.
- Keep command/tool behavior separated by purpose.
- Keep runtime execution out of this preparation pass.
- No background watchers, sockets, or long-lived processes in factory/command registration.

## Planned data flow (implementation session)

1. `/snykme` or `snykme_get_issues` starts scan for current `ctx.cwd`.
2. Generate `snyk-code.sarif` and `snyk-code-clean.json`.
3. Return summary records with `severity`, `where`, `what`, `why`, and `cwe`.

## Reference files

- `package.json` and `README.md` for published identity and user-facing docs.
- `SECURITY.md` and `CONTRIBUTING.md` for governance.
- `specs/spec-*.md` for architecture/guidelines/task sources.
