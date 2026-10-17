#!/usr/bin/env bash
# Cut a version from main and push its tag, which is what deploys the site.
#
#   deploy/release.sh                    # bump guessed from the changelog fragments; wait for the deploy
#   deploy/release.sh --minor|--patch|--major
#   deploy/release.sh --no-wait          # do not wait for the Deploy workflow
#   deploy/release.sh --allow-empty      # release even with no fragment (records "internal changes only")
#
# This is the ONLY step that chooses a version. Branches and merges never touch the version in package.json
# or CHANGELOG.md: they add a changelog.d fragment. Here, under the lock every writer of main takes, the
# fragments are folded into CHANGELOG.md, the version is written, and a "Release X.Y.Z" commit and its
# v<X.Y.Z> tag are pushed together. Whatever worktree runs it, the work happens in the merge-queue worktree
# on main's tip after syncing with origin, so the number can only be computed against the real tip.
#
# The v<version> tag triggers .github/workflows/deploy.yml, which builds the site, publishes it to GitHub
# Pages, and checks that https://decoy.ggalmazor.com/version.json reports the new version.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=deploy/lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

WAIT="yes"
ALLOW_EMPTY="no"
FIELD_ARG=""
for arg in "$@"; do
    case "$arg" in
        --no-wait) WAIT="no" ;;
        --allow-empty) ALLOW_EMPTY="yes" ;;
        --patch|--minor|--major) FIELD_ARG="$arg" ;;
        *) die "Unknown argument: $arg" ;;
    esac
done

acquire_main_lock "release"
QUEUE="$(queue_worktree)"
cd "$QUEUE"

for attempt in 1 2 3; do
    start_from_main "$QUEUE"

    NEWEST_TAG="$(newest_tag_version .)"
    if [[ -n "$NEWEST_TAG" ]] && [[ "$(git rev-parse HEAD)" == "$(git rev-parse "v${NEWEST_TAG}^{commit}" 2>/dev/null)" ]]; then
        echo "==> main is already released as v${NEWEST_TAG}; nothing to do"
        exit 0
    fi

    FRAGMENTS=()
    while IFS= read -r f; do [[ -n "$f" ]] && FRAGMENTS+=("$f"); done < <(
        # Merge order, so the changelog reads in the order the work landed.
        for f in $(pending_fragments .); do
            ADDED_IN="$(git log --first-parent --diff-merges=first-parent --diff-filter=A --no-patch --format=%H -1 -- "$f" 2>/dev/null)"
            printf '%s %s\n' "$( [[ -n "$ADDED_IN" ]] && git rev-list --count --first-parent "$ADDED_IN" || echo 999999)" "$f"
        done | sort -n | cut -d' ' -f2-)

    UNRELEASED="$(awk '/^## \[Unreleased\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md | grep -v '^[[:space:]]*$' || true)"
    if (( ${#FRAGMENTS[@]} == 0 )) && [[ -z "$UNRELEASED" ]]; then
        [[ "$ALLOW_EMPTY" == "yes" ]] || die "No changelog.d fragment and nothing under [Unreleased]. Pass --allow-empty to release internal changes anyway."
        EMPTY_NOTE="$(mktemp)"
        printf '### Changed\n- Internal changes only; nothing a user can see.\n' > "$EMPTY_NOTE"
        FRAGMENTS+=("$EMPTY_NOTE")
    fi

    # shellcheck disable=SC2086
    VERSION="$(NEXT_VERSION_DIR="$QUEUE" "${REPO_ROOT}/deploy/next-version.sh" $FIELD_ARG)"
    TAG="v${VERSION}"
    git ls-remote --exit-code --tags origin "${TAG}" >/dev/null 2>&1 && die "${TAG} already exists on origin; the tags and package.json disagree. Look before retrying."

    echo "==> Cutting ${VERSION} from $(git rev-parse --short HEAD), folding ${#FRAGMENTS[@]} fragment(s)"
    python3 "${REPO_ROOT}/deploy/fold-changelog.py" "$VERSION" "${FRAGMENTS[@]}"
    write_version . "$VERSION"
    for f in "${FRAGMENTS[@]}"; do
        [[ "$f" == changelog.d/* || "$f" == ./changelog.d/* ]] && git rm --quiet "$f"
    done
    git add CHANGELOG.md package.json package-lock.json
    git commit --quiet -m "Release ${VERSION}"
    git tag -a "${TAG}" -m "Release ${VERSION}"

    # --atomic so main and the tag land together or not at all. If origin moved underneath, the release is
    # rebuilt on the new tip rather than forced over it.
    if git push --quiet --atomic origin "HEAD:refs/heads/main" "${TAG}"; then
        break
    fi
    git tag -d "${TAG}" >/dev/null
    git fetch --quiet origin || die "Pushing main and ${TAG} failed and origin is unreachable. Nothing was published."
    git merge-base --is-ancestor origin/main "HEAD~1" \
        && die "Pushing main and ${TAG} was refused although origin/main has not moved; check access to origin (SSH agent?). Nothing was published."
    (( attempt < 3 )) || die "Pushing main and ${TAG} failed 3 times. Nothing was published; check access to origin."
    echo "==> Push refused (origin/main moved?); rebuilding the release on its tip" >&2
done

advance_main "$(git rev-parse HEAD)"
release_main_lock

if [[ "$WAIT" == "yes" ]] && command -v gh >/dev/null 2>&1; then
    echo "==> Waiting for the Deploy workflow"
    # Selected by the tag it was triggered from, not by being the newest run: a re-run, or a second
    # release started around the same time, would otherwise be the one watched.
    RUN_ID=""
    for _ in $(seq 1 20); do
        RUN_ID="$(gh run list --workflow Deploy --branch "$TAG" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
        [[ -n "$RUN_ID" ]] && break
        sleep 3
    done
    [[ -n "$RUN_ID" ]] || die "No Deploy run appeared for ${TAG} within a minute. Check the Actions tab."
    gh run watch "$RUN_ID" --exit-status --interval 15 >/dev/null
    echo "==> ${SITE_URL} is serving ${VERSION}"
else
    echo "==> Tagged ${TAG}; the Deploy workflow will publish it to ${SITE_URL}"
fi
