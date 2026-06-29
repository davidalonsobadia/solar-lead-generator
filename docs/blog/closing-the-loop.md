# Closing the loop: a fully automated issue-to-merge pipeline

> Follow-up to [Three ways I'm letting AI agents ship code (not just write it)](./three-ways-to-ship-with-ai-agents.md).
> Audience: developers who read that post and want to see Way 3 actually built.

In the previous post I described three progressively more autonomous setups for an
AI-driven engineering pipeline. Way 1 was an issue-driven implementer that opens and
merges PRs. Way 2 was a Planner that turns a raw idea into a stack of correctly-ordered
issues. Way 3 — "closing the loop" — was still speculative: *what if the pipeline
advanced itself, issue by issue, without a human turning the crank between each one?*

I built it. Here's what it took.

---

## The last manual crank

At the end of the previous post, the remaining human interaction looked like this:

1. Wait for a PR to merge.
2. Decide which issue to work on next.
3. Add `auto` to it.
4. Repeat 35 times.

That's not a lot of work per step, but it serializes the whole pipeline through your
attention. You become the bottleneck — not because you're reviewing (that's valuable)
but because you're *advancing a queue*.

The fix turned out to be two small GitHub Actions workflows: one that fires when a PR
merges and labels the next issue, and one that fires when CI or the Reviewer rejects a PR
and sends it back to the implementer with the failure context attached. Together they
close the loop.

---

## Part 1 — Auto-advancing the queue

The first workflow (`agent-advance-queue.yml`) triggers whenever a `claude/issue-*`
branch merges into `main`:

```yaml
on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  advance:
    if: |
      github.event.pull_request.merged == true &&
      startsWith(github.event.pull_request.head.ref, 'claude/issue-')
```

It then runs a single `gh issue list` query to find the next candidate:

```bash
gh issue list \
  --state open --limit 100 \
  --json number,title,labels \
  --jq '[
    .[] |
    select(
      (.title | test("^Epic:"; "i") | not) and
      (.labels | map(.name) |
        (contains(["auto"])        | not) and
        (contains(["needs-human"]) | not) and
        (contains(["no-auto"])     | not)
      )
    ) | .number
  ] | sort | .[0] // empty'
```

The lowest-numbered open issue that is not already running, not stuck, and not explicitly
excluded gets `auto` added to it. That fires the Implementer. The Implementer opens a PR,
arms auto-merge, and the cycle continues.

When there are no more candidates, Slack gets a "pipeline complete" message.

One design choice worth naming: **issues are selected by ascending number, not by explicit
dependency links.** The Planner creates issues in dependency order (lower numbers first),
so ascending-number selection is correct for this project. If you had a different ordering
scheme, you would add a `priority` label or a `queued` label and filter on that instead.

---

## Part 2 — Auto-retrying on failure

The advance-queue only helps in the happy path. The harder problem is: *what happens when
CI or the Reviewer rejects a PR?*

Before this week, the answer was: the PR sits there, auto-merge is blocked, and nothing
moves until a human intervenes. That is a fine answer if failures are rare and you are
paying attention. It is a bad answer if you want the pipeline to run overnight.

The second workflow (`agent-auto-retry.yml`) triggers on `workflow_run` completed with
a `failure` conclusion, watching the two gates:

```yaml
on:
  workflow_run:
    workflows: ["CI", "Agent - Review"]
    types: [completed]
```

When it fires for a `claude/issue-*` branch, it:

1. **Finds the open PR** for that branch. If there is none (the first retry already handled
   it — more on that in a moment), it exits gracefully.
2. **Collects failure context** — truncated CI logs for failed steps, or the inline review
   comments that produced a BLOCK verdict.
3. **Closes the PR and deletes the branch**, so the Implementer can start from a clean
   branch off the latest `main` on the next attempt.
4. **Posts the failure context as a comment on the issue.** The Implementer is explicitly
   prompted to read all issue comments before starting work, treating any
   "Auto-retry N/3" comment as a mandatory fix list.
5. **Re-adds `auto`** to trigger the Implementer again.

The retry count is tracked by labels: `retry-1`, `retry-2`, `retry-3`. After three
failures, the workflow instead adds `needs-human` and stops. A human reads the failure
history and decides whether the issue needs clarification or the fix needs to be done
manually.

### The race condition problem

Both CI and the Reviewer run in parallel. If both fail at the same time, two `workflow_run`
events fire for the same branch. Without coordination, they would both try to close the
same PR and re-trigger the Implementer — resulting in two implementer runs on the same
issue simultaneously.

The fix is a concurrency group keyed on the branch name:

```yaml
concurrency:
  group: auto-retry-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: false
```

`cancel-in-progress: false` queues rather than cancels: the first run closes the PR and
deletes the branch; the second run finds no open PR and exits. The check for an open PR
at the top of the job is the deduplication gate — *if someone already handled it, do
nothing.*

### Where the failure context lives

One question that took some thought: should the failure context be a PR comment or an
issue comment? It has to be on the **issue**, not the PR, because the old PR is closed
before the next Implementer run begins. The Implementer is prompted to run
`gh issue view --comments` before starting, so it will always pick up the failure context
regardless of how many retries have accumulated.

---

## What the full flow looks like now

```
Human: merge PR #2  (one-time kick-off)
              │
              ▼
     advance-queue → `auto` on issue #N
              │
              ▼
     Implementer runs → opens PR → arms auto-merge
              │
    ┌─────────┴──────────┐
    │                    │
  PASS                 FAIL
    │                    │
  auto-merge        auto-retry
    │               (up to 3×)
    │                    │
    ▼               (3rd fail)
  advance-queue →   needs-human → pipeline pauses
  next issue
```

The only human interactions across a 34-issue backlog are:

- **One**: merge the current PR to start the pipeline.
- **A handful** (maybe): handle `needs-human` escalations on complex issues.

Everything else — implementing, reviewing, merging, advancing — runs without waiting for
a human.

---

## What I did not automate, and why

**Human review is gone from the happy path.** That is the intentional trade-off.
The Reviewer agent is still a required status check, and it can still block — it is not
gone. But a human is no longer in the loop *by default*. I am comfortable with that for a
solo side project with a well-specified backlog and a read-only Reviewer that applies the
same rubric every time. I would not be comfortable with it for production code that touches
payments or user data.

**The kick-off is still manual.** One merge to start is a small price for a clear "go"
signal. A fully autonomous pipeline that starts implementing issues the moment they are
created feels like it removes one too many decision points for my taste.

**The Planner still runs locally.** I invoke it in my terminal, read the plan, and decide
whether to proceed. That checkpoint — between "here is what we could build" and "start
building it" — is the most valuable human moment in the whole system, and I want to keep
it.

---

## The through-line

Three posts, three progressively more autonomous setups. The pattern that made each step
safe enough to take:

- **Specialized agents with narrow permissions.** The Implementer cannot merge to `main`.
  The Reviewer cannot push code. The advance-queue workflow only writes labels.
- **Hard gates between agents.** CI and an independent Reviewer that neither agent
  controls. Fail-closed verdicts. Required status checks.
- **Human checkpoints at the expensive decisions.** Plan approval. Escalations.
  Anything destructive or irreversible.

The goal was never "replace the engineer." It was "stop being the bottleneck for the
boring parts of the job." I think it is there now.

---

*Stack: FastAPI + Next.js monorepo, GitHub Actions, `anthropics/claude-code-action`,
agents defined as Markdown in `.claude/agents/`, Slack for notifications. Implementer and
Planner run on Opus; Reviewer on Sonnet.*
