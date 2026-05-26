---
globs:
  - "src/"
  - "lib/"
  - "app/"
---

# Healthcare Interoperability Standards

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
