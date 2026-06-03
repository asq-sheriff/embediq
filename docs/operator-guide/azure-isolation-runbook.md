<!-- audience: public -->

# Azure isolation runbook — Claude Code on a Microsoft / Azure stack

A practical, customer-neutral runbook for running the coding agent safely on an
Azure / Microsoft estate (Azure Virtual Desktop or Windows 365, Azure DevOps,
Intune, Zero Trust). It implements the recommendation in the
[isolation decision guide](../evaluators/isolation-decision-guide.md): **enforce
the native OS sandbox on the managed surface you already run, and keep
disposable boundaries for unattended work** — rather than provisioning a new VM
tier just for the agent.

> If you already operate **AVD / Windows 365**, you already satisfy the
> "no regulated source on endpoints" posture (source lives in the cloud desktop,
> not on laptops). You do **not** need a second VM tier for the agent — you need
> the agent, inside that desktop, with the native sandbox enforced.

## Phase 1 — Run the agent under WSL2 inside AVD / Windows 365

The native OS sandbox (bubblewrap/Seatbelt) runs on Linux and macOS; on Windows
it runs under **WSL2**. So inside the Windows AVD / W365 session:

1. Enable WSL2 in the desktop image (or via Intune) and install a distro.
2. Install Claude Code inside the WSL2 distro.
3. Developers work in WSL2; source is cloned into the cloud desktop, never onto
   the local endpoint.

This keeps OS-level containment *and* the data-off-endpoint property of VDI.

## Phase 2 — Enforce the sandbox fleet-wide via Intune (managed settings)

The sandbox should be **required**, not opt-in. Deliver a `managed-settings.json`
to every endpoint through Intune (or Jamf for macOS). EmbedIQ generates this file
for you when the admin sets the isolation posture — see
`deploy/claude-code/managed-settings.json` and its README in the generated
harness. Deliver it to the per-OS path:

| OS | Managed-settings path |
| --- | --- |
| Linux / WSL2 | `/etc/claude-code/managed-settings.json` |
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Windows | `C:\ProgramData\ClaudeCode\managed-settings.json` |

The generated file sets `"sandbox": { "enabled": true }` (developers cannot turn
it off) and pins a non-wideable permission floor. To route the sandbox's egress
through your corporate proxy (ZPA / Zscaler), add your proxy settings to the
managed file and distribute the proxy keys the same way. Keep secrets out of any
repo copy.

## Phase 3 — Zero-Trust conditional access for the repo

Gate access to Azure Repos / Azure DevOps on **device compliance** (Intune) and
identity (Entra ID conditional access, MFA). The agent inherits the developer's
authenticated session, so the same Zero-Trust controls that protect a human
protect the agent — no separate agent identity to manage on the interactive path.

## Phase 4 — Disposable boundaries for unattended work

Never run `--dangerously-skip-permissions` on an interactive desktop. For
overnight refactors, batch jobs, or PR review:

- **Azure DevOps pipelines.** Your runners are already VMs — headless agent
  review lives there naturally. Use `azure-pipelines.yml` (EmbedIQ generates one
  when CI/CD = Azure DevOps) and run the agent inside the pipeline job.
- **Ephemeral cloud dev environments.** A per-task container/VM, source cloned
  in, torn down after. This is the right home for permission-skipped runs — the
  disposability is the safety. If the team prefers containers locally, the
  `.devcontainer` EmbedIQ generates (when the isolation posture is *dev container*)
  is the same idea on the desktop.

## How the generated harness fits

| Phase | EmbedIQ artifact |
| --- | --- |
| 2 — fleet sandbox enforcement | `deploy/claude-code/managed-settings.json` + delivery README |
| 4 — dev container boundary | `.devcontainer/devcontainer.json` + README |
| 4 — pipeline boundary | `azure-pipelines.yml` (when CI/CD = Azure DevOps) |
| all phases — behavior inside the boundary | `CLAUDE.md`, path-scoped rules, DLP/command-guard/egress/audit hooks, tiered `settings.json` |

Set the **isolation posture** in the wizard (an admin-only question) to emit the
Phase-2/4 artifacts; the rest of the harness is identical across every boundary.

## See also

- [Isolation decision guide](../evaluators/isolation-decision-guide.md) — choosing the rung
- [Healthcare BPO deployment](../HEALTHCARE-BPO-DEPLOYMENT.md) · [Deployment](deployment.md)
