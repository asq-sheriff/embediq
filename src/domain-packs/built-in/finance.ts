import { Dimension, QuestionType, ConditionOperator } from '../../types/index.js';
import type { DomainPack } from '../index.js';

export const financePack: DomainPack = {
  id: 'finance',
  name: 'Finance (PCI-DSS/SOX/GLBA)',
  version: '1.0.0',
  description:
    'Domain pack for financial services covering PCI-DSS cardholder data protection, SOX financial controls, GLBA consumer privacy, and AML/BSA compliance requirements.',

  questions: [
    {
      id: 'FIN_D001',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Does your application process, store, or transmit cardholder data (credit/debit card numbers)?',
      helpText:
        'Cardholder data includes primary account numbers (PAN), cardholder names, expiration dates, and service codes. If your system touches any of these, PCI-DSS applies.',
      type: QuestionType.YES_NO,
      required: true,
      order: 210,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['finance', 'fintech', 'banking', 'insurance', 'ecommerce'],
        },
        {
          questionId: 'REG_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['pci_dss', 'cardholder_data', 'sensitive_data', 'finance'],
    },
    {
      id: 'FIN_D002',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'What types of financial data does your application handle?',
      helpText:
        'Select all financial data categories that your system processes. This determines which specific compliance controls are required.',
      type: QuestionType.MULTI_CHOICE,
      options: [
        { key: 'pan', label: 'Primary Account Numbers (PAN)', description: 'Credit/debit card numbers' },
        { key: 'bank_account', label: 'Bank Account Numbers', description: 'Checking/savings account and routing numbers' },
        { key: 'ssn_tin', label: 'SSN / TIN', description: 'Social Security or Tax Identification Numbers' },
        { key: 'trading', label: 'Trading Data', description: 'Securities, equities, and derivatives data' },
        { key: 'aml', label: 'AML / KYC Records', description: 'Anti-money laundering and know-your-customer data' },
        { key: 'loan', label: 'Loan / Mortgage Data', description: 'Consumer lending and mortgage information' },
      ],
      required: true,
      order: 211,
      showConditions: [
        {
          questionId: 'FIN_D001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['pci_dss', 'financial_data', 'data_classification', 'finance'],
    },
    {
      id: 'FIN_D003',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Does your organization need to comply with Sarbanes-Oxley (SOX) requirements for financial reporting and internal controls?',
      helpText:
        'SOX applies to publicly traded companies and requires internal controls over financial reporting, change management audit trails, and separation of duties.',
      type: QuestionType.YES_NO,
      required: false,
      order: 212,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['finance', 'fintech', 'banking', 'insurance'],
        },
      ],
      tags: ['sox', 'financial_controls', 'change_management', 'compliance', 'finance'],
    },
    {
      id: 'FIN_D004',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Does your application handle consumer financial information subject to GLBA privacy requirements?',
      helpText:
        'The Gramm-Leach-Bliley Act requires financial institutions to explain their information-sharing practices and to safeguard sensitive consumer data.',
      type: QuestionType.YES_NO,
      required: false,
      order: 213,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['finance', 'fintech', 'banking', 'insurance'],
        },
      ],
      tags: ['glba', 'consumer_privacy', 'financial_data', 'compliance', 'finance'],
    },
    {
      id: 'FIN_D005',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Does your application involve cryptocurrency, digital assets, or blockchain-based financial instruments?',
      helpText:
        'Cryptocurrency and digital asset platforms must comply with FinCEN regulations, the Travel Rule, and state-level money transmitter licensing.',
      type: QuestionType.YES_NO,
      required: false,
      order: 214,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['finance', 'fintech'],
        },
      ],
      tags: ['crypto', 'digital_assets', 'fincen', 'travel_rule', 'finance'],
    },
  ],

  complianceFrameworks: [
    {
      key: 'sox',
      label: 'SOX',
      description:
        'Sarbanes-Oxley Act compliance for financial reporting integrity, internal controls, and change management audit trails.',
    },
    {
      key: 'glba',
      label: 'GLBA',
      description:
        'Gramm-Leach-Bliley Act requirements for safeguarding consumer financial information and privacy notices.',
    },
    {
      key: 'aml-bsa',
      label: 'AML/BSA',
      description:
        'Bank Secrecy Act and Anti-Money Laundering regulations including suspicious activity reporting and customer due diligence.',
    },
    {
      key: 'finra',
      label: 'FINRA',
      description:
        'Financial Industry Regulatory Authority rules governing broker-dealer conduct, communications, and recordkeeping.',
    },
  ],

  priorityCategories: {
    'Financial Data Protection': [
      'pci_dss',
      'cardholder_data',
      'sensitive_data',
      'financial_data',
      'data_classification',
    ],
    'Regulatory Controls': [
      'sox',
      'glba',
      'compliance',
      'change_management',
      'financial_controls',
      'fincen',
    ],
  },

  dlpPatterns: [
    {
      name: 'Primary Account Number (PAN)',
      pattern: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b',
      severity: 'CRITICAL',
      description: 'Detects Visa, Mastercard, Amex, and Discover credit/debit card numbers in source code or configuration files.',
      requiresFramework: 'pci-dss',
    },
    {
      name: 'ABA Routing Number',
      pattern: '\\b(?:0[0-9]|1[0-2]|2[1-9]|3[0-2]|6[1-9]|7[0-2]|80)[0-9]{7}\\b',
      severity: 'CRITICAL',
      description: 'Detects 9-digit ABA routing transit numbers used for ACH and wire transfers.',
    },
    {
      name: 'SWIFT/BIC Code',
      pattern: '\\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b',
      severity: 'HIGH',
      description: 'Detects SWIFT/BIC codes used for international bank identification in wire transfers.',
    },
    {
      name: 'IBAN',
      pattern: '\\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}(?:[A-Z0-9]{0,18})\\b',
      severity: 'CRITICAL',
      description: 'Detects International Bank Account Numbers used across 80+ countries for cross-border transactions.',
    },
    {
      name: 'Employer Identification Number (EIN)',
      pattern: '\\b[0-9]{2}-[0-9]{7}\\b',
      severity: 'CRITICAL',
      description: 'Detects US Employer Identification Numbers (federal tax IDs) assigned by the IRS.',
    },
    {
      name: 'CVV/CVC',
      pattern: '\\b(?:cvv|cvc|cvv2|cvc2|security.?code)\\s*[:=]\\s*["\']?[0-9]{3,4}["\']?\\b',
      severity: 'CRITICAL',
      description: 'Detects card verification values hard-coded in source or config. CVV storage is strictly prohibited by PCI-DSS.',
      requiresFramework: 'pci-dss',
    },
  ],

  ruleTemplates: [
    {
      filename: 'pci-dss-cardholder.md',
      pathScope: ['src/', 'lib/', 'app/'],
      content: `# PCI-DSS Cardholder Data Protection Rules

## Scope
These rules apply to all code that processes, stores, or transmits cardholder data (CHD)
and sensitive authentication data (SAD) as defined by PCI-DSS v4.0.

## Mandatory Controls

1. **Never store sensitive authentication data after authorization** — this includes
   full track data, CAV2/CVC2/CVV2/CID values, and PIN/PIN blocks. No exceptions.

2. **Mask PAN when displayed** — show at most the first six and last four digits.
   Any display of more than BIN + last-four requires documented business justification.

3. **Render PAN unreadable anywhere it is stored** — use strong one-way hashes (SHA-256
   with salt), truncation, index tokens, or strong cryptography (AES-256) with proper
   key management processes.

4. **Encrypt cardholder data in transit over open networks** — use TLS 1.2+ for all
   transmissions. Never send PAN via end-user messaging (email, chat, SMS).

5. **Restrict access to cardholder data by business need-to-know** — implement RBAC
   and deny-all default policies. Log all access to CHD environments.

6. **Maintain an inventory of all systems in the CDE** — document data flows showing
   where CHD is received, processed, stored, and transmitted.

7. **Never hard-code credentials, keys, or PANs in source code** — use vault-based
   secret management and rotate keys according to your crypto-period policy.
`,
      requiresFramework: 'pci-dss',
    },
    {
      filename: 'sox-controls.md',
      pathScope: ['src/', 'lib/', 'app/', 'scripts/', 'infra/'],
      content: `# SOX Internal Controls for Software Development

## Scope
These rules enforce Sarbanes-Oxley Section 404 internal controls over IT systems
that affect financial reporting integrity.

## Mandatory Controls

1. **Separation of duties** — developers must not have the ability to promote their
   own code to production. All deployments require approval from a different individual
   with documented authorization.

2. **Change management audit trail** — every code change must reference an approved
   change request. Commit messages must include ticket IDs. Direct commits to
   production branches are prohibited.

3. **Access reviews** — system and repository access must be reviewed quarterly.
   Privileged accounts require documented justification and approval from management.

4. **Evidence retention** — deployment logs, approval records, code review artifacts,
   and test results must be retained for a minimum of 7 years.

5. **Automated testing gates** — no code may merge without passing automated tests
   that validate financial calculation accuracy and data integrity constraints.

6. **Environment segregation** — development, staging, and production environments
   must be logically separated. Production data must never be used in non-production
   environments without masking/anonymization.

7. **Incident response documentation** — all production incidents affecting financial
   systems must be documented with root cause analysis and remediation evidence.
`,
      requiresFramework: 'sox',
    },
    {
      filename: 'glba-privacy.md',
      pathScope: ['src/', 'lib/', 'app/'],
      content: `# GLBA Privacy and Safeguards Rules

## Scope
These rules implement the Gramm-Leach-Bliley Act Safeguards Rule requirements for
protecting nonpublic personal information (NPI) of consumers.

## Mandatory Controls

1. **Designate a qualified individual** — someone must be responsible for the
   information security program. Code must support role-based access that enforces
   this accountability chain.

2. **Encrypt NPI at rest and in transit** — all consumer financial data (account
   numbers, income, credit history, SSN, tax data) must use AES-256 encryption at
   rest and TLS 1.2+ in transit.

3. **Implement access controls** — apply least-privilege principles to all systems
   handling NPI. Authenticate and authorize every access request. Multi-factor
   authentication is required for any system accessing NPI.

4. **Monitor and log access** — maintain comprehensive audit logs of who accessed NPI,
   when, and for what purpose. Logs must be tamper-resistant and retained per your
   retention schedule.

5. **Data disposal** — implement secure deletion procedures for NPI that is no longer
   needed. Use cryptographic erasure or NIST 800-88 compliant methods.

6. **Third-party oversight** — code integrating with third-party services must validate
   that partners maintain equivalent safeguards. API connections must use mutual TLS
   or equivalent authentication.

7. **Privacy notice compliance** — systems must support generating and delivering
   initial and annual privacy notices to consumers as required by the Privacy Rule.
   Opt-out mechanisms must be functional and auditable.
`,
      requiresFramework: 'glba',
    },
  ],

  ignorePatterns: [
    '# Finance domain sensitive directories',
    'cardholder_data/',
    'pan_vault/',
    'financial_reports/',
    'audit_trail/',
    'kyc_documents/',
    'aml_screening/',
  ],

  validationChecks: [
    {
      name: 'PAN detection in DLP configuration',
      severity: 'error',
      check: (files, _profile) => {
        const dlpFile = files.find(
          (f) => f.relativePath.includes('dlp') || f.content.includes('dlpPattern')
        );
        return dlpFile ? dlpFile.content.includes('PAN') || dlpFile.content.includes('Primary Account Number') : false;
      },
      failureMessage:
        'PCI-DSS requires DLP rules that detect Primary Account Numbers (PAN). No PAN detection pattern was found in the generated configuration.',
      requiresFramework: 'pci-dss',
    },
    {
      name: 'CVV storage prohibition rule',
      severity: 'error',
      check: (files, _profile) => {
        const ruleFiles = files.filter(
          (f) => f.relativePath.endsWith('.md') && f.relativePath.includes('rule')
        );
        return ruleFiles.some(
          (f) => f.content.includes('CVV') || f.content.includes('CVC') || f.content.includes('sensitive authentication data')
        );
      },
      failureMessage:
        'PCI-DSS strictly prohibits storing CVV/CVC values after authorization. No rule was found enforcing this prohibition.',
      requiresFramework: 'pci-dss',
    },
    {
      name: 'Audit logging requirement for SOX',
      severity: 'error',
      check: (files, _profile) => {
        const allContent = files.map((f) => f.content).join('\n');
        return (
          allContent.includes('audit') &&
          (allContent.includes('change management') || allContent.includes('separation of duties'))
        );
      },
      failureMessage:
        'SOX Section 404 requires audit logging and change management controls. The generated configuration does not include adequate audit trail provisions.',
      requiresFramework: 'sox',
    },
  ],
};
