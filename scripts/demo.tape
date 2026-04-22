# EmbedIQ — VHS demo tape
#
# Renders a ~60-second terminal gif for the README.
#
# Prerequisite: install VHS from https://github.com/charmbracelet/vhs
#   brew install vhs
#
# Render:
#   vhs scripts/demo.tape
# Output:
#   docs/assets/demo.gif
#
# After rendering, uncomment the `![Demo](docs/assets/demo.gif)` line
# in README.md.
#
# This tape demos the non-interactive surface (help, drift, evaluate,
# benchmark). The interactive wizard is harder to reliably script
# because @inquirer/prompts uses raw mode + arrow-key navigation; this
# tape stays in deterministic-CLI territory so the gif renders the
# same way every time.

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
Type "# Deterministic. Offline. Audit-ready."
Sleep 1500ms
Enter
Sleep 800ms

Type "clear"
Enter
Sleep 300ms

# ── 1. The CLI surface ────────────────────────────────────────────────
Type "make help | head -25"
Sleep 500ms
Enter
Sleep 4s

Type "clear"
Enter
Sleep 300ms

# ── 2. Multi-agent targets at a glance ───────────────────────────────
Type "# Six output targets, picked via --targets flag or env var:"
Sleep 800ms
Enter
Type "npm run drift -- --help 2>&1 | grep -A1 -- '--targets'"
Sleep 500ms
Enter
Sleep 4s

Type "clear"
Enter
Sleep 300ms

# ── 3. Drift detection ────────────────────────────────────────────────
Type "# Drift-check a generated project — clean state:"
Sleep 800ms
Enter
Type "npm run drift -- --target tests/fixtures/golden-configs/minimal-developer/expected --archetype minimal-developer --no-color 2>&1 | tail -20"
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
Type "npm run evaluate -- --no-color 2>&1 | tail -25"
Sleep 500ms
Enter
Sleep 7s

Type "clear"
Enter
Sleep 300ms

# ── Outro ────────────────────────────────────────────────────────────
Type "# github.com/asq-sheriff/embediq"
Sleep 2s
Enter
Type "# docs/getting-started.md for the 10-minute tour"
Sleep 2s
Enter
Sleep 1500ms
