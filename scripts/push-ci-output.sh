#!/usr/bin/env bash
# Publishes CI logs/screenshots to an orphan branch (ci-output/<name>) so they
# can be read with plain git, without needing access to Actions artifact storage.
# Usage: push-ci-output.sh <branch-suffix> <dir-or-file>...
set -euo pipefail
NAME="$1"; shift
BRANCH="ci-output/${NAME}"
WORK="$(mktemp -d)"
for item in "$@"; do
  if [ -e "$item" ]; then cp -r "$item" "$WORK/"; fi
done
cat > "$WORK/README.md" <<EOF
CI output for commit ${GITHUB_SHA:-unknown}, run ${GITHUB_RUN_ID:-?} attempt ${GITHUB_RUN_ATTEMPT:-?}
Workflow: ${GITHUB_WORKFLOW:-?}, job: ${GITHUB_JOB:-?}
EOF
cd "$WORK"
git init -q
git checkout -q -b "$BRANCH"
git add -A
git -c user.name="tracker-pro-ci" -c user.email="ci@users.noreply.github.com" commit -qm "CI output: ${NAME} @ ${GITHUB_SHA:-unknown}"
git push -qf "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "HEAD:refs/heads/${BRANCH}"
echo "Pushed CI output to ${BRANCH}"
