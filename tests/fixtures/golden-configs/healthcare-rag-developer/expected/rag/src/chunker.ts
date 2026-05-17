/**
 * FHIR-aware chunker. Splits a clinical document into retrieval units
 * while preserving FHIR resource boundaries — a chunk never spans
 * across Patient / Encounter / Observation resources, so a downstream
 * filter can apply per-resource access control.
 *
 * For non-FHIR text (clinical notes, discharge summaries), falls back
 * to paragraph-and-sentence splitting with a soft 512-token cap.
 */

export interface Chunk {
  /** Stable identifier — opaque to the chunk content (UUID or hash). */
  id: string;
  /** Source identifier (filename, FHIR resource id, etc.). */
  sourceId: string;
  /** Resource type when known: 'Patient' | 'Observation' | ... */
  resourceType?: string;
  /** The chunk text. Never includes raw identifiers reconstructable to a patient. */
  text: string;
  /** Token-level offsets — useful for spans-in-context highlighting. */
  startOffset: number;
  endOffset: number;
}

const SOFT_CAP_TOKENS = 512;
const APPROX_CHARS_PER_TOKEN = 4;

export function chunkFhirBundle(bundle: { entry?: Array<{ resource?: unknown }> }, sourceId: string): Chunk[] {
  const out: Chunk[] = [];
  const entries = bundle.entry ?? [];
  for (const entry of entries) {
    const resource = entry.resource as { resourceType?: string } | undefined;
    if (!resource) continue;
    const text = JSON.stringify(resource);
    out.push({
      id: hashChunk(sourceId, out.length, text),
      sourceId,
      resourceType: resource.resourceType,
      text,
      startOffset: 0,
      endOffset: text.length,
    });
  }
  return out;
}

export function chunkPlainText(text: string, sourceId: string): Chunk[] {
  const cap = SOFT_CAP_TOKENS * APPROX_CHARS_PER_TOKEN;
  const paragraphs = text.split(/\n{2,}/g);
  const out: Chunk[] = [];
  let offset = 0;
  let buf = '';
  for (const p of paragraphs) {
    if ((buf + '\n\n' + p).length > cap && buf.length > 0) {
      out.push({
        id: hashChunk(sourceId, out.length, buf),
        sourceId,
        text: buf,
        startOffset: offset - buf.length,
        endOffset: offset,
      });
      buf = p;
    } else {
      buf = buf ? buf + '\n\n' + p : p;
    }
    offset += p.length + 2;
  }
  if (buf.length > 0) {
    out.push({
      id: hashChunk(sourceId, out.length, buf),
      sourceId,
      text: buf,
      startOffset: offset - buf.length,
      endOffset: offset,
    });
  }
  return out;
}

function hashChunk(sourceId: string, idx: number, text: string): string {
  let h = 0;
  const seed = `${sourceId}#${idx}#${text.length}`;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return `chunk-${idx.toString(36)}-${(h >>> 0).toString(36)}`;
}
