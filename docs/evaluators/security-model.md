<!-- audience: public -->

# Security model

This document explains EmbedIQ's security posture in the language an
enterprise evaluator cares about: what guarantees the architecture
makes, which ones are opt-in, what the attack surface looks like, and
how we compare to alternatives that rely on LLM calls or cloud
services.

For implementation detail — which keys, which hash functions,
threat-to-mitigation mapping — see [SECURITY.md](../../SECURITY.md).
For framework-by-framework compliance coverage, see
[threat-coverage.md](threat-coverage.md).

## Three load-bearing design properties

EmbedIQ's security story rests on three architectural choices, not on
configuration. A competitor with a different architecture would need
to redesign to match any of these — a patch won't get there.

### 1. Zero-persistence by default

- No database ships with EmbedIQ.
- The web API is fully stateless by default. Answers live in
  volatile memory (process heap or browser JS).
- Server-side sessions are **opt-in** (`EMBEDIQ_SESSION_BACKEND`) and
  ship with AES-256-GCM payload encryption via
  `EMBEDIQ_SESSION_DATA_KEY` (also opt-in).
- There is no telemetry. The project never calls home.

Contrast: LLM-powered alternatives route every wizard answer through
a cloud API. Even if the upstream promises "no training data
retention," the answer payload has touched their infrastructure.

### 2. No LLM dependency in the hot path

- All output is produced by pure TypeScript generators. There are
  zero LLM calls during generation.
- The output is deterministic — the same answer set produces
  byte-identical files (modulo a single generation-stamp line that
  the drift detector strips before comparison).
- This is not "we also support offline mode" — this is the default
  and only mode. There's no offline toggle to forget to set.

Contrast: GitHub Spec Kit, Claude Code's `/init`, and most "smart
setup" tools depend on an LLM. Determinism and audit
reproducibility become configuration problems for them.

### 3. Air-gap compatible

- The CLI runs fully offline end-to-end.
- The web server's only outbound network activity is **opt-in per
  feature**: OpenTelemetry export, git PR integration, outbound
  notification webhooks. Unset every relevant env var and EmbedIQ
  makes zero outbound calls.
- Inbound compliance webhooks (Drata, Vanta, etc.) are also opt-in
  and guarded by a shared secret.

Contrast: cloud-native alternatives require internet access by
definition. For healthcare orgs with data governance policies,
financial institutions with data residency requirements, and
government agencies with air-gap mandates, that's disqualifying —
not adjustable.

## Authentication model

| Strategy | Use when | Identity source |
|---|---|---|
| **None** (default) | Local dev, personal machines | — |
| **Basic** | Single admin on a private network | Shared username/password in env |
| **OIDC** | Enterprise SSO | IdP JWT (Okta, Auth0, Azure AD, Keycloak, Google) |
| **Proxy header** | Behind IAP / reverse proxy | Headers set by the proxy |

RBAC ships with two roles (`wizard-user`, `wizard-admin`). Generation
(`POST /api/generate`), admin session listing, and session dumps are
gated on `wizard-admin`. Every PATCH to a session records
`contributedBy` from the authenticated user — stamped server-side,
unforgeable by the client.

Details: [operator-guide/authentication.md](../operator-guide/authentication.md).

## DLP enforcement

Generated output includes a **Python DLP scanner hook** invoked
before every Claude Code tool call. Patterns come from the active
domain pack + compliance framework:

- **Healthcare (HIPAA)**: MRN, Medical Record Number, ICD-10 with
  patient context, DEA, NPI, FHIR Patient resource IDs.
- **Finance (PCI-DSS)**: PAN (Visa/MC/Amex/Discover regex), CVV,
  ABA routing, SWIFT/BIC, IBAN, EIN.
- **Education (FERPA)**: student identifiers and education-record
  patterns.

A match blocks the tool invocation outright on `CRITICAL` severity;
`HIGH` severity warns. Generation **cannot proceed** if the
post-generation validator finds the expected DLP patterns missing for
the active compliance framework.

Extensibility: [extension-guide/writing-domain-packs.md](../extension-guide/writing-domain-packs.md)
covers how to add organization-specific DLP patterns. Generated
hooks live in `.claude/hooks/dlp-scanner.py` and are plain Python —
auditable, not a black box.

## Audit trail

Opt-in via `EMBEDIQ_AUDIT_LOG=/path/to/log.jsonl`. Format is
JSON Lines — one event per line, seven event types:

- `session_start` / `session_complete` / `session_error`
- `profile_built` (includes `profileSummary` with framework list)
- `generation_started` / `validation_result` / `file_written`

Each entry carries `timestamp`, `userId` (when auth is on), and
`requestId`. The writer is append-only and flushes per write, so a
crash never corrupts prior entries.

Retention guidance in [SECURITY.md](../../SECURITY.md) — HIPAA 6 y,
PCI-DSS 1 y, SOX 7 y. Plays cleanly with SIEM ingestion (Splunk,
Elastic, Loki, Datadog).

Schema: [reference/audit-log-schema.md](../reference/audit-log-schema.md).

## Cryptographic primitives

| Use | Primitive | Key supplied via |
|---|---|---|
| Session payload encryption | AES-256-GCM (Node `crypto`) | `EMBEDIQ_SESSION_DATA_KEY` (32 bytes hex) |
| Owner-cookie signing | HMAC-SHA-256 | `EMBEDIQ_SESSION_COOKIE_SECRET` (32 bytes) + optional `_PREV` for rotation |

No bespoke crypto. No custom KDFs. No rolled implementations. The
cryptographic surface area is: two standard primitives, two keys.
Rotate either one without user-visible downtime (cookie signing
supports side-by-side keys via `_PREV`; payload key rotation requires
re-minting sessions and is a known v3.2 limitation).

## What's stored and where

EmbedIQ writes only what the operator explicitly enables:

| Feature | Enable via | On disk |
|---|---|---|
| Audit log | `EMBEDIQ_AUDIT_LOG` | One JSONL file, operator's choice of path. |
| JSON-file sessions | `EMBEDIQ_SESSION_BACKEND=json-file` | One `<sessionId>.json` per session under `EMBEDIQ_SESSION_DIR`. |
| SQLite sessions | `EMBEDIQ_SESSION_BACKEND=database` + `EMBEDIQ_SESSION_DB_DRIVER=sqlite` | One SQLite DB at `EMBEDIQ_SESSION_DB_URL`. |
| Autopilot | `EMBEDIQ_AUTOPILOT_ENABLED=true` | `schedules.json` + `runs.json` (last 500) under `EMBEDIQ_AUTOPILOT_DIR`. |
| OTel | `EMBEDIQ_OTEL_ENABLED=true` | Exported via OTLP HTTP; nothing on EmbedIQ's disk. |
| Generated output | Wizard completion | The `targetDir` the user named. |

With every feature disabled, EmbedIQ reads config, answers questions
in-memory, writes the user-selected directory, and exits.

## Attack surface audit

| Vector | Mitigation |
|---|---|
| **Unauthenticated wizard use over network** | Enable `EMBEDIQ_AUTH_STRATEGY`. Put HTTPS in front (`EMBEDIQ_TLS_CERT`/`KEY` or reverse proxy). |
| **Session cookie theft** | HTTP-only + signed cookies; cookie TTL matches session TTL; rotation via `_PREV`. |
| **Malicious external domain pack / skill** | Loaded from operator-controlled directories only; EmbedIQ never fetches automatically. Treat like any npm dependency — audit before enabling. |
| **Forged compliance webhook** | `EMBEDIQ_AUTOPILOT_WEBHOOK_SECRET` shared-secret guard (platform-signed payloads are a roadmap item). |
| **Generated hook code running untrusted** | Hooks are plain Python shipped to the user's target directory; they run under the user's own permissions, never on EmbedIQ's server process. |
| **Prompt injection via answers** | No LLM in the pipeline — answers flow into deterministic generators. Prompt-injection isn't a class of attack here. |

## Supply chain

- Runtime dependencies are pinned in `package.json` and locked in
  `package-lock.json`. The release checklist runs `npm audit`.
- Optional dependencies (`@opentelemetry/*`, `better-sqlite3`) load via
  dynamic `import()` at runtime. EmbedIQ degrades to noop if they
  aren't installed.
- Generated file stamps (`Generated by EmbedIQ v<ver> | schema:<n> |
  <ISO>`) give operators a provenance chain for every file written.
- Zero fetch-time network calls. `npm install` is the only moment
  EmbedIQ touches the public internet, and the install surface is
  fixed by `package-lock.json`.

## Summary — what to tell your security team

- **Local-first, deterministic, audit-ready.** No LLM calls, no
  database by default, no telemetry.
- **Opt-in only networking.** Every outbound connection and every
  persistent storage is gated by an env var.
- **RBAC + audit trail built in.** Compliance review has a trail.
- **Transparent output.** Generated hooks are plain scripts; DLP
  patterns are regexes the operator can read.
- **MIT licensed.** See the code, audit it, fork it.

## See also

- [SECURITY.md](../../SECURITY.md) — threat model, responsible
  disclosure, cryptographic details
- [threat-coverage.md](threat-coverage.md) — framework-by-framework
- [evaluation-methodology.md](evaluation-methodology.md) — benchmark
  us against alternatives
- [competitive-comparison.md](competitive-comparison.md)
