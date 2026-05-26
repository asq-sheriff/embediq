---
globs:
  - "src/"
  - "lib/"
  - "app/"
---

# HIPAA Protected Health Information Handling

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
