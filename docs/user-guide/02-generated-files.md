<!-- audience: public -->

# Generated files — what lands in your project

Every file EmbedIQ writes into your target directory, what role it
plays in the agent's configuration, and when it's generated
conditionally. For the canonical per-target catalog (including
multi-agent targets: `AGENTS.md`, Cursor, Copilot, Gemini,
Windsurf), see
[`reference/generated-files.md`](../reference/generated-files.md).

> **Interim page.** The human-readable tour of each file's purpose —
> `CLAUDE.md`, `.claude/settings.json`, rules, commands, agents,
> skills, hooks — lives in the combined
> [`USER_GUIDE.md`](../USER_GUIDE.md#generated-file-structure).
> This stub points you there until the comprehensive USER_GUIDE.md
> split is done.

## Summary

A default Claude-only generation produces roughly:

```
CLAUDE.md                      # root agent instructions
.claudeignore                  # files Claude ignores
.mcp.json.template             # MCP server registry (copy to .mcp.json)
.claude/
  settings.json                # models, hooks, permissions
  settings.local.json          # local overrides (gitignored)
  rules/                       # path-scoped rule files
  commands/                    # slash commands
  agents/                      # multi-agent definitions
  skills/                      # skill catalog entries
  hooks/                       # Python DLP/audit/guard hooks
  association_map.yaml
  document_state.yaml
```

Multi-agent targets add their respective trees (`AGENTS.md`,
`.cursor/rules/`, `.github/copilot-instructions.md` +
`.github/instructions/`, `GEMINI.md`, `.windsurfrules`).

## See also

- [`reference/generated-files.md`](../reference/generated-files.md) —
  canonical per-target file catalog with conditional-generation rules
- [`USER_GUIDE.md`](../USER_GUIDE.md) — comprehensive tour
  (authoritative source until this chapter is fully populated)
- [`05-multi-agent-targets.md`](05-multi-agent-targets.md) —
  per-target output detail
