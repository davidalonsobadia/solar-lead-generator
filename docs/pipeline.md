# Automated Agent Pipeline

This document describes the full automated pipeline that takes a GitHub issue from
creation to a merged PR — and then advances to the next issue — without human
intervention in the happy path.

---

## Overview

```
Human: merge PR #2 (one-time kick-off)
              │
              ▼
   ┌─────────────────────┐
   │   advance-queue     │  fires on every claude/issue-* merge
   │   (agent-advance-   │  finds next open issue → adds `auto` label
   │    queue.yml)       │
   └──────────┬──────────┘
              │ `auto` label added to issue #N
              ▼
   ┌─────────────────────┐
   │    Implementer      │  reads issue + all comments (incl. failure context)
   │  (agent-implement   │  writes code + tests, runs checks on runner
   │   .yml / Opus)      │  opens PR → arms auto-merge
   └──────────┬──────────┘
              │ PR opened on branch claude/issue-N
              ▼
   ┌──────────────────────────────────────┐
   │  CI                  Agent - Review  │  run in parallel
   │  (ci.yml)            (agent-review   │
   │  ruff, alembic,      .yml / Sonnet)  │
   │  pytest, eslint,     PASS or BLOCK   │
   │  next build          verdict         │
   └──────────────────────────────────────┘
              │
        ┌─────┴──────┐
        │            │
      PASS         FAIL
        │            │
        ▼            ▼
   auto-merge    auto-retry
   (squash)      (agent-auto-
        │         retry.yml)
        │            │
        │     ┌──────┴───────┐
        │     │              │
        │  retry < 3     retry = 3
        │     │              │
        │     │          needs-human
        │     │          label added
        │     │          → pipeline
        │     │            pauses
        │     ▼
        │  close PR, delete branch,
        │  post failure context on issue,
        │  re-add `auto` → implementer re-runs
        │
        ▼
   advance-queue fires
   → next issue labeled `auto`
   → cycle repeats
```

---

## Workflows

| File | Trigger | Role |
|---|---|---|
| `agent-implement.yml` | `auto` label added to issue | Implements the issue, opens PR, arms auto-merge |
| `ci.yml` | PR opened / updated | Lint, migrations, tests, frontend build |
| `agent-review.yml` | PR opened / updated | Read-only code review — emits PASS or BLOCK |
| `agent-auto-retry.yml` | CI or Review workflow fails | Closes PR, posts failure context, re-triggers implementer |
| `agent-advance-queue.yml` | `claude/issue-*` PR merged | Labels the next open issue `auto` |
| `notify-merge.yml` | Any PR merged | Slack notification |

---

## Issue labels

| Label | Meaning |
|---|---|
| `auto` | Issue is in the pipeline — implementer will run (or is running) |
| `retry-1` / `retry-2` / `retry-3` | How many auto-retry attempts have been made |
| `needs-human` | Max retries (3) exceeded — pipeline paused, human action required |
| `no-auto` | Issue is excluded from the automated queue |
| `epic` | Tracking issue — excluded from the automated queue |

---

## Issue selection order

`agent-advance-queue.yml` picks issues in **ascending numeric order**, excluding:

- Issues already labeled `auto` (in progress)
- Issues labeled `needs-human`, `epic`, or `no-auto`
- Issues whose title starts with `Epic:` (catches epic tracking issues without a label)

---

## How to start the pipeline

1. Ensure GitHub repo settings:
   - **Settings → General → Pull Requests**: enable "Allow auto-merge"
   - **Settings → Branches → main**: branch protection rule requiring status checks
     `backend`, `frontend` (from `ci.yml`) and `review` (from `agent-review.yml`)

2. Merge the current open PR to kick off the first advance-queue run.

3. Watch Slack — each issue will be announced as it triggers.

---

## Handling a `needs-human` escalation

When an issue hits 3 consecutive failures:

1. The issue gets a `needs-human` label and a comment with the full failure history.
2. The pipeline stops for that issue.

To resume:

1. Read the failure context comments on the issue.
2. Either fix the issue description (clarify requirements) or push a manual fix to the
   branch (if you want to salvage the partial work).
3. Remove the `needs-human` label.
4. Re-add the `auto` label — the implementer will run again (retry count resets because
   the auto-retry counter only increments on consecutive failures without a human touch).

---

## Excluding an issue from the queue

Add the `no-auto` label to any issue you want to skip in the automated run. You can
re-add `auto` manually whenever you want to process it.

---

## Architecture notes

- **Concurrency**: `agent-auto-retry.yml` uses a concurrency group keyed on the branch
  name (`auto-retry-claude/issue-N`). If CI and the Reviewer both fail simultaneously,
  the second retry run is queued rather than racing. The second run finds no open PR
  (already closed by the first) and exits gracefully.
- **Failure context**: Retry comments are posted on the **issue** (not the PR) so the
  Implementer can read them on the next run via `gh issue view --comments`.
- **Branch lifecycle**: Each implementer run creates `claude/issue-N` from `main`.
  On failure, the retry workflow closes the PR and deletes the branch before re-triggering,
  so the implementer always starts from a clean branch off the latest `main`.
- **Auto-merge arm**: The implementer runs `gh pr merge --auto --squash --delete-branch`
  after opening the PR. This arms auto-merge but does not merge — CI and the Reviewer
  still have to pass. The branch is deleted by GitHub on merge.
