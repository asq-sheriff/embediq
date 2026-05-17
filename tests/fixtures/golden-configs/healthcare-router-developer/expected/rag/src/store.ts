/**
 * SQLite-VSS-backed vector store.
 *
 * Schema keeps the embedding (in a VSS virtual table) separate from
 * chunk metadata so the embedding column can be dropped without
 * losing audit-relevant fields.
 */

import Database from 'better-sqlite3';
import * as sqliteVss from 'sqlite-vss';
import type { Chunk } from './chunker.js';
import { embeddingDim } from './embedder.js';

const DB_PATH = process.env.RAG_DB_PATH ?? './rag.db';
const TOP_K_DEFAULT = Number.parseInt(process.env.RAG_TOP_K ?? '8', 10);

export interface RetrievedChunk {
  id: string;
  sourceId: string;
  text: string;
  distance: number;
  resourceType?: string;
}

export class RagStore {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    this.db = new Database(dbPath);
    sqliteVss.load(this.db);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(
      `CREATE TABLE IF NOT EXISTS chunks (
         id          TEXT PRIMARY KEY,
         source_id   TEXT NOT NULL,
         resource    TEXT,
         text        TEXT NOT NULL,
         created_at  TEXT NOT NULL DEFAULT (datetime('now'))
       );

       CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vss0(
         embedding(${embeddingDim()})
       );

       CREATE TABLE IF NOT EXISTS chunk_vector_map (
         chunk_id   TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
         rowid      INTEGER NOT NULL
       );`,
    );
  }

  insert(chunk: Chunk & { resourceType?: string }, embedding: Float32Array): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(`INSERT OR REPLACE INTO chunks (id, source_id, resource, text) VALUES (?, ?, ?, ?)`)
        .run(chunk.id, chunk.sourceId, chunk.resourceType ?? null, chunk.text);

      const result = this.db
        .prepare(`INSERT INTO chunk_vectors (embedding) VALUES (?)`)
        .run(Buffer.from(embedding.buffer));

      this.db
        .prepare(`INSERT OR REPLACE INTO chunk_vector_map (chunk_id, rowid) VALUES (?, ?)`)
        .run(chunk.id, result.lastInsertRowid);
    });
    tx();
  }

  search(queryEmbedding: Float32Array, topK: number = TOP_K_DEFAULT): RetrievedChunk[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.source_id, c.resource, c.text, v.distance
         FROM (
           SELECT rowid, distance FROM chunk_vectors
           WHERE vss_search(embedding, ?)
           LIMIT ?
         ) v
         JOIN chunk_vector_map m ON m.rowid = v.rowid
         JOIN chunks c ON c.id = m.chunk_id
         ORDER BY v.distance ASC`,
      )
      .all(Buffer.from(queryEmbedding.buffer), topK) as Array<{
        id: string;
        source_id: string;
        resource: string | null;
        text: string;
        distance: number;
      }>;

    return rows.map((r) => ({
      id: r.id,
      sourceId: r.source_id,
      resourceType: r.resource ?? undefined,
      text: r.text,
      distance: r.distance,
    }));
  }

  close(): void {
    this.db.close();
  }
}
