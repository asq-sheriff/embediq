/**
 * Minimal CycloneDX 1.6 types — only the fields the AIBOM builder
 * emits. The full CycloneDX schema is large; we hand-roll the subset
 * we consume so EmbedIQ stays dep-free for governance output (same
 * decision as the OSCAL types in src/governance/oscal/).
 *
 * Reference: CycloneDX 1.6 specification (JSON schema)
 *   https://cyclonedx.org/docs/1.6/json/
 *
 * ML-BOM extension reference:
 *   https://cyclonedx.org/capabilities/mlbom/
 */

export const CYCLONEDX_SPEC_VERSION = '1.6';

export interface CycloneDxDocument {
  bomFormat: 'CycloneDX';
  specVersion: typeof CYCLONEDX_SPEC_VERSION;
  /** URN-format unique BOM identifier (urn:uuid:<uuid>). */
  serialNumber: string;
  /** Integer; incremented when the BOM is updated for the same subject. */
  version: number;
  metadata: CycloneDxMetadata;
  components: readonly CycloneDxComponent[];
  dependencies?: readonly CycloneDxDependency[];
}

export interface CycloneDxMetadata {
  /** ISO-8601 datetime; when the BOM was produced. */
  timestamp: string;
  tools: readonly CycloneDxTool[];
  /** The component this BOM describes — i.e. the EmbedIQ-generated harness. */
  component: CycloneDxComponent;
  /** Authors / suppliers of the BOM itself (not the subject component). */
  authors?: readonly { name: string; email?: string }[];
}

export interface CycloneDxTool {
  vendor?: string;
  name: string;
  version?: string;
}

/**
 * The four CycloneDX component types EmbedIQ emits:
 *   - `application`     — the EmbedIQ-generated harness (BOM subject)
 *   - `library`         — IDE-resident agents (Continue.dev, Aider, Zed AI)
 *   - `service`         — the local-router service, when enabled
 *   - `machine-learning-model` — every LLM the harness may invoke
 */
export type CycloneDxComponentType =
  | 'application'
  | 'library'
  | 'service'
  | 'machine-learning-model';

export interface CycloneDxComponent {
  /** Stable identifier — used by `dependencies[]` cross-references. */
  'bom-ref': string;
  type: CycloneDxComponentType;
  name: string;
  version?: string;
  description?: string;
  /** Required by CycloneDX when not bundled — package URL or vendor-specific identifier. */
  purl?: string;
  supplier?: CycloneDxSupplier;
  publisher?: string;
  licenses?: readonly CycloneDxLicense[];
  properties?: readonly { name: string; value: string }[];
  /**
   * ML-BOM extension — present only on `machine-learning-model`
   * components. Carries the modelCard fields per CycloneDX 1.6.
   */
  modelCard?: CycloneDxModelCard;
}

export interface CycloneDxSupplier {
  name: string;
  url?: readonly string[];
}

export interface CycloneDxLicense {
  license?: { id?: string; name?: string };
  expression?: string;
}

export interface CycloneDxDependency {
  ref: string;
  dependsOn?: readonly string[];
}

// ─── ML-BOM extension (CycloneDX 1.6) ─────────────────────────────────────

export interface CycloneDxModelCard {
  modelParameters?: CycloneDxModelParameters;
  quantitativeAnalysis?: CycloneDxQuantitativeAnalysis;
  considerations?: CycloneDxModelConsiderations;
}

export interface CycloneDxModelParameters {
  /** e.g. `supervised`, `unsupervised`, `reinforcement-learning`. */
  approach?: { type?: string };
  /** Natural-language description of the task (e.g. "code generation"). */
  task?: string;
  /** Model architecture family — `transformer`, `RNN`, `diffusion`, etc. */
  architectureFamily?: string;
  /** Concrete model architecture (e.g. `Llama-3`, `GPT-4`, `Claude Sonnet`). */
  modelArchitecture?: string;
  /** Training / fine-tuning datasets — operator-supplied; usually empty for hosted SaaS models. */
  datasets?: readonly { ref?: string; name?: string }[];
}

export interface CycloneDxQuantitativeAnalysis {
  performanceMetrics?: readonly { type: string; value: string }[];
}

export interface CycloneDxModelConsiderations {
  /** Free-text description of intended uses. */
  users?: readonly string[];
  /** Intended-use statements. */
  useCases?: readonly string[];
  /** Technical limitations. */
  technicalLimitations?: readonly string[];
  /** Ethical considerations. */
  ethicalConsiderations?: readonly { name?: string; mitigationStrategy?: string }[];
  /** Regulatory frameworks this model is intended to operate under. */
  regulatoryReporting?: readonly { regulationType?: string; regulator?: string }[];
}
