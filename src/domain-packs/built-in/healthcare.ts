import { Dimension, QuestionType, ConditionOperator } from '../../types/index.js';
import type { DomainPack } from '../index.js';

export const healthcarePack: DomainPack = {
  id: 'healthcare',
  name: 'Healthcare (HIPAA/HITECH)',
  version: '1.0.0',
  description:
    'Domain pack for healthcare software projects subject to HIPAA, HITECH, and FDA regulations. ' +
    'Adds PHI-handling questions, DLP patterns for medical identifiers, compliance rule templates, ' +
    'and validation checks for protected health information governance.',

  questions: [
    {
      id: 'HC_001',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Does your system process any of the 18 HIPAA identifiers (names, dates, SSNs, MRNs, etc.)?',
      helpText:
        'The HIPAA Privacy Rule defines 18 categories of protected health information (PHI). ' +
        'If your system stores, transmits, or processes any of these identifiers in connection ' +
        'with health data, HIPAA requirements apply.',
      type: QuestionType.YES_NO,
      required: true,
      order: 200,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['healthcare', 'health_tech', 'pharma'],
        },
        {
          questionId: 'REG_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['hipaa', 'phi', 'identifiers', 'sensitive_data', 'healthcare'],
    },
    {
      id: 'HC_002',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Which categories of PHI does your system handle?',
      helpText:
        'Select all categories of protected health information that flow through your system. ' +
        'This determines which DLP patterns and access controls will be configured.',
      type: QuestionType.MULTI_CHOICE,
      options: [
        { key: 'demographics', label: 'Demographics', description: 'Names, addresses, dates of birth, contact information' },
        { key: 'clinical', label: 'Clinical', description: 'Diagnoses, lab results, medications, treatment plans' },
        { key: 'insurance', label: 'Insurance', description: 'Plan IDs, claims, coverage details, beneficiary numbers' },
        { key: 'genomic', label: 'Genomic', description: 'Genetic test results, DNA sequences, biomarker data' },
        { key: 'mental_health', label: 'Mental Health', description: 'Psychotherapy notes, substance abuse records (42 CFR Part 2)' },
        { key: 'imaging', label: 'Imaging', description: 'DICOM images, radiology reports, pathology slides' },
      ],
      required: true,
      order: 201,
      showConditions: [
        {
          questionId: 'HC_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['hipaa', 'phi', 'data_classification', 'healthcare'],
    },
    {
      id: 'HC_003',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Do you require a Business Associate Agreement (BAA) for third-party tools that may access PHI?',
      helpText:
        'Under HIPAA, any third-party service that creates, receives, maintains, or transmits PHI ' +
        'on your behalf must sign a BAA. This includes cloud providers, analytics platforms, and AI tools.',
      type: QuestionType.YES_NO,
      required: true,
      order: 202,
      showConditions: [
        {
          questionId: 'HC_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['hipaa', 'baa', 'compliance', 'third_party', 'healthcare'],
    },
    {
      id: 'HC_004',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Does your organization need to comply with HITECH breach notification requirements?',
      helpText:
        'The HITECH Act requires covered entities and business associates to notify affected individuals, ' +
        'HHS, and in some cases the media, following a breach of unsecured PHI.',
      type: QuestionType.YES_NO,
      required: false,
      order: 203,
      showConditions: [
        {
          questionId: 'HC_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['hitech', 'breach_notification', 'compliance', 'healthcare'],
    },
    {
      id: 'HC_005',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Which HL7 FHIR or healthcare interoperability standards does your system use?',
      helpText:
        'Select all healthcare data exchange standards your system implements. ' +
        'This determines which interoperability rules and validation patterns are generated.',
      type: QuestionType.MULTI_CHOICE,
      options: [
        { key: 'fhir_r4', label: 'FHIR R4', description: 'HL7 FHIR Release 4 (current stable standard)' },
        { key: 'fhir_r5', label: 'FHIR R5', description: 'HL7 FHIR Release 5 (latest release)' },
        { key: 'hl7v2', label: 'HL7 v2', description: 'HL7 Version 2.x messaging (ADT, ORM, ORU, etc.)' },
        { key: 'cda', label: 'CDA', description: 'Clinical Document Architecture (C-CDA, CCD)' },
        { key: 'dicom', label: 'DICOM', description: 'Digital Imaging and Communications in Medicine' },
        { key: 'x12', label: 'X12', description: 'ANSI X12 EDI transactions (837, 835, 270/271)' },
        { key: 'none', label: 'None', description: 'No interoperability standards currently in use' },
      ],
      required: false,
      order: 204,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['healthcare', 'health_tech'],
        },
      ],
      tags: ['interoperability', 'fhir', 'hl7', 'healthcare', 'standards'],
    },
    {
      id: 'HC_006',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Is your software classified as a Software as a Medical Device (SaMD) under FDA regulation?',
      helpText:
        'The FDA regulates software intended for medical purposes (diagnosis, treatment, prevention). ' +
        'SaMD classification triggers additional validation, documentation, and quality system requirements.',
      type: QuestionType.YES_NO,
      required: false,
      order: 205,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['healthcare', 'health_tech', 'pharma'],
        },
      ],
      tags: ['fda', 'samd', 'medical_device', 'validation', 'healthcare'],
    },
  ],

  complianceFrameworks: [
    {
      key: 'hipaa',
      label: 'HIPAA',
      description:
        'Health Insurance Portability and Accountability Act — Privacy, Security, and Breach Notification Rules ' +
        'governing the use and disclosure of protected health information (PHI).',
    },
    {
      key: 'hitech',
      label: 'HITECH Act',
      description:
        'Health Information Technology for Economic and Clinical Health Act — strengthens HIPAA enforcement, ' +
        'mandates breach notification, and promotes electronic health record adoption.',
    },
    {
      key: '42cfr_part2',
      label: '42 CFR Part 2',
      description:
        'Federal regulations providing additional privacy protections for substance use disorder patient records, ' +
        'requiring explicit patient consent for most disclosures beyond standard HIPAA provisions.',
    },
  ],

  priorityCategories: {
    'Healthcare Data Governance': [
      'hipaa',
      'phi',
      'data_classification',
      'sensitive_data',
      'identifiers',
      'baa',
    ],
    'Clinical Interoperability': [
      'interoperability',
      'fhir',
      'hl7',
      'standards',
      'dicom',
    ],
    'Regulatory Validation': [
      'fda',
      'samd',
      'medical_device',
      'validation',
      'breach_notification',
      'compliance',
    ],
  },

  dlpPatterns: [
    {
      name: 'Medical Record Number (MRN)',
      pattern: '\\b(?:MRN|Med\\s*Rec)\\s*[:#]?\\s*\\d{6,10}\\b',
      severity: 'CRITICAL',
      description: 'Detects medical record numbers which are direct patient identifiers under HIPAA.',
      requiresFramework: 'hipaa',
    },
    {
      name: 'Health Plan Beneficiary Number',
      pattern: '\\b(?:HPBN|Beneficiary|Member\\s*ID)\\s*[:#]?\\s*[A-Z0-9]{8,15}\\b',
      severity: 'CRITICAL',
      description: 'Detects health plan beneficiary and member ID numbers used in insurance claims.',
      requiresFramework: 'hipaa',
    },
    {
      name: 'ICD-10 Code with Patient Context',
      pattern: '\\b(?:patient|dx|diagnosis)\\s*[:#]?\\s*[A-TV-Z]\\d{2}\\.?\\d{0,4}\\b',
      severity: 'HIGH',
      description:
        'Detects ICD-10 diagnosis codes when appearing alongside patient-identifying context, ' +
        'which constitutes PHI when linked to an individual.',
      requiresFramework: 'hipaa',
    },
    {
      name: 'DEA Number',
      pattern: '\\b[ABFGMPRabfgmpr][A-Za-z]\\d{7}\\b',
      severity: 'CRITICAL',
      description:
        'Detects Drug Enforcement Administration registration numbers assigned to prescribers. ' +
        'Exposure can enable prescription fraud.',
      requiresFramework: 'hipaa',
    },
    {
      name: 'NPI Number',
      pattern: '\\b(?:NPI|Natl\\s*Provider)\\s*[:#]?\\s*\\d{10}\\b',
      severity: 'HIGH',
      description:
        'Detects National Provider Identifier numbers. While NPIs are publicly available, ' +
        'their presence in code may indicate hardcoded provider references.',
      requiresFramework: 'hipaa',
    },
    {
      name: 'FHIR Patient Resource ID',
      pattern: '\\bPatient\\/[A-Za-z0-9\\-]{1,64}\\b',
      severity: 'HIGH',
      description:
        'Detects FHIR Patient resource references (e.g., Patient/abc-123). ' +
        'These are direct links to patient records in FHIR-based systems.',
    },
  ],

  ruleTemplates: [
    {
      filename: 'hipaa-phi-handling.md',
      pathScope: ['src/', 'lib/', 'app/'],
      requiresFramework: 'hipaa',
      content: `# HIPAA Protected Health Information Handling

## Purpose
All code that creates, receives, stores, or transmits protected health information (PHI)
must comply with the HIPAA Privacy and Security Rules (45 CFR Parts 160, 162, and 164).

## Requirements

### Minimum Necessary Standard
- Access only the minimum PHI required for the intended purpose.
- Never log, print, or expose full patient records when a subset of fields suffices.
- Implement field-level access controls where possible.

### PHI at Rest
- Encrypt all PHI at rest using AES-256 or equivalent (NIST SP 800-111).
- Store encryption keys separately from encrypted data, ideally in a hardware security module (HSM).
- Never commit PHI, test patient data, or encryption keys to version control.

### PHI in Transit
- Use TLS 1.2 or higher for all network transmissions containing PHI.
- Validate server certificates; do not disable certificate verification.
- Use mutual TLS (mTLS) for service-to-service communication carrying PHI.

### Audit Controls
- Log all access to PHI with timestamp, user identity, action, and resource accessed.
- Retain audit logs for a minimum of six years per HIPAA requirements.
- Audit logs themselves must not contain the PHI that was accessed.

### De-identification
- When PHI is not required, use Safe Harbor or Expert Determination methods (45 CFR 164.514).
- Remove all 18 HIPAA identifiers before using data for analytics or development.
- Test datasets must use synthetic data, never production PHI.
`,
    },
    {
      filename: 'hitech-breach-notification.md',
      pathScope: ['src/', 'lib/', 'app/', 'ops/', 'scripts/'],
      requiresFramework: 'hitech',
      content: `# HITECH Breach Notification Compliance

## Purpose
The HITECH Act (Subtitle D) requires prompt notification following any breach of
unsecured protected health information. This rule applies to covered entities and
their business associates.

## Breach Detection Requirements

### Logging and Monitoring
- Implement real-time alerting for unauthorized access patterns to PHI datastores.
- Monitor for bulk data exports, unusual query volumes, and access from unfamiliar IPs.
- Track all failed authentication attempts against systems containing PHI.

### Risk Assessment
- Upon detecting a potential breach, perform a four-factor risk assessment per 45 CFR 164.402:
  1. Nature and extent of PHI involved (types of identifiers, likelihood of re-identification).
  2. The unauthorized person who accessed or used the PHI.
  3. Whether PHI was actually acquired or only viewed.
  4. Extent to which risk has been mitigated.

## Notification Timelines
- Individual notification: without unreasonable delay, no later than 60 calendar days.
- HHS notification: annually for breaches under 500 individuals; within 60 days for 500+.
- Media notification: required for breaches affecting 500+ residents of a single state.

## Code Obligations
- Never suppress or silently discard errors in PHI-handling code paths.
- Implement immutable audit trails that cannot be altered after the fact.
- Ensure logging infrastructure is resilient; breaches of the logging system are themselves reportable.
- Include breach-detection hooks in all PHI data-access layers.
`,
    },
    {
      filename: 'healthcare-interop.md',
      pathScope: ['src/', 'lib/', 'app/'],
      content: `# Healthcare Interoperability Standards

## Purpose
Healthcare systems must exchange data accurately and reliably using recognized
interoperability standards. This rule governs code that produces, consumes, or
transforms clinical data in standard formats.

## FHIR (Fast Healthcare Interoperability Resources)

### Resource Validation
- Validate all FHIR resources against their StructureDefinition before persisting or transmitting.
- Use the FHIR Validator or equivalent library; do not rely on ad-hoc schema checks.
- Reject resources that fail validation rather than silently accepting malformed data.

### Conformance
- Declare a CapabilityStatement for every FHIR server endpoint.
- Support at minimum: read, search-type, and create interactions for implemented resources.
- Return OperationOutcome resources for all errors with appropriate severity and coding.

## HL7 v2 Messaging
- Parse messages using a compliant HL7 v2 library; never hand-parse pipe-delimited segments.
- Preserve message control IDs (MSH-10) end-to-end for traceability.
- Send ACK/NACK responses for every inbound message per the original mode protocol.

## DICOM
- Strip or pseudonymize patient demographics in DICOM headers before use in non-clinical contexts.
- Validate Transfer Syntax UIDs to ensure correct image decoding.

## General Obligations
- Map internal data models to standard terminologies (SNOMED CT, LOINC, RxNorm, ICD-10).
- Document all local code system extensions and their mappings to standard vocabularies.
- Version all interface contracts; never introduce breaking changes without deprecation notice.
`,
    },
  ],

  ignorePatterns: [
    '# Healthcare domain — protected health information and clinical data',
    'phi_data/',
    'patient_records/',
    'clinical_data/',
    'hipaa_audit/',
    '*.hl7',
    '*.fhir.json',
    'test_patients/',
  ],

  validationChecks: [
    {
      name: 'MRN pattern present in DLP configuration',
      severity: 'error',
      requiresFramework: 'hipaa',
      failureMessage:
        'HIPAA compliance requires a DLP pattern for Medical Record Numbers (MRNs). ' +
        'Ensure the MRN detection pattern is included in the generated configuration.',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.relativePath.includes('dlp-scanner') &&
            (f.content.includes('MRN') || f.content.includes('Medical Record')),
        ),
    },
    {
      name: 'DEA Number pattern present in DLP configuration',
      severity: 'warning',
      requiresFramework: 'hipaa',
      failureMessage:
        'HIPAA-regulated systems handling prescriber data should include a DLP pattern for DEA numbers ' +
        'to prevent accidental exposure of prescriber identifiers.',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.relativePath.includes('dlp-scanner') &&
            (f.content.includes('DEA') || f.content.includes('Enforcement Administration')),
        ),
    },
    {
      name: 'PHI handling rule template generated',
      severity: 'error',
      requiresFramework: 'hipaa',
      failureMessage:
        'A HIPAA PHI-handling rule file (hipaa-phi-handling.md) must be generated for projects ' +
        'that process protected health information.',
      check: (files, _profile) =>
        files.some((f) => f.relativePath.includes('hipaa-phi-handling')),
    },
    {
      name: 'Audit logging configured for PHI access',
      severity: 'error',
      requiresFramework: 'hipaa',
      failureMessage:
        'HIPAA requires audit controls for all PHI access. Ensure the generated configuration ' +
        'includes audit logging directives in rules or CLAUDE.md.',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.content.toLowerCase().includes('audit') &&
            (f.content.toLowerCase().includes('phi') ||
              f.content.toLowerCase().includes('protected health')),
        ),
    },
    {
      name: 'Patient data directories in .claudeignore',
      severity: 'warning',
      requiresFramework: 'hipaa',
      failureMessage:
        'The .claudeignore file should exclude directories likely to contain patient data ' +
        '(phi_data/, patient_records/, clinical_data/) to prevent accidental PHI exposure.',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.relativePath.includes('claudeignore') &&
            f.content.includes('phi_data') &&
            f.content.includes('patient_records'),
        ),
    },
  ],
};
