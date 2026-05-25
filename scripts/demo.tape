# EmbedIQ — VHS demo tape
#
# Renders a ~110-second terminal gif for the README covering both the
# CLI surface and the web-UI launch flow.
#
# Prerequisite: install VHS from https://github.com/charmbracelet/vhs
#   brew install vhs
#
# Render:
#   vhs scripts/demo.tape
# Output:
#   docs/assets/demo.gif
#
# After rendering, the `![Demo](docs/assets/demo.gif)` line in
# README.md picks it up automatically.
#
# Scope: the tape demos the deterministic CLI surface (help, drift,
# evaluate, governance outputs, audit-chain verify) plus a glance at
# the web-UI boot output. The interactive wizard itself is harder to
# script reliably because @inquirer/prompts uses raw mode + arrow-key
# navigation, so we stay in deterministic-CLI territory so the gif
# renders the same way every time.

Output docs/assets/demo.gif

Set FontSize 14
Set Width 1200
Set Height 720
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms
Set Padding 20

# ── Intro ─────────────────────────────────────────────────────────────
Type "# EmbedIQ — one interview, six AI agent configs"
Sleep 1500ms
Enter
Type "# Deterministic. Offline. Audit-ready. Federal-procurement-grade."
Sleep 1500ms
Enter
Sleep 800ms

Type "clear"
Enter
Sleep 300ms

# ── 1. The CLI surface ────────────────────────────────────────────────
Type "make help | head -28"
Sleep 500ms
Enter
Sleep 4s

Type "clear"
Enter
Sleep 300ms

# ── 2. Multi-agent targets — base + v4.0 governance ──────────────────
Type "# 15 output targets — 11 base + 4 v4.0 governance outputs:"
Sleep 800ms
Enter
Type "grep -E \"^\\s+(CLAUDE|AGENTS_MD|CURSOR|COPILOT|GEMINI|WINDSURF|CONTINUE_DEV|AIDER|ZED_AI|OLLAMA|RAG_SCAFFOLD|LOCAL_ROUTER|OSCAL_|CYCLONEDX|PROVENANCE)\" src/synthesizer/target-format.ts"
Sleep 500ms
Enter
Sleep 5s

Type "clear"
Enter
Sleep 300ms

# ── 3. Drift detection ────────────────────────────────────────────────
Type "# Drift-check a generated project — clean state:"
Sleep 800ms
Enter
Type "npm run drift -- --target tests/fixtures/golden-configs/minimal-developer/expected --archetype minimal-developer --no-color 2>&1 | tail -18"
Sleep 500ms
Enter
Sleep 5s

Type "clear"
Enter
Sleep 300ms

# ── 4. Evaluation framework ──────────────────────────────────────────
Type "# Score generated output against golden references:"
Sleep 800ms
Enter
Type "npm run evaluate -- --no-color 2>&1 | tail -22"
Sleep 500ms
Enter
Sleep 6s

Type "clear"
Enter
Sleep 300ms

# ── 5. v4.0 governance — what an AIBOM looks like ────────────────────
Type "# v4.0 — CycloneDX-ML AIBOM (sample shape):"
Sleep 800ms
Enter
Type "head -28 docs/extension-guide/exporting-cyclonedx-aibom.md | tail -18"
Sleep 500ms
Enter
Sleep 5s

Type "clear"
Enter
Sleep 300ms

# ── 6. v4.0 governance — audit chain integrity check ─────────────────
Type "# v4.0 — tamper-evident audit chain. Mint a chain..."
Sleep 800ms
Enter
Type "mkdir -p /tmp/embediq-demo && EMBEDIQ_AUDIT_LOG=/tmp/embediq-demo/audit.jsonl EMBEDIQ_AUDIT_CHAIN_ENABLED=true npx tsx -e \"import{auditLog} from './src/util/wizard-audit.ts';auditLog({timestamp:'',eventType:'session_start'});auditLog({timestamp:'',eventType:'file_written',filePath:'CLAUDE.md'});auditLog({timestamp:'',eventType:'session_complete'});\""
Sleep 500ms
Enter
Sleep 4s
Type "npm run verify-audit-log -- --input /tmp/embediq-demo/audit.jsonl --no-color 2>&1 | tail -10"
Sleep 500ms
Enter
Sleep 4s

Type "clear"
Enter
Sleep 300ms

# ── 7. Web UI ─────────────────────────────────────────────────────────
Type "# Web UI — same wizard, same generators, same output:"
Sleep 800ms
Enter
Type "echo 'npm run start:web   →   http://localhost:3000'"
Sleep 500ms
Enter
Sleep 1s
Type "# Stateless by default; opt into Postgres for HA scale-out"
Sleep 1s
Enter
Type "# Resumable via ?session=<id> URLs; per-answer contributor attribution"
Sleep 1500ms
Enter
Sleep 2s

Type "clear"
Enter
Sleep 300ms

# ── Outro ────────────────────────────────────────────────────────────
Type "# github.com/asq-sheriff/embediq"
Sleep 2s
Enter
Type "# docs/getting-started.md — 10-minute tour"
Sleep 1500ms
Enter
Type "# docs/extension-guide/writing-oscal-imports.md — full v4.0 governance walkthrough"
Sleep 2s
Enter
Sleep 1500ms
