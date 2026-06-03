<!-- audience: public -->

# Claude Code managed settings (enterprise enforcement)

`managed-settings.json` is the **enterprise policy floor** for Claude Code.
It requires the native OS sandbox for every user and pins a deny list that a
developer's local `.claude/settings.json` **cannot widen**. It is delivered by
your device-management platform — it is *not* a project setting and should not
be committed into application repositories.

Generated because your isolation posture is **`vdi`**.

## Deliver it to the OS managed-settings path

Push the file to the per-OS location via Intune / Jamf / your MDM:

| OS | Path |
| --- | --- |
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux / WSL2 | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\ProgramData\ClaudeCode\managed-settings.json` |

## Notes

- **Windows:** the native sandbox runs under **WSL2**. On Azure Virtual Desktop /
  Windows 365, run Claude Code inside a WSL2 distro and deliver the managed file
  to the WSL2 (Linux) path above.
- **`"sandbox": { "enabled": true }`** requires sandboxing fleet-wide and prevents
  developers from turning it off.
- **Corporate proxy:** to route sandbox egress through your proxy (e.g. Zscaler /
  ZPA), add your proxy settings to the managed file and distribute the proxy keys
  the same way. Keep secrets out of the repo copy.
- This pairs with the per-project `.claude/settings.json` / `settings.local.json`
  EmbedIQ also generates: managed settings are the floor; project settings refine
  the allow-list on top.

See EmbedIQ's [isolation decision guide](https://github.com/asq-sheriff/embediq/blob/main/docs/evaluators/isolation-decision-guide.md)
and the [Azure isolation runbook](https://github.com/asq-sheriff/embediq/blob/main/docs/operator-guide/azure-isolation-runbook.md).
