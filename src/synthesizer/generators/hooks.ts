import type { ConfigGenerator } from '../generator.js';
import type { SetupConfig, GeneratedFile } from '../../types/index.js';

export class HooksGenerator implements ConfigGenerator {
  name = 'hooks';

  generate(config: SetupConfig): GeneratedFile[] {
    const { profile } = config;
    const files: GeneratedFile[] = [];

    // DLP Scanner — scans for sensitive data patterns
    if (profile.securityConcerns.includes('dlp') ||
        profile.securityConcerns.includes('phi') ||
        profile.securityConcerns.includes('pii') ||
        profile.securityConcerns.includes('secret_scanning')) {
      files.push({
        relativePath: '.claude/hooks/dlp-scanner.py',
        content: this.generateDlpScanner(config),
        description: 'DLP scanner hook — detects PHI/PII/secrets in tool inputs',
      });
    }

    // Command guard — blocks dangerous shell commands
    files.push({
      relativePath: '.claude/hooks/command-guard.py',
      content: this.generateCommandGuard(),
      description: 'Command guard hook — blocks dangerous shell commands',
    });

    // Audit logger
    if (profile.securityConcerns.includes('session_audit_trail') ||
        profile.securityConcerns.includes('audit_logging')) {
      files.push({
        relativePath: '.claude/hooks/audit-logger.py',
        content: this.generateAuditLogger(config),
        description: 'Audit logger hook — logs all tool actions',
      });
    }

    // Network egress guard
    if (profile.securityConcerns.includes('network_egress')) {
      files.push({
        relativePath: '.claude/hooks/egress-guard.py',
        content: this.generateEgressGuard(),
        description: 'Network egress guard — restricts external network access',
      });
    }

    return files;
  }

  private generateDlpScanner(config: SetupConfig): string {
    const { profile } = config;
    const patterns: string[] = [];

    // Always include basic patterns
    patterns.push(`    # API keys and tokens`);
    patterns.push(`    (r'(?:api[_-]?key|token|secret)[\\s]*[=:][\\s]*["\\'\\']?[a-zA-Z0-9_\\-]{20,}', 'CRITICAL', 'API key or token detected'),`);
    patterns.push(`    (r'(?:AKIA|ABIA|ACCA)[A-Z0-9]{16}', 'CRITICAL', 'AWS access key detected'),`);
    patterns.push(`    (r'-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----', 'CRITICAL', 'Private key detected'),`);

    if (profile.securityConcerns.includes('phi') || profile.securityConcerns.includes('pii')) {
      patterns.push(`    # PII/PHI patterns`);
      patterns.push(`    (r'\\\\b\\\\d{3}-\\\\d{2}-\\\\d{4}\\\\b', 'CRITICAL', 'Social Security Number detected'),`);
      patterns.push(`    (r'\\\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\\\b', 'CRITICAL', 'Credit card number detected'),`);
    }

    if (profile.securityConcerns.includes('phi')) {
      patterns.push(`    # PHI-specific patterns`);
      patterns.push(`    (r'\\\\b(?:MRN|mrn|Medical Record)[\\s#:-]*\\\\d{5,}\\\\b', 'CRITICAL', 'Medical Record Number detected'),`);
      patterns.push(`    (r'\\\\b(?:patient[_\\s]?(?:name|id|dob))[\\s]*[=:]', 'HIGH', 'Patient data field detected'),`);
    }

    // Custom patterns from REG_012b
    const customPatterns = profile.answers.get('REG_012b')?.value;
    if (typeof customPatterns === 'string' && customPatterns.trim()) {
      patterns.push(`    # Custom patterns`);
      for (const line of customPatterns.split('\n').filter(Boolean)) {
        patterns.push(`    (r'${line.trim()}', 'HIGH', 'Custom pattern match'),`);
      }
    }

    // Domain pack DLP patterns
    if (config.domainPack?.dlpPatterns) {
      patterns.push(`    # ${config.domainPack.name} domain patterns`);
      for (const dp of config.domainPack.dlpPatterns) {
        if (
          !dp.requiresFramework ||
          profile.complianceFrameworks.includes(dp.requiresFramework)
        ) {
          patterns.push(`    (r'${dp.pattern}', '${dp.severity}', '${dp.description}'),`);
        }
      }
    }

    return `#!/usr/bin/env python3
"""DLP Scanner — Detects sensitive data patterns in Claude Code tool inputs.
Reads tool input from stdin (JSON), scans for PHI/PII/secrets.
Exit code 2 = BLOCK (critical match found).
Exit code 1 = WARN (suspicious pattern found).
Exit code 0 = PASS.
"""
import sys
import json
import re

PATTERNS = [
${patterns.join('\n')}
]

def scan(text: str) -> tuple[int, list[str]]:
    findings = []
    max_severity = 0
    for pattern, severity, description in PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            findings.append(f"[{severity}] {description}")
            if severity == 'CRITICAL':
                max_severity = 2
            elif severity == 'HIGH' and max_severity < 2:
                max_severity = 1
    return max_severity, findings

def main():
    try:
        data = json.load(sys.stdin)
        tool_input = json.dumps(data.get('tool_input', data), default=str)
        exit_code, findings = scan(tool_input)

        if findings:
            print("DLP SCAN RESULTS:", file=sys.stderr)
            for f in findings:
                print(f"  {f}", file=sys.stderr)

        sys.exit(exit_code)
    except Exception as e:
        print(f"DLP scanner error: {e}", file=sys.stderr)
        sys.exit(0)  # Don't block on scanner errors

if __name__ == '__main__':
    main()
`;
  }

  private generateCommandGuard(): string {
    return `#!/usr/bin/env python3
"""Command Guard — Blocks dangerous shell commands.
Exit code 2 = BLOCK.
Exit code 0 = PASS.
"""
import sys
import json
import re

BLOCKED_PATTERNS = [
    r'rm\\s+-rf\\s+/',
    r'rm\\s+-rf\\s+/\\*',
    r'git\\s+push\\s+--force',
    r'git\\s+push\\s+-f\\s',
    r'sudo\\s+',
    r'chmod\\s+777',
    r'curl.*\\|.*bash',
    r'wget.*\\|.*sh',
    r'mkfs\\s+',
    r'dd\\s+if=',
    r':(){ :|:& };:',
    r'> /dev/sd',
]

def main():
    try:
        data = json.load(sys.stdin)
        tool_input = data.get('tool_input', {})
        command = tool_input.get('command', '') if isinstance(tool_input, dict) else str(tool_input)

        for pattern in BLOCKED_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                print(f"BLOCKED: Dangerous command detected matching pattern: {pattern}", file=sys.stderr)
                sys.exit(2)

        sys.exit(0)
    except Exception as e:
        print(f"Command guard error: {e}", file=sys.stderr)
        sys.exit(0)

if __name__ == '__main__':
    main()
`;
  }

  private generateAuditLogger(config: SetupConfig): string {
    const logDest = config.profile.answers.get('REG_014a')?.value as string || 'local_file';

    return `#!/usr/bin/env python3
"""Audit Logger — Logs all Claude Code tool actions for compliance.
Log destination: ${logDest}
"""
import sys
import json
import os
from datetime import datetime, timezone

LOG_DIR = os.path.join(os.environ.get('CLAUDE_PROJECT_DIR', '.'), '.claude', 'logs')

def main():
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        data = json.load(sys.stdin)

        log_entry = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'user': os.environ.get('USER', 'unknown'),
            'tool': data.get('tool_name', 'unknown'),
            'tool_input_summary': _summarize_input(data.get('tool_input', {})),
            'session_id': os.environ.get('CLAUDE_SESSION_ID', 'unknown'),
        }

        log_file = os.path.join(LOG_DIR, f"audit-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.jsonl")
        with open(log_file, 'a') as f:
            f.write(json.dumps(log_entry) + '\\n')

    except Exception as e:
        print(f"Audit logger error: {e}", file=sys.stderr)

    sys.exit(0)  # Never block

def _summarize_input(tool_input):
    """Summarize tool input without including sensitive content."""
    if isinstance(tool_input, dict):
        summary = {}
        for key, value in tool_input.items():
            if key in ('command', 'file_path', 'pattern'):
                summary[key] = str(value)[:200]
            else:
                summary[key] = f"[{type(value).__name__}, {len(str(value))} chars]"
        return summary
    return f"[{type(tool_input).__name__}]"

if __name__ == '__main__':
    main()
`;
  }

  private generateEgressGuard(): string {
    return `#!/usr/bin/env python3
"""Egress Guard — Restricts network access from Claude Code Bash commands.
Blocks curl, wget, ssh, scp to non-approved destinations.
Exit code 2 = BLOCK.
"""
import sys
import json
import re

# Add approved domains here
APPROVED_DOMAINS = [
    'github.com',
    'api.github.com',
    'registry.npmjs.org',
    'pypi.org',
]

NETWORK_COMMANDS = ['curl', 'wget', 'ssh', 'scp', 'nc', 'ncat', 'telnet']

def main():
    try:
        data = json.load(sys.stdin)
        tool_input = data.get('tool_input', {})
        command = tool_input.get('command', '') if isinstance(tool_input, dict) else str(tool_input)

        for net_cmd in NETWORK_COMMANDS:
            if re.search(rf'\\b{net_cmd}\\b', command):
                # Check if destination is in approved list
                if not any(domain in command for domain in APPROVED_DOMAINS):
                    print(f"BLOCKED: Network command '{net_cmd}' to unapproved destination", file=sys.stderr)
                    print(f"Approved domains: {', '.join(APPROVED_DOMAINS)}", file=sys.stderr)
                    sys.exit(2)

        sys.exit(0)
    except Exception as e:
        print(f"Egress guard error: {e}", file=sys.stderr)
        sys.exit(0)

if __name__ == '__main__':
    main()
`;
  }
}
