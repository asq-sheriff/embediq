import { Dimension, QuestionType, ConditionOperator } from '../../types/index.js';
import type { DomainPack } from '../index.js';

export const educationPack: DomainPack = {
  id: 'education',
  name: 'Education (FERPA/COPPA)',
  version: '1.0.0',
  description:
    'Domain pack for education technology projects handling student records, ' +
    'child privacy, and institutional data under FERPA, COPPA, and state student privacy laws.',

  questions: [
    {
      id: 'EDU_001',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Does your application handle education records protected under FERPA (Family Educational Rights and Privacy Act)?',
      helpText:
        'FERPA protects the privacy of student education records and applies to all schools that receive federal funding.',
      type: QuestionType.YES_NO,
      required: true,
      order: 220,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['education', 'edtech', 'k12', 'higher_ed'],
        },
        {
          questionId: 'REG_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['ferpa', 'student_records', 'sensitive_data', 'education'],
    },
    {
      id: 'EDU_002',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Which categories of student data does your system process?',
      helpText:
        'Different data categories carry different sensitivity levels under FERPA and may require distinct handling procedures.',
      type: QuestionType.MULTI_CHOICE,
      options: [
        { key: 'grades', label: 'Grades & Transcripts', description: 'Academic performance records, GPA, and transcript data' },
        { key: 'enrollment', label: 'Enrollment Records', description: 'Registration, attendance, and enrollment status' },
        { key: 'financial_aid', label: 'Financial Aid', description: 'FAFSA data, scholarships, grants, and loan information' },
        { key: 'disciplinary', label: 'Disciplinary Records', description: 'Behavioral incidents, suspensions, and expulsions' },
        { key: 'special_ed', label: 'Special Education (IEP/504)', description: 'Individualized Education Programs and 504 plans' },
        { key: 'directory', label: 'Directory Information', description: 'Name, address, phone, email, dates of attendance' },
        { key: 'health', label: 'Health Records', description: 'Immunization records, nursing logs, and health screenings' },
      ],
      required: true,
      order: 221,
      showConditions: [
        {
          questionId: 'EDU_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['ferpa', 'student_records', 'data_classification', 'education'],
    },
    {
      id: 'EDU_003',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Will your application be used by or collect data from children under 13 years of age (COPPA)?',
      helpText:
        'COPPA requires verifiable parental consent before collecting personal information from children under 13.',
      type: QuestionType.YES_NO,
      required: true,
      order: 222,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['education', 'edtech', 'k12'],
        },
      ],
      tags: ['coppa', 'child_privacy', 'consent', 'education'],
    },
    {
      id: 'EDU_004',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'What is your relationship to the educational institution regarding student data access?',
      helpText:
        'School officials with legitimate educational interest have different FERPA obligations than third-party service providers or researchers.',
      type: QuestionType.SINGLE_CHOICE,
      options: [
        { key: 'school_official', label: 'School Official', description: 'Acting under direct control of the institution with legitimate educational interest' },
        { key: 'third_party', label: 'Third-Party Service Provider', description: 'Contracted vendor operating under a data sharing agreement with the institution' },
        { key: 'research', label: 'Research Organization', description: 'Conducting studies on behalf of the institution under an approved research agreement' },
      ],
      required: true,
      order: 223,
      showConditions: [
        {
          questionId: 'EDU_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['ferpa', 'access_control', 'consent', 'education'],
    },
    {
      id: 'EDU_005',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Does your system share FERPA-protected data with other educational institutions or organizations?',
      helpText:
        'Inter-institutional data sharing requires specific FERPA exceptions or written consent from students/parents.',
      type: QuestionType.YES_NO,
      required: false,
      order: 224,
      showConditions: [
        {
          questionId: 'EDU_001',
          operator: ConditionOperator.EQUALS,
          value: true,
        },
      ],
      tags: ['ferpa', 'data_sharing', 'interoperability', 'education'],
    },
    {
      id: 'EDU_006',
      dimension: Dimension.REGULATORY_COMPLIANCE,
      text: 'Are you subject to additional state-level student privacy laws (e.g., SOPIPA, state data breach notification)?',
      helpText:
        'Many states have enacted student privacy laws that go beyond FERPA, such as California\'s SOPIPA or New York\'s Education Law 2-d.',
      type: QuestionType.YES_NO,
      required: false,
      order: 225,
      showConditions: [
        {
          questionId: 'STRAT_002',
          operator: ConditionOperator.ANY_OF,
          value: ['education', 'edtech', 'k12', 'higher_ed'],
        },
      ],
      tags: ['state_privacy', 'student_data', 'compliance', 'education'],
    },
  ],

  complianceFrameworks: [
    {
      key: 'ferpa',
      label: 'FERPA',
      description:
        'Family Educational Rights and Privacy Act — federal law protecting the privacy of student education records at institutions receiving federal funding.',
    },
    {
      key: 'coppa',
      label: 'COPPA',
      description:
        'Children\'s Online Privacy Protection Act — federal law requiring verifiable parental consent before collecting personal information from children under 13.',
    },
    {
      key: 'sopipa',
      label: 'State Student Privacy Laws',
      description:
        'State-level student privacy legislation such as SOPIPA (CA), Education Law 2-d (NY), and similar statutes that impose additional requirements on student data handling.',
    },
  ],

  priorityCategories: {
    'Student Data Governance': [
      'ferpa',
      'student_records',
      'data_classification',
      'access_control',
      'data_sharing',
    ],
    'Child Safety & Privacy': [
      'coppa',
      'child_privacy',
      'consent',
      'state_privacy',
    ],
  },

  dlpPatterns: [
    {
      name: 'Student ID',
      pattern: '\\b[Ss]tudent[\\s_-]?[Ii][Dd][:\\s]*\\d{5,12}\\b',
      severity: 'CRITICAL',
      description: 'Student identification number — uniquely identifies a student in education records protected under FERPA.',
      requiresFramework: 'ferpa',
    },
    {
      name: 'GPA',
      pattern: '\\b[Gg][Pp][Aa][:\\s]*[0-4]\\.[0-9]{1,2}\\b',
      severity: 'HIGH',
      description: 'Grade point average — academic performance metric that constitutes a FERPA-protected education record.',
      requiresFramework: 'ferpa',
    },
    {
      name: 'FAFSA / Financial Aid ID',
      pattern: '\\b[Ff][Aa][Ff][Ss][Aa][\\s_-]?[Ii][Dd][:\\s]*\\d{6,10}\\b',
      severity: 'CRITICAL',
      description: 'Free Application for Federal Student Aid identifier — links to sensitive financial and educational data.',
      requiresFramework: 'ferpa',
    },
    {
      name: 'Course Section with Student',
      pattern: '\\b[A-Z]{2,4}[\\s-]?\\d{3,4}[\\s-]?\\d{0,3}[:\\s]+[A-Z][a-z]+\\s[A-Z][a-z]+\\b',
      severity: 'HIGH',
      description: 'Course section identifier paired with a student name — reveals enrollment status, a FERPA-protected record.',
      requiresFramework: 'ferpa',
    },
    {
      name: 'IEP / 504 Reference',
      pattern: '\\b(IEP|504[\\s-]?[Pp]lan|Individualized Education Program)[:\\s]+\\w+',
      severity: 'CRITICAL',
      description: 'Special education plan reference — IEP and 504 data is among the most sensitive FERPA-protected information.',
      requiresFramework: 'ferpa',
    },
    {
      name: 'Minor Date of Birth',
      pattern: '\\b[Dd]ate[\\s_-]?[Oo]f[\\s_-]?[Bb]irth[:\\s]*(\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4})\\b',
      severity: 'CRITICAL',
      description: 'Date of birth for a minor — personally identifiable information protected under COPPA for children under 13.',
      requiresFramework: 'coppa',
    },
  ],

  ruleTemplates: [
    {
      filename: 'ferpa-compliance.md',
      pathScope: ['src/', 'lib/', 'api/', 'services/'],
      content: [
        '# FERPA Compliance Requirements',
        '',
        'This project handles student education records protected under the Family Educational',
        'Rights and Privacy Act (20 U.S.C. section 1232g; 34 CFR Part 99).',
        '',
        '## Mandatory Safeguards',
        '',
        '- Never log, print, or expose student PII (names, IDs, grades, enrollment) in',
        '  console output, error messages, or stack traces.',
        '- All access to education records must be authenticated and authorized against',
        '  a legitimate educational interest determination.',
        '- Student data must be encrypted at rest (AES-256 or equivalent) and in transit (TLS 1.2+).',
        '- Implement role-based access control: only school officials with documented',
        '  legitimate educational interest may view records.',
        '- Maintain an access audit log recording who accessed which records, when, and why.',
        '',
        '## Data Sharing Constraints',
        '',
        '- Do not share education records with third parties without prior written consent',
        '  from the eligible student or parent, unless a FERPA exception applies.',
        '- Directory information may only be disclosed if the institution has given public',
        '  notice of the categories it has designated as directory information.',
        '- De-identified data must satisfy the FERPA de-identification standard: a reasonable',
        '  person in the school community must not be able to identify any student.',
        '',
        '## Retention and Disposal',
        '',
        '- Destroy student data when the contractual purpose has been fulfilled.',
        '- Use secure deletion methods that prevent forensic recovery of records.',
      ].join('\n'),
      requiresFramework: 'ferpa',
    },
    {
      filename: 'coppa-child-privacy.md',
      pathScope: ['src/', 'lib/', 'api/', 'services/', 'components/'],
      content: [
        '# COPPA Child Privacy Requirements',
        '',
        'This project may collect or process personal information from children under 13,',
        'requiring compliance with the Children\'s Online Privacy Protection Act (15 U.S.C.',
        'sections 6501-6506; 16 CFR Part 312).',
        '',
        '## Verifiable Parental Consent',
        '',
        '- Obtain verifiable parental consent before collecting, using, or disclosing',
        '  personal information from any child under 13.',
        '- Accepted consent mechanisms: signed consent form, credit card verification,',
        '  government-issued ID check, video call, or knowledge-based authentication.',
        '- Maintain records of parental consent for a minimum of 3 years.',
        '',
        '## Data Minimization',
        '',
        '- Collect only the personal information reasonably necessary for the child\'s',
        '  participation in the activity. Do not condition participation on disclosure',
        '  of more information than is necessary.',
        '- Do not collect geolocation data, photos, or audio/video from minors without',
        '  explicit parental consent for each data type.',
        '',
        '## Privacy Policy and Notices',
        '',
        '- Post a clear, prominent, and complete privacy policy describing data practices',
        '  for children\'s information.',
        '- Provide direct notice to parents before collecting information and give them',
        '  the right to review, delete, and refuse further collection.',
        '',
        '## Security and Retention',
        '',
        '- Implement reasonable security measures to protect children\'s data from',
        '  unauthorized access, use, or disclosure.',
        '- Retain children\'s personal information only as long as necessary to fulfill',
        '  the purpose for which it was collected, then securely delete it.',
      ].join('\n'),
      requiresFramework: 'coppa',
    },
  ],

  ignorePatterns: [
    '# Education domain — sensitive student data directories',
    'student_records/',
    'grade_data/',
    'enrollment_data/',
    'iep_plans/',
    'financial_aid/',
    'test_students/',
    'roster_exports/',
  ],

  validationChecks: [
    {
      name: 'Student ID pattern in DLP configuration',
      severity: 'error',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.relativePath.includes('settings') &&
            f.content.includes('Student') &&
            f.content.includes('ID'),
        ),
      failureMessage:
        'FERPA requires a DLP pattern to detect student identifiers. Ensure the generated settings include a Student ID detection rule.',
      requiresFramework: 'ferpa',
    },
    {
      name: 'FERPA compliance rule present',
      severity: 'error',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.relativePath.includes('ferpa') &&
            f.content.includes('FERPA'),
        ),
      failureMessage:
        'A FERPA compliance rule file must be generated when FERPA-protected education records are in scope.',
      requiresFramework: 'ferpa',
    },
    {
      name: 'COPPA compliance rule present',
      severity: 'error',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.relativePath.includes('coppa') &&
            f.content.includes('COPPA'),
        ),
      failureMessage:
        'A COPPA child privacy rule file must be generated when the application serves children under 13.',
      requiresFramework: 'coppa',
    },
    {
      name: 'Student data directories in .claudeignore',
      severity: 'warning',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.relativePath.includes('claudeignore') &&
            f.content.includes('student_records'),
        ),
      failureMessage:
        'The .claudeignore file should exclude student data directories (student_records/, grade_data/, etc.) to prevent accidental exposure.',
      requiresFramework: 'ferpa',
    },
    {
      name: 'Audit logging recommended for FERPA',
      severity: 'warning',
      check: (files, _profile) =>
        files.some(
          (f) =>
            f.content.includes('audit') || f.content.includes('logging'),
        ),
      failureMessage:
        'FERPA best practices recommend audit logging for all access to student education records. Consider enabling audit hooks or logging configuration.',
      requiresFramework: 'ferpa',
    },
  ],
};
