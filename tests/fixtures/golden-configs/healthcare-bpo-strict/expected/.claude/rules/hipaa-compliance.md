---
description: HIPAA compliance rules for healthcare data handling
paths:
  - "src/**"
  - "tests/**"
---

# HIPAA Compliance

- All PHI must be encrypted at rest and in transit
- Access to PHI must be logged and auditable
- Never include real patient data in test fixtures — use synthetic data only
- Implement minimum necessary access principle
- All PHI-handling code must have security review before merge
- Session audit trail is mandatory for all PHI access