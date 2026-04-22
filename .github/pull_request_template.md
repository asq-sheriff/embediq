<!-- audience: public -->

## Summary

<!-- One to three sentences on *why* this change is being made. The CHANGELOG line is a good seed. -->

## Subsystem

<!-- Tag the affected area, e.g. [6E autopilot], [6H git], [docs], [infra]. -->

## Changes

<!-- Brief bullet list of what changed. Link to related issues. -->

## Testing

- [ ] `make check` passes locally (type-check + full test suite)
- [ ] New or changed behavior has a test
- [ ] Goldens regenerated (if generator output intentionally changed)

## Docs checklist

The PR must update every applicable row. Mark `N/A` if none apply.

- [ ] **New env var** → `docs/reference/configuration.md` updated
- [ ] **New HTTP route** → `docs/reference/rest-api.md` updated
- [ ] **New CLI flag or script** → `docs/reference/cli-reference.md` updated
- [ ] **New generator or output file** → `docs/reference/generated-files.md` updated
- [ ] **New user-visible feature** → `docs/user-guide/` module added or updated
- [ ] **Release-shipping change** → `CHANGELOG.md` `## [Unreleased]` entry added
- [ ] **New markdown file** → audience frontmatter present (`<!-- audience: public | private -->`)

## Compatibility

- [ ] No breaking API/CLI changes, or breaking changes are called out above
- [ ] Existing goldens still pass byte-for-byte (confirm via `make check` + `npx tsx scripts/regenerate-golden-configs.ts`)

## Notes for reviewers

<!-- Anything a reviewer should prioritize: tricky edge cases, perf concerns, security implications, migration notes. -->
