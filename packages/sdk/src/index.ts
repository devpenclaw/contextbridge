import crypto from 'node:crypto';
import { ContextEngine, Indexer, Storage, AstParser } from '@contextbridge/core';
import type { ContextQuery, ContextResult, ContextBridgeConfig } from '@contextbridge/core';

export interface ContextBridgeStats {
  fileCount: number;
  functionCount: number;
  classCount: number;
  typeCount: number;
  lastIndexedAt?: string;
}

/**
 * High-level SDK for ContextBridge.
 * Handles initialization, indexing, and context retrieval.
 */
export class ContextBridge {
  private storage: Storage;
  private indexer: Indexer;
  private engine: ContextEngine;
  private parser: AstParser;
  private config: Required<ContextBridgeConfig>;

  constructor(config: ContextBridgeConfig) {
    this.config = {
      repoDir: config.repoDir,
      dbPath: config.dbPath || '.contextbridge/contextbridge.db',
      embeddingModel: config.embeddingModel || 'local',
      openAiKey: config.openAiKey || '',
      maxContextTokens: config.maxContextTokens || 4000,
    };

    this.parser = new AstParser();
    this.storage = new Storage(this.config.repoDir);
    this.indexer = new Indexer(this.storage, this.parser);
    this.engine = new ContextEngine(this.storage);
  }

  /**
   * Initialize the storage database.
   */
  initialize(): void {
    this.storage.initialize();
  }

  /**
   * Index the current repository.
   */
  index(options?: { watch?: boolean }): { total: number; indexed: number; skipped: number; errors: number } {
    return this.indexer.indexRepo(this.config.repoDir, options);
  }

  /**
   * Get context for a query.
   */
  getContext(query: string | ContextQuery): ContextResult {
    const queryObj: ContextQuery = typeof query === 'string' ? { query } : query;
    return this.engine.getContext(queryObj);
  }

  /**
   * Get context for a specific file.
   */
  getFileContext(filePath: string): ContextResult | null {
    const section = this.engine.getFileContext(filePath);
    if (!section) return null;

    return {
      id: crypto.randomUUID(),
      summary: `Context for ${filePath}`,
      sections: [section],
      tokenCost: 0,
      queryMetadata: {
        interpretedIntent: 'File context',
        entitiesFound: [filePath],
        confidence: 1,
      },
    };
  }

  /**
   * Record feedback for a context result.
   */
  recordFeedback(
    contextId: string,
    rating: 1 | 2 | 3 | 4 | 5,
    accepted?: string[],
    rejected?: string[],
  ): void {
    this.storage.insertFeedback({
      query: '',
      contextId,
      rating,
      acceptedItems: accepted || [],
      rejectedItems: rejected || [],
    });
  }

  /**
   * Get indexing stats.
   */
  getStats(): ContextBridgeStats {
    const stats = this.storage.getStats();
    return {
      ...stats,
    };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.storage.close();
  }
}
