<!-- audience: public -->

# Wizard walkthrough (CLI + web)

A detailed pass through the four-phase wizard flow, covering both the
CLI (`npm start`) and the web UI (`npm run start:web`). If you're
brand new to EmbedIQ, start with
[getting-started.md](../getting-started.md) for the 10-minute tour;
this chapter is the longer reference for each phase.

> **Interim page.** The comprehensive wizard walkthrough lives in the
> combined [`USER_GUIDE.md`](../USER_GUIDE.md#usage) — sections
> **Usage**, **CLI Walkthrough**, **Web Walkthrough**, and **After
> Generation**. A future release splits that content into this
> numbered chapter format; today this stub points you at the
> comprehensive source.

## Quick reference to the four phases

1. **Discovery** — adaptive Q&A, up to ~40 of the 71 questions based
   on your answers and chosen industry / compliance frameworks.
2. **Playback** — summary of the derived profile, tech stack,
   compliance posture, and priorities (with confidence scores).
3. **Edit & approve** — correct any field or priority ordering, add
   items the wizard missed.
4. **Generate** — pick the target directory, EmbedIQ writes the
   15–40 files and reports validation results.

## See also

- [`getting-started.md`](../getting-started.md) — 10-minute tour
- [`USER_GUIDE.md`](../USER_GUIDE.md) — comprehensive walkthrough
  (authoritative source until this chapter is fully populated)
- [`02-generated-files.md`](02-generated-files.md) — file-by-file
  reference to what lands in your project
- [`12-troubleshooting.md`](12-troubleshooting.md) — common failure
  modes
