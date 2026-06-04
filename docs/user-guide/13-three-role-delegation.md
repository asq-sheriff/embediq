<!-- audience: public -->

# Three-role delegation — the right person answers each question

A configuration interview spans three kinds of knowledge, and no single person
holds all of it. EmbedIQ classifies every question by **who is positioned to
answer it** and lets the person who starts the wizard delegate the rest.

## The three roles

| Role | Owns | Why |
|---|---|---|
| **Admin** (governance / security / finance) | The setup-identity questions (role, proficiency, operator) plus the **Compliance policy switches** (frameworks, security tier, DLP, audit, permission tier, ZDR, egress) and **Financial** (budget, cost routing) — ~18 questions | Central policy a license/governance owner sets |
| **Team Lead** (the primary driver) | The **project** (purpose, industry, criticality, outcomes), all **Problem Definition** (pain points, the real problem, prior attempts), **Operational Reality**, all **Technology** (stack *and* infra), **Innovation**, and the *actual-data-flow* compliance facts (does the code handle PHI? which paths?) — ~40 questions | Lived team knowledge an admin can't supply |
| **Individual** | IDE, local-model hardware/model, concurrent-session count | Per-seat preferences |

Why it matters: the pain-points and north-star questions feed the **priority
analyzer**, whose top priorities land in the generated `CLAUDE.md` and steer the
agent's everyday behavior. An admin guessing those produces a confidently-wrong
harness — so they're owned by, and delegatable to, the Team Lead.

## How a question shows ownership

Every question returned by the wizard carries a `respondent`. When you answer a
question owned by a different role, the wizard shows a marker — "👥 Best
answered by your Team Lead" or "🧑 Personal preference" — and pairs it with the
**Skip** control so you can defer rather than guess (skipped questions are
inferred from your other answers where possible).

## Delegating (the admin-first flow)

Delegation requires a **session backend** (`EMBEDIQ_SESSION_BACKEND=json-file`
for a single node, `database` for multi-replica — see
[session-and-resume](07-session-and-resume.md)).

1. **Admin starts** the wizard and answers their slice — setup + Compliance
   policy + Financial.
2. On the **generate screen**, the **Assign & delegate** panel shows each role's
   completion. Click **Assign & get link** for the Team Lead (and Individual);
   EmbedIQ returns a shareable link:

   ```
   POST /api/sessions/<id>/assignments   { "role": "lead", "assigneeLabel": "lead@acme.com" }
   → { "role": "lead", "link": "/?session=<id>&role=lead", "status": "pending" }
   ```

3. **Share the link.** The Team Lead opens `/?session=<id>&role=lead`; the wizard
   is **scoped to their slice only**, with a banner explaining the context. Their
   answers are attributed to them server-side (`contributedBy`) — they cannot be
   forged, and a delegate's writes are restricted to their own role's questions.

4. The admin's **dashboard** (`GET /api/sessions/:id/assignments`) shows live
   per-role completion (answered / visible / status / contributors). Re-share the
   link as a reminder for anything still `pending`.

5. **Generate any time.** Generation tolerates partial answers — un-delegated
   roles fall back to inference and safe defaults — so the admin can generate
   before delegates finish, then regenerate once they do.

## Audit trail

The downloadable **profile report** (`POST /api/profile/report`) includes a
*Contributions by role* section and tags each answer with its owning role and
contributor, so the generated configuration carries a record of *who* answered
*what*. Each generation also writes a versioned, hash-chained profile snapshot
(see [session-and-resume](07-session-and-resume.md)).

## Walking the three roles yourself — the gated handoff

You don't have to involve three different people. In the **demo experience**
(`EMBEDIQ_AUTH_STRATEGY=demo`) the welcome screen presents the three roles as a
**gated stepper** so one operator can walk them in order:

1. **Admin unlocks first.** Team Lead and Individual stay locked until the prior
   slice is complete — the configuration has a dependency order (the Team Lead's
   questions branch off the Admin's setup, and generation consumes all three), so
   you can't start in the middle.
2. **Each slice is scoped.** While filling the Admin slice you see *only* the
   ~18 Admin questions; the Team Lead's ~40 and the Individual's per-seat
   questions are hidden until it's their turn.
3. **Each slice ends in a summary**, then a **"Continue as &lt;next&gt; →"**
   button hands off to the next role. Completed roles stay clickable on the
   stepper for review.
4. **Generation runs only after the final (Individual) slice** — it consumes the
   accumulated answers from all three.

One owner identity carries the shared session through every role, so the answers
accumulate into a true handoff. The slice scoping is presentational — the
generated output is identical to answering everything in one pass.

> The gated stepper is the single-operator walkthrough of the three-role model
> (shown in the demo). For a real rollout across **different people**, use the
> **link-based delegation** above — each delegate opens their own `?role=…` link.

## Single operator?

Delegation is optional, and there are two single-operator paths:

- **Unscoped** — outside the demo, with no `?role=` in the URL, the wizard shows
  one person everything; the ownership markers just flag which questions are
  usually someone else's.
- **Gated handoff** — in the demo experience, the stepper walks you through the
  three roles in sequence (above).

Either way, the generated output is identical regardless of how many people
contributed.
