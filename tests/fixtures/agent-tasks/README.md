# Agent-effectiveness task set

Tasks for the agent-effectiveness eval (`src/evaluation/agent-task/`, docs at
`docs/evaluators/agent-effectiveness-eval.md`). Each task runs a real agent
twice — **baseline** (no config) and **treatment** (EmbedIQ's generated config
for the task's `archetype`) — and an objective, hidden verifier decides success.

## Two kinds of task

- **Compliance-discriminating** (`phi-safe-logging`, `phi-safe-errors`) — the
  interesting ones. The compliance requirement (never log PHI; never embed a
  patient identifier in an error) lives **only in the project's HIPAA rules**,
  never in the prompt and never in a test the agent can read. A bare agent
  doesn't know it and tends to leak; a config-equipped agent is told, via the
  generated `.claude/rules/`, not to. **A baseline that leaks PHI FAILS — that
  failure is the signal, not a bug.** These measure the actual product value:
  does the compliance config make the agent write compliant code it otherwise
  wouldn't?
- **Neutral control** (`slugify-fix`) — no compliance angle. Measures whether the
  config *hurts* (or costs tokens) on ordinary work — the memo's worry.

## Why the verifier is hidden

The verifier lives in `verify/`, copied into the workspace only *after* the agent
finishes. If it were visible, the agent could read the compliance assertion and
satisfy it directly — erasing the very difference we're measuring. The
requirement must reach the agent through the config, not the test.

## Structure

```
<task-id>/
  task.yaml            # id, description, archetype, verifyCommand, prompt
  workspace/           # agent-visible starting tree (the impl stub only)
  verify/              # HIDDEN checker (copied in at verification time)
```

Keep verifiers dependency-free (plain `node`) so no `npm install` runs inside
each trial workspace.

## Running

Live, opt-in, real spend (see the eval doc). Each task = `2 × trials` agent runs.

```bash
npx tsx src/evaluation/agent-task/cli.ts --trials 5
```

## Reading the result

- **Compliance tasks:** a positive `success Δ` (treatment > baseline) is the core
  result — the config produced compliant behavior the bare agent didn't. That is
  the differentiated value, quantified.
- **Control task:** watch the `tokens Δ` and that `success Δ` is not negative —
  i.e. the config doesn't hurt normal work.
- Verdicts are `inconclusive` below 5 trials/arm. For a real read use `K ≥ 5`
  across all tasks, and remember: effectiveness is one axis — a small cost can be
  a correct trade for enforceable compliance.
