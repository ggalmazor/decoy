# Shared by deploy/merge.sh, deploy/release.sh, and deploy/next-version.sh. Source it; do not run it.
#
# Two things live here because every writer of main needs both: the lock that serialises them, and the
# version arithmetic. Several sessions may merge into the same local main at once (worktrees share one
# repository), and without a lock each of them would cut "the next version" from its own view of main.

SITE_URL="${SITE_URL:-https://decoy.ggalmazor.com}"

die() {
    echo "$*" >&2
    exit 1
}

# The checkout that has main checked out, if any.
main_worktree() {
    git worktree list --porcelain | awk '
        /^worktree / { path = substr($0, 10) }
        /^branch refs\/heads\/main$/ { print path; exit }'
}

# Merges and releases are built and verified in a worktree of their own, never in the checkout that has
# main. That checkout is where people and other sessions work; main only moves once a result is verified,
# by a fast-forward.
queue_worktree() {
    local common
    common="$(cd "$(git rev-parse --git-common-dir)" && pwd)"
    local dir="${MERGE_QUEUE_WORKTREE:-$(dirname "$(dirname "$common")")/worktrees/merge-queue}"
    if [[ ! -e "$dir/.git" ]]; then
        mkdir -p "$(dirname "$dir")"
        git worktree add --quiet --detach "$dir" main >&2
    fi
    echo "$dir"
}

# Put the queue worktree on the tip main should be built on: local main, with origin/main merged in when
# someone pushed without local main moving too.
start_from_main() {
    local dir="$1"
    git -C "$dir" fetch --quiet --tags origin
    git -C "$dir" merge --abort >/dev/null 2>&1 || true
    git -C "$dir" checkout --quiet --detach --force main
    git -C "$dir" clean --quiet -fd -e node_modules
    if git -C "$dir" rev-parse -q --verify origin/main >/dev/null && ! git -C "$dir" merge-base --is-ancestor origin/main HEAD; then
        git -C "$dir" merge --quiet --no-ff -m "Merge origin/main" origin/main >/dev/null \
            || die "main and origin/main conflict. Resolve that by hand, then run this again."
    fi
}

# Move main to a verified commit that already contains it. The checkout that has main is fast-forwarded,
# which git refuses when that would overwrite someone's uncommitted edits; origin already has the commit
# by then, so the next run's fetch picks it up either way.
advance_main() {
    local sha="$1" dir
    dir="$(main_worktree)"
    if [[ -n "$dir" ]]; then
        git -C "$dir" merge --quiet --ff-only "$sha" \
            || echo "==> Could not fast-forward the main checkout at ${dir} (local edits in the way); origin/main has ${sha:0:9}" >&2
    else
        git update-ref refs/heads/main "$sha"
    fi
}

# A directory is the lock because mkdir is atomic on every filesystem git runs on, and it lives in the
# common git dir so every worktree of this repository sees the same one. A holder that died leaves the
# directory behind, so a lock whose owner pid is gone from this host is taken over rather than waited on.
MAIN_LOCK_HELD=""

acquire_main_lock() {
    local what="$1"
    local timeout="${MAIN_LOCK_TIMEOUT:-3600}"
    local lock
    lock="$(git rev-parse --git-common-dir)/decoy-main.lock"
    lock="$(cd "$(dirname "$lock")" && pwd)/$(basename "$lock")"
    local waited=0
    while ! mkdir "$lock" 2>/dev/null; do
        local owner_pid owner_what
        owner_pid="$(sed -n 's/^pid=//p' "$lock/owner" 2>/dev/null || true)"
        owner_what="$(sed -n 's/^what=//p' "$lock/owner" 2>/dev/null || true)"
        if [[ -n "$owner_pid" ]] && ! kill -0 "$owner_pid" 2>/dev/null; then
            echo "==> Taking over the main lock from pid ${owner_pid} (${owner_what}), which is no longer running" >&2
            rm -rf "$lock"
            continue
        fi
        if (( waited >= timeout )); then
            die "Gave up after ${timeout}s waiting for the main lock, held by pid ${owner_pid:-?} (${owner_what:-?}). Remove ${lock} only if that process is gone."
        fi
        if (( waited % 60 == 0 )); then
            echo "==> main is busy: pid ${owner_pid:-?} is running ${owner_what:-?}; waiting" >&2
        fi
        sleep 5
        waited=$((waited + 5))
    done
    printf 'pid=%s\nwhat=%s\nsince=%s\n' "$$" "$what" "$(date -u +%FT%TZ)" > "$lock/owner"
    MAIN_LOCK_HELD="$lock"
    trap release_main_lock EXIT
}

release_main_lock() {
    if [[ -n "$MAIN_LOCK_HELD" ]]; then
        rm -rf "$MAIN_LOCK_HELD"
        MAIN_LOCK_HELD=""
    fi
}

declared_version() {
    node -p "require('${1:-.}/package.json').version"
}

# npm version would also create a commit and a tag; the release commit does both itself, with the changelog.
write_version() {
    local dir="$1" version="$2"
    (cd "$dir" && npm version --no-git-tag-version --allow-same-version "$version" >/dev/null)
}

newest_tag_version() {
    git -C "${1:-.}" tag -l 'v[0-9]*' --sort=-v:refname | head -1 | sed 's/^v//'
}

# The deployed site reports its version at /version.json. Empty when it cannot be reached, which only makes
# the count more cautious about nothing: the tags already carry every version that was ever released.
live_version() {
    curl -fsS --max-time 10 "${SITE_URL}/version.json" 2>/dev/null \
        | node -p "try { JSON.parse(require('fs').readFileSync(0,'utf8')).version } catch { '' }" 2>/dev/null || true
}

highest_version() {
    printf '%s\n' "$@" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1
}

bump_version() {
    local version="$1" field="$2" major minor patch
    IFS='.' read -r major minor patch <<< "$version"
    case "$field" in
        major) echo "$((major + 1)).0.0" ;;
        minor) echo "${major}.$((minor + 1)).0" ;;
        patch) echo "${major}.${minor}.$((patch + 1))" ;;
        *) die "Unknown bump: ${field}" ;;
    esac
}

pending_fragments() {
    local dir="${1:-.}"
    find "${dir}/changelog.d" -maxdepth 1 -type f -name '*.md' ! -name 'README.md' 2>/dev/null | sort
}

# PATCH only when every pending fragment is fixes alone; anything added, changed, or removed is a MINOR.
bump_kind_for_fragments() {
    local dir="${1:-.}" f
    local fragments
    fragments="$(pending_fragments "$dir")"
    [[ -z "$fragments" ]] && { echo patch; return; }
    while IFS= read -r f; do
        if grep -qE '^### (Added|Changed|Removed)' "$f"; then
            echo minor
            return
        fi
    done <<< "$fragments"
    echo patch
}

# The github-pages environment that Pages creates admits deployments from main only, so a v<version> tag
# is turned away before the deploy job runs a single step, and with no log to say why. Checked before
# anything is tagged, so a release that could not deploy is never published. Needs gh and read access;
# when either is missing, or the environment does not exist yet, there is nothing to check against.
check_tag_can_deploy() {
    local tag="$1" repo policies custom
    command -v gh >/dev/null 2>&1 || return 0
    repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)" || return 0
    custom="$(gh api "repos/${repo}/environments/github-pages" --jq '.deployment_branch_policy.custom_branch_policies // false' 2>/dev/null)" || return 0
    [[ "$custom" == "true" ]] || return 0
    policies="$(gh api "repos/${repo}/environments/github-pages/deployment-branch-policies" --jq '.branch_policies[] | select(.type == "tag") | .name' 2>/dev/null)" || return 0
    local pattern
    while IFS= read -r pattern; do
        # shellcheck disable=SC2053
        [[ -n "$pattern" && "$tag" == $pattern ]] && return 0
    done <<< "$policies"
    die "The github-pages environment of ${repo} does not allow the tag ${tag} to deploy. Add a tag rule, once, with an admin account:
    gh api -X POST repos/${repo}/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag
or in Settings > Environments > github-pages > Deployment branches and tags. Nothing was published."
}
