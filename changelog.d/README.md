# Changelog fragments

A branch never edits `CHANGELOG.md` or the `version` in `package.json`. It adds one file here instead, and `deploy/release.sh` folds every pending file into `CHANGELOG.md` under the version it cuts, then deletes them.

This is what lets several branches merge in any order without colliding. Two branches that both edit the top of `CHANGELOG.md`, or both move the version, conflict on every merge, and each merger picking "the next version" from its own view of `main` hands out the same number twice. A new file per branch cannot conflict with anything.

## Writing one

Name it after the branch or issue, for example `42-clipboard-export.md`, so two branches never pick the same name. Use the `CHANGELOG.md` sections, and only the ones that apply:

```markdown
### Added

- ...

### Changed

- ...

### Fixed

- ...

### Removed

- ...
```

Describe the user-visible effect, not the implementation. A change nobody outside the code can notice (a refactor, a test, a doc) needs no fragment.

## How the version is chosen

`deploy/release.sh` cuts a PATCH when every pending fragment has only a `### Fixed` section, and a MINOR otherwise, counting up from the highest of `package.json`, the newest `v*` tag, and the version the live site reports at `/version.json`. `--minor` and `--patch` override the guess, and MAJOR is always explicit (`--major`).

This file is not a fragment and is never folded.
