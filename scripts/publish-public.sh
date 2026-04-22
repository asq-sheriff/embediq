#!/usr/bin/env bash
# publish-public.sh — publish the sanitized tree to the public embediq repo.
#
# Workflow:
#   1. Runs `npm run sanitize-public` to produce the sanitized tree.
#   2. Clones the public remote to a scratch directory.
#   3. Rsyncs the sanitized tree over the clone with --delete-after, which
#      naturally removes legacy files (CLAUDE.md, .claude/, stale docs)
#      that have since been retired from public.
#   4. Commits with the user-supplied release-cadence message.
#      No `Co-Authored-By` trailer is added — the private repo keeps the
#      granular per-PR history with Claude attribution; the public repo's
#      log reads as clean release notes.
#   5. Leaves the push as a manual step unless --push is given.
#
# Usage:
#   scripts/publish-public.sh --message "EmbedIQ v3.2.0 — <summary>"
#   scripts/publish-public.sh --message-file /tmp/release-notes.txt
#   scripts/publish-public.sh --message "..." --push       # auto-push after commit
#   scripts/publish-public.sh --message "..." --dry-run    # no commit, no push
#
# Environment:
#   EMBEDIQ_PUBLIC_REMOTE  Override the public remote URL
#                          (default: git@github.com:asq-sheriff/embediq.git)
#   EMBEDIQ_PUBLIC_BRANCH  Override the public default branch
#                          (default: main)

set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────

PUBLIC_REMOTE="${EMBEDIQ_PUBLIC_REMOTE:-git@github.com:asq-sheriff/embediq.git}"
PUBLIC_BRANCH="${EMBEDIQ_PUBLIC_BRANCH:-main}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── Args ─────────────────────────────────────────────────────────────────

MESSAGE=""
MESSAGE_FILE=""
PUSH=0
DRY_RUN=0

usage() {
  sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while (( $# )); do
  case "$1" in
    --message) MESSAGE="$2"; shift 2 ;;
    --message-file) MESSAGE_FILE="$2"; shift 2 ;;
    --push) PUSH=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown flag: $1" >&2; usage 2 ;;
  esac
done

if [[ -z "$MESSAGE" && -z "$MESSAGE_FILE" && "$DRY_RUN" -eq 0 ]]; then
  echo "error: --message or --message-file is required (unless --dry-run)" >&2
  usage 2
fi

if [[ -n "$MESSAGE" && -n "$MESSAGE_FILE" ]]; then
  echo "error: pass either --message or --message-file, not both" >&2
  exit 2
fi

if [[ -n "$MESSAGE_FILE" && ! -f "$MESSAGE_FILE" ]]; then
  echo "error: message file not found: $MESSAGE_FILE" >&2
  exit 2
fi

# ─── Preconditions ────────────────────────────────────────────────────────

cd "$REPO_ROOT"

if ! git diff --quiet HEAD 2>/dev/null; then
  echo "error: private working tree has uncommitted changes. Commit or stash first." >&2
  exit 2
fi

command -v rsync >/dev/null || { echo "error: rsync is required" >&2; exit 2; }

# ─── Stage 1 — sanitize ───────────────────────────────────────────────────

STAGING_DIR="$(mktemp -d -t embediq-public-staging.XXXXXX)"
CLONE_DIR="$(mktemp -d -t embediq-public-clone.XXXXXX)"

cleanup() {
  local status=$?
  rm -rf "$STAGING_DIR"
  if [[ "$status" -ne 0 || ( "$DRY_RUN" -eq 1 && "$PUSH" -eq 0 ) ]]; then
    rm -rf "$CLONE_DIR"
  else
    # Preserve the clone for post-commit review when we succeeded.
    echo ""
    echo "Clone with the commit is at: $CLONE_DIR"
  fi
}
trap cleanup EXIT

echo "▶ Running sanitize-public → $STAGING_DIR"
npm run --silent sanitize-public -- --out "$STAGING_DIR" --no-color

# ─── Stage 2 — clone public ───────────────────────────────────────────────

echo ""
echo "▶ Cloning $PUBLIC_REMOTE ($PUBLIC_BRANCH) → $CLONE_DIR"
git clone --branch "$PUBLIC_BRANCH" --single-branch "$PUBLIC_REMOTE" "$CLONE_DIR" >/dev/null 2>&1

# ─── Stage 3 — overlay ────────────────────────────────────────────────────

echo "▶ Overlaying sanitized tree (rsync --delete-after, excluding .git)"
# Trailing slashes on both sides are intentional (copy contents, not directory).
# --exclude='/.git' preserves the clone's git metadata.
rsync -a --delete-after --exclude='/.git' "$STAGING_DIR/" "$CLONE_DIR/"

cd "$CLONE_DIR"

STATUS_OUTPUT="$(git status --short)"
if [[ -z "$STATUS_OUTPUT" ]]; then
  echo ""
  echo "✓ No changes between current public/$PUBLIC_BRANCH and sanitized tree."
  exit 0
fi

echo ""
echo "▶ Changes to publish:"
git status --short | sed 's/^/    /'

# ─── Stage 4 — dry-run or commit ──────────────────────────────────────────

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo ""
  echo "⊘ Dry-run — no commit, no push. Staging dir preserved at $CLONE_DIR"
  trap - EXIT
  rm -rf "$STAGING_DIR"
  echo "    (run without --dry-run to commit; pass --push to also push)"
  exit 0
fi

git add -A

if [[ -n "$MESSAGE_FILE" ]]; then
  git commit --quiet --file="$MESSAGE_FILE"
else
  git commit --quiet -m "$MESSAGE"
fi

COMMIT_SHA="$(git rev-parse HEAD)"
echo ""
echo "✓ Committed $COMMIT_SHA on $PUBLIC_BRANCH"

# ─── Stage 5 — push (optional) ────────────────────────────────────────────

if [[ "$PUSH" -eq 1 ]]; then
  echo ""
  echo "▶ Pushing $COMMIT_SHA → $PUBLIC_REMOTE $PUBLIC_BRANCH"
  git push origin "$PUBLIC_BRANCH"
  echo "✓ Pushed."
else
  echo ""
  echo "ℹ Review the commit, then push manually:"
  echo "    cd $CLONE_DIR"
  echo "    git show --stat"
  echo "    git push origin $PUBLIC_BRANCH"
  echo ""
  echo "  Or re-run this script with --push to auto-push next time."
fi
