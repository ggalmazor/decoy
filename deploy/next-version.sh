#!/usr/bin/env bash
# Print the version the next release will get.
#
#   deploy/next-version.sh             # guess the bump from the pending changelog fragments
#   deploy/next-version.sh --patch     # force a patch
#   deploy/next-version.sh --minor     # force a minor
#   deploy/next-version.sh --major     # force a major
#
# Nothing but deploy/release.sh writes the result. It counts up from the highest of package.json, the
# newest v* tag, and the version the live site reports at /version.json, so a number that any branch,
# release, or hot fix has already used is never handed out again.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=deploy/lib.sh
source "${REPO_ROOT}/deploy/lib.sh"
cd "${NEXT_VERSION_DIR:-$REPO_ROOT}"

FIELD=""
for arg in "$@"; do
    case "$arg" in
        --patch) FIELD="patch" ;;
        --minor) FIELD="minor" ;;
        --major) FIELD="major" ;;
        *) die "Unknown argument: $arg" ;;
    esac
done
[[ -z "$FIELD" ]] && FIELD="$(bump_kind_for_fragments .)"

DECLARED="$(declared_version .)"
[[ -n "$DECLARED" ]] || die "Could not read version from package.json."
TAGGED="$(newest_tag_version .)"
LIVE="$(live_version)"
HIGHEST="$(highest_version "$DECLARED" "$TAGGED" "$LIVE")"

echo "==> declared ${DECLARED}, newest tag ${TAGGED:-none}, live ${LIVE:-unreachable}; ${FIELD} bump" >&2
bump_version "$HIGHEST" "$FIELD"
