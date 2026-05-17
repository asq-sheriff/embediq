/**
 * Plain-text chunker. Splits documents into retrieval units via
 * paragraph + soft-cap splitting. Replace with a format-aware variant
 * (FHIR, legal-case-aware, code-aware) when the source corpus
 * justifies it.
 */

export interface Chunk {
  /** Stable identifier — opaque to the chunk content. */
  id: string;
  /** Source identifier (filename, document id, etc.). */
  sourceId: string;
  /** The chunk text. */
  text: string;
  /** Char-offset start in the source document. */
  startOffset: number;
  endOffset: number;
}

const SOFT_CAP_TOKENS = 512;
const APPROX_CHARS_PER_TOKEN = 4;

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
