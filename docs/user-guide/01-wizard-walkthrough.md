<!-- audience: public -->

# Wizard walkthrough (CLI + web)

A detailed pass through the four-phase wizard flow, covering both the
CLI (`npm start`) and the web UI (`npm run start:web`). If you're
brand new to EmbedIQ, start with
[getting-started.md](../getting-started.md) for the 10-minute tour;
this chapter is the longer reference for each phase.

> **Interim page.** The comprehensive wizard walkthrough lives in the
> combined [`USER_GUIDE.md`](../USER_GUIDE.md#getting-started--step-by-step) — sections
> **Usage**, **CLI Walkthrough**, **Web Walkthrough**, and **After
> Generation**. A future release splits that content into this
> numbered chapter format; today this stub points you at the
> comprehensive source.

## Quick reference to the four phases

1. **Discovery** — adaptive Q&A, up to ~50 of the 95 questions based
   on your answers, agent-target selection (`STRAT_TARGETS`),
   admin-vs-user operator type (`STRAT_000b`), chosen industry,
   and compliance frameworks.
2. **Playback** — summary of the derived profile, tech stack,
   compliance posture, and priorities (with confidence scores).
3. **Edit & approve** — correct any field or priority ordering, add
   items the wizard missed.
4. **Generate** — pick the target directory, EmbedIQ writes the
   15–40 files and reports validation results.

## The web wizard's role-scoped handoff

The four phases above are the core flow. The **web UI** layers a three-role
**handoff** on top: every question is owned by an Admin, Team Lead, or
Individual, and the wizard can scope the interview to one role at a time.

- **Single operator (demo experience)** — the welcome screen shows a **gated
  stepper**: Admin unlocks first, then Team Lead, then Individual (each locked
  until the prior slice is done). Each slice ends in a summary, hands off with a
  **"Continue as &lt;next&gt; →"** button, and generation runs only after the
  final slice. Completed roles stay reviewable.
- **Multiple people** — the admin answers their slice, then delegates the Team
  Lead and Individual slices via shareable `?role=…` links, each scoped to that
  delegate's questions.

Either path produces identical output. See
[`13-three-role-delegation.md`](13-three-role-delegation.md) for the full
handoff + delegation reference.

## See also

- [`getting-started.md`](../getting-started.md) — 10-minute tour
- [`USER_GUIDE.md`](../USER_GUIDE.md) — comprehensive walkthrough
  (authoritative source until this chapter is fully populated)
- [`02-generated-files.md`](02-generated-files.md) — file-by-file
  reference to what lands in your project
- [`12-troubleshooting.md`](12-troubleshooting.md) — common failure
  modes
