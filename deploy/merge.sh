#!/usr/bin/env bash
# Merge a finished branch into main, verify it, and push main.
#
#   deploy/merge.sh <branch>               # merge, run lint + typecheck + unit + build + e2e, push
#   deploy/merge.sh <branch> --quick       # lint, typecheck, and unit tests only, for a branch already proven green
#   deploy/merge.sh <branch> --no-push     # leave main local (push later, or let release.sh push it)
#
# Safe to run from several sessions at once: every merge and release takes the same lock, so they queue
# instead of racing, and each one merges onto the tip the previous one left. The merge is built and tested
# in a merge-queue worktree, never in the checkout that has main, and main only fast-forwards to a verified
# result. It never chooses a version: a branch carries its changelog entry as a changelog.d fragment, and
# deploy/release.sh cuts the version.
#
# A branch that bumped the version in package.json anyway is still merged: its version is dropped in
# favour of main's, because only a release moves it.
#
# When verification fails, main never moved, and the script exits non-zero.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=deploy/lib.sh
source "${REPO_ROOT}/deploy/lib.sh"

BRANCH=""
VERIFY="full"
PUSH="yes"
for arg in "$@"; do
    case "$arg" in
        --quick) VERIFY="quick" ;;
        --no-push) PUSH="no" ;;
        -*) die "Unknown argument: $arg" ;;
        *) [[ -z "$BRANCH" ]] || die "One branch at a time."; BRANCH="$arg" ;;
    esac
done
[[ -n "$BRANCH" ]] || die "usage: deploy/merge.sh <branch> [--quick] [--no-push]"
git rev-parse -q --verify "refs/heads/${BRANCH}" >/dev/null || die "No local branch ${BRANCH}."

acquire_main_lock "merge ${BRANCH}"
QUEUE="$(queue_worktree)"
cd "$QUEUE"

for attempt in 1 2 3; do
    start_from_main "$QUEUE"
    if git merge-base --is-ancestor "$BRANCH" HEAD; then
        echo "==> ${BRANCH} is already in main; nothing to merge"
        exit 0
    fi

    BASE="$(git rev-parse HEAD)"
    MAIN_VERSION="$(declared_version .)"

    echo "==> Merging ${BRANCH} onto main at $(git rev-parse --short "$BASE") in ${QUEUE}"
    git merge --no-ff --no-commit "$BRANCH" >/dev/null 2>&1 || true
    git rev-parse -q --verify MERGE_HEAD >/dev/null || die "git could not start the merge of ${BRANCH}."

    if [[ -n "$(git diff --name-only --diff-filter=U -- package.json package-lock.json)" ]]; then
        # Only a conflict on the version line is resolved here, by keeping main's. Anything else in
        # package.json is a real conflict and stops the merge.
        git checkout --quiet --ours -- package.json package-lock.json 2>/dev/null || true
        git add package.json package-lock.json 2>/dev/null || true
        if ! git diff --quiet "$BASE" -- package.json; then
            git merge --abort
            die "package.json conflicts beyond the version line. Merge main into ${BRANCH}, resolve there, and run this again."
        fi
    fi
    if [[ "$(declared_version .)" != "$MAIN_VERSION" ]]; then
        write_version . "$MAIN_VERSION"
        echo "==> Kept main's version ${MAIN_VERSION}; ${BRANCH} had moved it, and only a release does that"
    fi
    git add package.json package-lock.json

    UNRESOLVED="$(git diff --name-only --diff-filter=U)"
    if [[ -n "$UNRESOLVED" ]]; then
        git merge --abort
        die "$(printf 'Merging %s conflicts in:\n%s\nMerge main into the branch, resolve there, and run this again. main did not move.' "$BRANCH" "$UNRESOLVED")"
    fi

    git commit --quiet --no-edit -m "Merge ${BRANCH}"
    MERGED="$(git rev-parse HEAD)"

    echo "==> Verifying ($VERIFY)"
    npm ci --silent --no-audit --no-fund || die "npm ci failed with ${BRANCH} merged. main did not move."
    npm run --silent lint && npm run --silent typecheck && npm run --silent test \
        || die "${BRANCH} fails lint, typecheck, or the unit tests on top of main. main did not move."
    if [[ "$VERIFY" == "full" ]]; then
        npm run --silent build && npx playwright install chromium >/dev/null && npm run --silent test:e2e \
            || die "The build or the e2e suite fails with ${BRANCH} merged. main did not move; the failed merge is ${MERGED:0:9} in ${QUEUE}."
    fi

    if [[ "$PUSH" == "no" ]]; then
        break
    fi
    if git push --quiet origin "${MERGED}:refs/heads/main"; then
        break
    fi
    # A refused push is only a race when origin/main really moved; otherwise it is access (a locked SSH
    # agent, say), and re-running the whole suite would not help.
    git fetch --quiet origin || die "Pushing main failed and origin is unreachable. main did not move; the verified merge is ${MERGED:0:9} in ${QUEUE}."
    git merge-base --is-ancestor origin/main "$BASE" \
        && die "Pushing main was refused although origin/main has not moved; check access to origin (SSH agent?). main did not move; the verified merge is ${MERGED:0:9} in ${QUEUE}."
    (( attempt < 3 )) || die "Pushing main failed 3 times. main did not move."
    echo "==> origin/main moved while verifying; merging again on its tip" >&2
done

advance_main "$MERGED"
echo "==> Merged ${BRANCH} as $(git rev-parse --short "$MERGED")"
