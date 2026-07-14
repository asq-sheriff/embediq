import type { ConfigGenerator } from '../generator.js';
import { TargetFormat } from '../target-format.js';
import type { GenerationContext, GeneratedFile, UserProfile } from '../../types/index.js';

/**
 * Isolation models for which we emit a fleet-enforced `managed-settings.json`.
 * `ci_only` and `none` (and the catch-all `other`) emit nothing — CI runners
 * are already disposable VMs, and "no isolation requirement" keeps the baseline
 * harness. Driven by TECH_023 → `profile.devOps.isolationModel`.
 */
const SANDBOX_ENFORCED_MODELS = new Set([
  'managed_endpoint',
  'dev_container',
  'vdi',
  'ephemeral_cloud',
]);

/**
 * Emits a deployable, MDM-delivered `managed-settings.json` that REQUIRES
 * Claude Code's native OS sandbox fleet-wide and pins a non-wideable permission
 * floor. This is the enterprise enforcement layer for the agent's execution
 * boundary — the artifact an admin pushes via Intune / Jamf to the OS-level
 * managed-settings path, NOT a project setting a developer can edit.
 *
 * Written under `deploy/claude-code/` (with a delivery README) precisely so it
 * is not mistaken for `.claude/settings.json`. Carries `TargetFormat.CLAUDE`.
 * No-op for non-technical roles and when the isolation posture is `ci_only` /
 * `none` / unset, so existing archetypes regenerate byte-identically.
 */
export class ManagedSettingsGenerator implements ConfigGenerator {
  name = 'managed-settings';
  target = TargetFormat.CLAUDE;

  generate(config: GenerationContext): GeneratedFile[] {
    const { profile } = config;
    if (['ba', 'pm', 'executive'].includes(profile.role)) return [];
    if (!SANDBOX_ENFORCED_MODELS.has(profile.devOps.isolationModel ?? '')) return [];

    return [
      {
        relativePath: 'deploy/claude-code/managed-settings.json',
        content: JSON.stringify(buildManagedSettings(profile), null, 2) + '\n',
        description: 'Enterprise managed settings — requires the native OS sandbox fleet-wide (deliver via MDM)',
      },
      {
        relativePath: 'deploy/claude-code/README.md',
        content: renderDeliveryReadme(profile),
        description: 'How to deliver managed-settings.json to the OS managed-settings path via Intune/Jamf',
      },
    ];
  }
}

/**
 * The non-wideable policy floor. Mirrors the always-on safety + credential
 * denies from `settings.local.json` (kept independent so that generator's
 * goldens are untouched) and tightens with the security tier and any PHI/PII
 * concern. Managed-settings denies cannot be relaxed by a developer's local
 * settings, so this is the true enterprise floor.
 */
function buildManagedSettings(profile: UserProfile): Record<string, unknown> {
  const tier = (profile.answers.get('REG_008')?.value as string) || 'balanced';
  const deny: string[] = [
    'Bash(rm -rf /)',
    'Bash(rm -rf /*)',
    'Bash(git push --force *)',
    'Bash(git push -f *)',
    'Bash(sudo *)',
    'Bash(chmod 777 *)',
    'Bash(curl * | bash)',
    'Bash(wget * | sh)',
    'Bash(mkfs *)',
    'Bash(dd if=*)',
    // Credentials are never writable, regardless of tier.
    'Read(**/.env)',
    'Read(**/.env.*)',
    'Read(**/credentials*)',
    'Read(**/secrets*)',
    'Read(**/*.pem)',
    'Read(**/*.key)',
    'Write(**/.env)',
    'Write(**/.env.*)',
    'Edit(**/.env)',
    'Edit(**/.env.*)',
  ];

  if (profile.securityConcerns.includes('phi')) {
    deny.push('Read(**/patient_data/**)', 'Read(**/phi/**)', 'Read(**/health_records/**)');
  }
  if (profile.securityConcerns.includes('pii')) {
    deny.push('Read(**/pii/**)', 'Read(**/personal_data/**)');
  }
  // Strict / lockdown tiers forbid raw network commands at the managed floor —
  // egress should route through the sandbox's corporate proxy instead.
  if (tier === 'strict' || tier === 'lockdown') {
    deny.push('Bash(curl *)', 'Bash(wget *)', 'Bash(ssh *)', 'Bash(scp *)');
  }

  return {
    sandbox: {
      // Require Claude Code's native OS sandbox (bubblewrap on Linux/WSL2,
      // Seatbelt on macOS) for every user; developers cannot disable it.
      enabled: true,
    },
    permissions: { deny },
  };
}

function renderDeliveryReadme(profile: UserProfile): string {
  const model = profile.devOps.isolationModel ?? '';
  return [
    '<!-- audience: public -->',
    '',
    '# Claude Code managed settings (enterprise enforcement)',
    '',
    '`managed-settings.json` is the **enterprise policy floor** for Claude Code.',
    'It requires the native OS sandbox for every user and pins a deny list that a',
    "developer's local `.claude/settings.json` **cannot widen**. It is delivered by",
    'your device-management platform — it is *not* a project setting and should not',
    'be committed into application repositories.',
    '',
    `Generated because your isolation posture is **\`${model}\`**.`,
    '',
    '## Deliver it to the OS managed-settings path',
    '',
    'Push the file to the per-OS location via Intune / Jamf / your MDM:',
    '',
    '| OS | Path |',
    '| --- | --- |',
    '| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |',
    '| Linux / WSL2 | `/etc/claude-code/managed-settings.json` |',
    '| Windows | `C:\\ProgramData\\ClaudeCode\\managed-settings.json` |',
    '',
    '## Notes',
    '',
    '- **Windows:** the native sandbox runs under **WSL2**. On Azure Virtual Desktop /',
    '  Windows 365, run Claude Code inside a WSL2 distro and deliver the managed file',
    '  to the WSL2 (Linux) path above.',
    '- **`"sandbox": { "enabled": true }`** requires sandboxing fleet-wide and prevents',
    '  developers from turning it off.',
    '- **Corporate proxy:** to route sandbox egress through your proxy (e.g. Zscaler /',
    '  ZPA), add your proxy settings to the managed file and distribute the proxy keys',
    '  the same way. Keep secrets out of the repo copy.',
    '- This pairs with the per-project `.claude/settings.json` / `settings.local.json`',
    '  EmbedIQ also generates: managed settings are the floor; project settings refine',
    '  the allow-list on top.',
    '',
    'See EmbedIQ\'s [isolation decision guide](https://github.com/asq-sheriff/embediq/blob/main/docs/evaluators/isolation-decision-guide.md)',
    'and the [Azure isolation runbook](https://github.com/asq-sheriff/embediq/blob/main/docs/operator-guide/azure-isolation-runbook.md).',
    '',
  ].join('\n');
}
