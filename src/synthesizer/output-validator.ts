import type { GeneratedFile, UserProfile, ValidationCheck, ValidationResult } from '../types/index.js';
import type { DomainPack } from '../domain-packs/index.js';

export function validateOutput(
  files: GeneratedFile[],
  profile: UserProfile,
  domainPack?: DomainPack,
): ValidationResult {
  const checks: ValidationCheck[] = [];

  const findFile = (partial: string) =>
    files.find(f => f.relativePath.toLowerCase().includes(partial.toLowerCase()));

  const fileContains = (partial: string, needle: string) => {
    const file = findFile(partial);
    return file ? file.content.includes(needle) : false;
  };

  // === UNIVERSAL CHECKS ===

  checks.push({
    name: 'Core: CLAUDE.md present',
    passed: !!findFile('CLAUDE.md'),
    severity: 'error',
    message: 'CLAUDE.md is the root configuration file and must always be generated',
  });

  checks.push({
    name: 'Core: settings.json present',
    passed: !!findFile('settings.json'),
    severity: 'error',
    message: '.claude/settings.json is required for hook and permission registration',
  });

  if (!['ba', 'pm', 'executive'].includes(profile.role)) {
    checks.push({
      name: 'Core: command-guard.py present',
      passed: !!findFile('command-guard'),
      severity: 'error',
      message: 'Command guard hook is required for all technical role configurations',
    });
  }

  // === HIPAA CHECKS ===

  if (profile.complianceFrameworks.includes('hipaa')) {
    checks.push({
      name: 'HIPAA: DLP scanner present',
      passed: !!findFile('dlp-scanner'),
      severity: 'error',
      message: 'HIPAA requires DLP scanning for PHI detection',
    });

    checks.push({
      name: 'HIPAA: SSN pattern in DLP scanner',
      passed: fileContains('dlp-scanner', 'd{3}-') && fileContains('dlp-scanner', 'd{2}-') && fileContains('dlp-scanner', 'd{4}'),
      severity: 'error',
      message: 'HIPAA DLP scanner must detect Social Security Numbers',
    });

    checks.push({
      name: 'HIPAA: Medical Record Number pattern in DLP scanner',
      passed: fileContains('dlp-scanner', 'MRN') || fileContains('dlp-scanner', 'medical_record'),
      severity: 'error',
      message: 'HIPAA DLP scanner must detect Medical Record Numbers',
    });

    checks.push({
      name: 'HIPAA: Compliance rule file present',
      passed: !!findFile('hipaa-compliance'),
      severity: 'error',
      message: 'HIPAA compliance rule file (.claude/rules/hipaa-compliance.md) is required',
    });

    checks.push({
      name: 'HIPAA: Audit logging present',
      passed: !!findFile('audit-logger'),
      severity: 'warning',
      message: 'Audit logging is strongly recommended for HIPAA compliance but not strictly required',
    });

    checks.push({
      name: 'HIPAA: PHI directories in .claudeignore',
      passed: fileContains('.claudeignore', 'phi') || fileContains('.claudeignore', 'patient'),
      severity: 'warning',
      message: 'PHI-related directories should be excluded from Claude context via .claudeignore',
    });
  }

  // === PCI-DSS CHECKS ===

  if (profile.complianceFrameworks.includes('pci') || profile.complianceFrameworks.includes('pci-dss')) {
    checks.push({
      name: 'PCI-DSS: DLP scanner present',
      passed: !!findFile('dlp-scanner'),
      severity: 'error',
      message: 'PCI-DSS requires DLP scanning for cardholder data detection',
    });

    checks.push({
      name: 'PCI-DSS: Credit card pattern in DLP scanner',
      passed: fileContains('dlp-scanner', 'credit') || fileContains('dlp-scanner', '4[0-9]{12}'),
      severity: 'error',
      message: 'PCI-DSS DLP scanner must detect credit card numbers',
    });

    checks.push({
      name: 'PCI-DSS: Compliance rule file present',
      passed: !!findFile('pci-compliance'),
      severity: 'error',
      message: 'PCI-DSS compliance rule file is required',
    });
  }

  // === SOC2 CHECKS ===

  if (profile.complianceFrameworks.includes('soc2')) {
    checks.push({
      name: 'SOC2: Audit logging present',
      passed: !!findFile('audit-logger'),
      severity: 'error',
      message: 'SOC2 requires audit logging for all tool actions',
    });
  }

  // === GDPR CHECKS ===

  if (profile.complianceFrameworks.includes('gdpr')) {
    checks.push({
      name: 'GDPR: DLP scanner present',
      passed: !!findFile('dlp-scanner'),
      severity: 'error',
      message: 'GDPR requires DLP scanning for personal data detection',
    });
  }

  // === SECURITY CHECKS ===

  if (profile.securityConcerns.length > 0) {
    checks.push({
      name: 'Security: Security rule file present',
      passed: !!findFile('security.md'),
      severity: 'warning',
      message: 'Security concerns detected but no security rule file generated',
    });
  }

  const hasEgressConcern = profile.securityConcerns.some(
    c => c.includes('egress') || c.includes('network'),
  );
  if (hasEgressConcern) {
    checks.push({
      name: 'Egress: Network egress guard present',
      passed: !!findFile('egress-guard'),
      severity: 'error',
      message: 'Network egress controls were requested but no egress guard hook was generated',
    });
  }

  // === DOMAIN PACK CHECKS ===

  if (domainPack?.validationChecks) {
    for (const check of domainPack.validationChecks) {
      if (
        !check.requiresFramework ||
        profile.complianceFrameworks.includes(check.requiresFramework)
      ) {
        checks.push({
          name: check.name,
          passed: check.check(files, profile),
          severity: check.severity,
          message: check.failureMessage,
        });
      }
    }
  }

  // === COMPILE RESULTS ===

  const errorCount = checks.filter(c => c.severity === 'error' && !c.passed).length;
  const warningCount = checks.filter(c => c.severity === 'warning' && !c.passed).length;
  const totalChecks = checks.length;

  return {
    passed: errorCount === 0,
    checks,
    summary: errorCount === 0
      ? `All ${totalChecks} validation checks passed${warningCount > 0 ? ` (${warningCount} warnings)` : ''}`
      : `${errorCount} critical errors, ${warningCount} warnings out of ${totalChecks} checks`,
  };
}
