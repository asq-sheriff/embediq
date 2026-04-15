import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

export class SettingsLocalGenerator implements ConfigGenerator {
  name = 'settings.local.json';

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const settings: Record<string, unknown> = {};

    const permissions: Record<string, string[]> = { allow: [], deny: [] };

    // Security level determines permission strictness
    const secLevel = profile.answers.get('REG_008')?.value as string || 'balanced';

    // Allow rules
    if (secLevel === 'permissive') {
      permissions.allow = [
        'Bash(git *)',
        'Bash(npm *)',
        'Bash(npx *)',
        'Bash(docker *)',
        'Bash(make *)',
        'Bash(pytest *)',
        'Bash(go test *)',
        'Bash(cargo test *)',
        'Bash(curl *)',
        'Bash(ls *)',
        'Bash(cat *)',
        'Bash(grep *)',
        'Bash(find *)',
      ];
    } else if (secLevel === 'balanced') {
      permissions.allow = [
        'Bash(git status)',
        'Bash(git diff *)',
        'Bash(git log *)',
        'Bash(git branch *)',
        'Bash(npm test)',
        'Bash(npm run *)',
        'Bash(npx *)',
        'Bash(ls *)',
      ];
    } else if (secLevel === 'strict' || secLevel === 'lockdown') {
      permissions.allow = [
        'Bash(git status)',
        'Bash(git diff)',
        'Bash(git log *)',
        'Bash(ls *)',
      ];
    }

    // Deny rules — always include safety basics
    permissions.deny = [
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
    ];

    // Sensitive path deny rules
    if (profile.securityConcerns.includes('phi')) {
      permissions.deny.push(
        'Write(**/patient_data/**)',
        'Write(**/phi/**)',
        'Write(**/health_records/**)',
        'Edit(**/patient_data/**)',
        'Edit(**/phi/**)',
        'Edit(**/health_records/**)',
      );
    }

    if (profile.securityConcerns.includes('pii')) {
      permissions.deny.push(
        'Write(**/pii/**)',
        'Write(**/personal_data/**)',
        'Edit(**/pii/**)',
        'Edit(**/personal_data/**)',
      );
    }

    // Always deny writing to credential files
    permissions.deny.push(
      'Write(**/.env)',
      'Write(**/.env.*)',
      'Write(**/credentials*)',
      'Write(**/secrets*)',
      'Write(**/*.pem)',
      'Write(**/*.key)',
      'Edit(**/.env)',
      'Edit(**/.env.*)',
      'Edit(**/credentials*)',
      'Edit(**/secrets*)',
    );

    // Lockdown: deny network access
    if (secLevel === 'lockdown') {
      permissions.deny.push(
        'Bash(curl *)',
        'Bash(wget *)',
        'Bash(ssh *)',
        'Bash(scp *)',
      );
    }

    settings.permissions = permissions;

    return [{
      relativePath: '.claude/settings.local.json',
      content: JSON.stringify(settings, null, 2) + '\n',
      description: 'Permission allow/deny rules (local, gitignored)',
    }];
  }
}
