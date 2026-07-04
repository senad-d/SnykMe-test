# Task Specification: SnykMe

### 1. Apply SnykMe project identity in package manifest
- [x] Update `package.json` identity and metadata for the SnykMe project (package name, description, repo links, bug tracker, homepage, keywords, and extension image URL), and remove template placeholders.

Project metadata should describe a single-purpose Snyk summary extension and match the requested package name.

#### Acceptance criteria
- `package.json` contains `name: "@senad-d/snykme"`.
- `repository`, `bugs`, and `homepage` fields point to `https://github.com/senad-d/SnykMe`.
- No placeholder tokens like `<PROJECT_NAME>` remain in package metadata.

### 2. Replace template constants and function identifiers
- [x] Update `src/constants.ts` with the display name `SnykMe` and a unique status key.
- [x] Rename exported extension factory function in `src/extension.ts` and wire it to SnykMe registration modules.

Use meaningful naming that matches the extension identity.

#### Acceptance criteria
- `src/constants.ts` contains `EXTENSION_DISPLAY_NAME = "SnykMe"`.
- `src/extension.ts` imports only registration modules for SnykMe (`registerSnykMe*`).
- No template identifiers (`template-hello`, `template_greet`, `pi-extension-template`) remain in source constants.

### 3. Add command registration module skeleton
- [x] Create or replace `src/commands/snykme-command.ts` with a non-functional placeholder command registration for `/snykme`.

The command should describe intended behavior but avoid running shell tools in this preparation phase.

#### Acceptance criteria
- Command name is `/snykme` in a single registration call.
- Handler currently uses a clear placeholder response indicating implementation is pending.
- No direct call to `snyk` or `jq` is executed in this preparation pass.

### 4. Add tool registration module skeleton
- [x] Create or replace `src/tools/snykme-get-issues-tool.ts` with a `snykme_get_issues` registration stub using TypeBox schema.

The tool must include clear prompt snippet and guideline text and return a deterministic placeholder result.

#### Acceptance criteria
- Tool name is exactly `snykme_get_issues`.
- Tool includes schema, `promptSnippet`, and `promptGuidelines` fields.
- Tool returns a non-operational placeholder payload with explicit message that implementation is deferred.

### 5. Refresh template source files to SnykMe content
- [x] Update `README.md` with concrete SnykMe description, command usage, and tool contract.
- [x] Update `CHANGELOG.md`, `SECURITY.md`, and `CONTRIBUTING.md` with SnykMe-specific content.
- [x] Replace remaining template-oriented structure text in `docs/STRUCTURE.md` and `AGENTS.md` references to match SnykMe scope.

#### Acceptance criteria
- README no longer contains template placeholder instructions or `{{PLACEHOLDER}}` text.
- SECURITY explicitly states that Snyk authentication is a manual prerequisite.
- Changelog includes at least one SnykMe-specific entry.

### 6. Update tests for project identity and registration
- [x] Replace `test/template.test.mjs` template-specific assertions with SnykMe-specific checks for package name, extension entry, command/tool registration expectation, and placeholder removal in docs.

Tests should validate preparation-level readiness and avoid requiring implemented scan behavior.

#### Acceptance criteria
- Tests pass conceptually against SnykMe metadata and file names.
- No assertion depends on removed template metadata like `pi-extension-template` suffix.

### 7. Keep extension non-functional in preparation and document handoff
- [x] Ensure no planned scanning command is implemented yet and behavior remains clearly marked as scaffold/stub.
- [x] Confirm `src/extension.ts` remains small with only module wiring.
- [x] Add `docs/project-definition-brief.md` as the source-of-truth handoff doc.

#### Acceptance criteria
- Running `pi --no-extensions -e .` should execute without feature runtime actions.
- `spec-` files include architecture, guidelines, and task specs only.
- A new session can continue directly from `docs/project-definition-brief.md` plus the three spec files.
