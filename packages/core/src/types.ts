// ─── Entity Types ───────────────────────────────────────────

export interface IndexedFile {
  id: string;
  path: string;
  language: string;
  contentHash: string;
  tokenCount: number;
  isTest: boolean;
  lastIndexedAt: string;
}

export interface IndexedFunction {
  id: string;
  name: string;
  fileId: string;
  fullName: string; // Including class prefix if applicable
  signature: string;
  docComment: string;
  complexity: number;
  startLine: number;
  endLine: number;
  isExported: boolean;
  isAsync: boolean;
}

export interface IndexedClass {
  id: string;
  name: string;
  fileId: string;
  methods: string[]; // Function IDs
  properties: string[];
  extendsId: string | null;
  implementsIds: string[];
  isExported: boolean;
}

export interface IndexedType {
  id: string;
  name: string;
  kind: 'interface' | 'type' | 'enum' | 'type-alias';
  fileId: string;
  properties: string[];
}

// ─── Relationship Types ────────────────────────────────────

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: 'calls' | 'imports' | 'extends' | 'implements' | 'uses_type' | 'has_function' | 'has_test';
  metadata: Record<string, unknown>;
}

// ─── Query & Context Types ─────────────────────────────────

export interface ContextQuery {
  query: string;
  scope?: {
    files?: string[];
    directory?: string;
    gitDiff?: string;
  };
  format?: 'prompt' | 'structured' | 'minimal';
  maxTokens?: number;
}

export interface ContextSection {
  title: string;
  content: string;
  sourceFiles: string[];
  relevanceScore: number;
}

export interface ContextResult {
  id: string;
  summary: string;
  sections: ContextSection[];
  tokenCost: number;
  queryMetadata: {
    interpretedIntent: string;
    entitiesFound: string[];
    confidence: number;
  };
}

// ─── Feedback Types ────────────────────────────────────────

export interface FeedbackEntry {
  id: string;
  query: string;
  contextId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  acceptedItems: string[];
  rejectedItems: string[];
  createdAt: string;
}

// ─── Config ────────────────────────────────────────────────

export interface ContextBridgeConfig {
  repoDir: string;
  dbPath?: string;
  embeddingModel?: 'local' | 'openai';
  openAiKey?: string;
  maxContextTokens?: number;
}
