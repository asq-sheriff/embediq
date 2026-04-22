#!/usr/bin/env python3
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
    # API keys and tokens
    (r'(?:api[_-]?key|token|secret)[\s]*[=:][\s]*["\'\']?[a-zA-Z0-9_\-]{20,}', 'CRITICAL', 'API key or token detected'),
    (r'(?:AKIA|ABIA|ACCA)[A-Z0-9]{16}', 'CRITICAL', 'AWS access key detected'),
    (r'-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----', 'CRITICAL', 'Private key detected'),
    # PII/PHI patterns
    (r'\\b\\d{3}-\\d{2}-\\d{4}\\b', 'CRITICAL', 'Social Security Number detected'),
    (r'\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\b', 'CRITICAL', 'Credit card number detected'),
    # PHI-specific patterns
    (r'\\b(?:MRN|mrn|Medical Record)[\s#:-]*\\d{5,}\\b', 'CRITICAL', 'Medical Record Number detected'),
    (r'\\b(?:patient[_\s]?(?:name|id|dob))[\s]*[=:]', 'HIGH', 'Patient data field detected'),
    # Healthcare (HIPAA/HITECH) domain patterns
    (r'\b(?:MRN|Med\s*Rec)\s*[:#]?\s*\d{6,10}\b', 'CRITICAL', 'Detects medical record numbers which are direct patient identifiers under HIPAA.'),
    (r'\b(?:HPBN|Beneficiary|Member\s*ID)\s*[:#]?\s*[A-Z0-9]{8,15}\b', 'CRITICAL', 'Detects health plan beneficiary and member ID numbers used in insurance claims.'),
    (r'\b(?:patient|dx|diagnosis)\s*[:#]?\s*[A-TV-Z]\d{2}\.?\d{0,4}\b', 'HIGH', 'Detects ICD-10 diagnosis codes when appearing alongside patient-identifying context, which constitutes PHI when linked to an individual.'),
    (r'\b[ABFGMPRabfgmpr][A-Za-z]\d{7}\b', 'CRITICAL', 'Detects Drug Enforcement Administration registration numbers assigned to prescribers. Exposure can enable prescription fraud.'),
    (r'\b(?:NPI|Natl\s*Provider)\s*[:#]?\s*\d{10}\b', 'HIGH', 'Detects National Provider Identifier numbers. While NPIs are publicly available, their presence in code may indicate hardcoded provider references.'),
    (r'\bPatient\/[A-Za-z0-9\-]{1,64}\b', 'HIGH', 'Detects FHIR Patient resource references (e.g., Patient/abc-123). These are direct links to patient records in FHIR-based systems.'),
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
