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

## Single operator?

Delegation is optional. With no `?role=` in the URL, the wizard is unscoped —
one person sees and answers everything (the markers just flag which questions
are usually someone else's). The generated output is identical regardless of how
many people contributed.
