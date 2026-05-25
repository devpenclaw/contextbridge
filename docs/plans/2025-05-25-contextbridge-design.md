# ContextBridge — Design Document

**Date:** May 25, 2025
**Status:** Draft v1
**Authors:** AI-assisted design

---

## 1. Vision & Executive Summary

ContextBridge is a **context orchestration layer** for AI-assisted software development. It sits between your codebase and any AI tool (Codebuff, Cursor, Copilot, Claude, Cline, etc.), intelligently curating, retrieving, and injecting the right context at the right time.

### The Core Loop

1. **Index** — Watches your codebase, building a rich knowledge graph of architecture, patterns, conventions, and domain logic.
2. **Learn** — Observes which context leads to successful outcomes, creating feedback loops that improve relevance over time.
3. **Serve** — Via CLI, MCP protocol, and API, delivers pinpoint-accurate context to any AI tool on demand.

### Market Opportunity

- 10M+ active users across AI coding tools
- No standard exists for "how to give an AI the right context"
- Teams solve this ad-hoc with custom scripts and manual copy-paste
- Tooling around AI coding is still primitive — this is infrastructure for the next generation

### Target Audience

1. **Individual developers** — Solo devs using AI tools daily
2. **Development teams** — 5-50 person engineering teams sharing context
3. **Enterprise orgs** — Large orgs with complex monorepos, compliance needs

---

## 2. Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────┐
│                   CLIENTS                            │
│  CLI (terminal)  │  MCP Clients  │  API / SDKs      │
└──────────┬──────────────────────────┬──────────────┘
           │                          │
┌──────────▼──────────────────────────▼──────────────┐
│              CONTEXT API GATEWAY                    │
│    (REST + WebSocket + MCP Protocol)                │
└──────────┬──────────────────────────┬──────────────┘
           │                          │
┌──────────▼──────────┐  ┌───────────▼──────────────┐
│   CONTEXT ENGINE    │  │   FEEDBACK ENGINE        │
│  (Retrieval +       │  │  (Track outcomes,        │
│   Ranking +         │  │   learn what worked)     │
│   Synthesis)        │  │                          │
└──────────┬──────────┘  └───────────┬──────────────┘
           │                          │
┌──────────▼──────────────────────────▼──────────────┐
│              KNOWLEDGE GRAPH                       │
│  (Code entities, relationships, conventions,       │
│   architectural patterns, domain concepts)         │
└──────────┬──────────────────────────┬──────────────┘
           │                          │
┌──────────▼──────────┐  ┌───────────▼──────────────┐
│   INDEXER SERVICE    │  │   INTEGRATION BUS        │
│  (File watcher,      │  │  (Git, Slack, Notion,    │
│   parser, embedder)  │  │   Jira, Linear, etc.)    │
└──────────────────────┘  └──────────────────────────┘
```

### Component Breakdown

#### Context Engine
The brain of ContextBridge. Takes a natural language query, retrieves relevant context from the knowledge graph, ranks by relevance, and synthesizes into a focused context package.

**Flow:**
1. Parse query → extract intent + entities
2. Query Knowledge Graph → find related entities, recent changes
3. Rank by relevance + feedback signals
4. Synthesize into structured context package

#### Knowledge Graph
Stores code entities, relationships, and metadata. Built from static analysis + AST parsing.

**Entity types:**
- Code files (path, language, hash, token count)
- Functions (name, signature, doc comment, complexity, dependencies)
- Classes (methods, properties, extends, implements)
- Types/Interfaces (properties, generics)
- Architectural concepts (named groupings of related files)
- Conventions (auto-detected patterns)
- Decision records (ADRs, why choices were made)

**Relationship types:**
- IMPORTS (file → file, with symbols)
- CALLS (function → function)
- EXTENDS / IMPLEMENTS (class/interface → class/interface)
- USES_TYPE (function/variable → type)
- HAS_FUNCTION / HAS_TEST (file → function/test file)
- RELATED_TO (file → architectural concept)

#### Indexer
Watches the filesystem, parses code into ASTs, extracts entities and relationships, updates the graph incrementally.

#### Feedback Engine
Tracks what context led to good outcomes. Context that produces accepted suggestions gets upranked; ignored context gets downranked.

#### Integration Bus
Connects to external systems (Git, Slack, Notion, Jira, Linear) to enrich context with organizational knowledge.

---

## 3. Data Model

### MVP Storage (Phase 1)

For the local-first MVP, we use:
- **SQLite** (better-sqlite3) — Relational data storage
- **SQLite Vec** — Vector embeddings for semantic search
- **File system** — Indexed data stored per-repo in `.contextbridge/` directory

### Phase 2 Storage (Scaled)

- **Neo4j** — Full Knowledge Graph with relationship-heavy queries
- **PostgreSQL** — User accounts, teams, billing
- **pgvector** — Vector embeddings
- **Redis** — Caching frequent context packages

### Core Schema (MVP)

```sql
-- Files
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  language TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  token_count INTEGER,
  is_test BOOLEAN DEFAULT FALSE,
  last_indexed_at TEXT NOT NULL
);

-- Functions
CREATE TABLE functions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id),
  signature TEXT,
  doc_comment TEXT,
  complexity INTEGER,
  start_line INTEGER,
  end_line INTEGER,
  is_exported BOOLEAN DEFAULT FALSE,
  is_async BOOLEAN DEFAULT FALSE
);

-- Classes
CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_id TEXT NOT NULL REFERENCES files(id),
  extends_id TEXT REFERENCES classes(id),
  is_exported BOOLEAN DEFAULT FALSE
);

-- Types/Interfaces
CREATE TABLE types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL, -- 'interface', 'type', 'enum', 'type-alias'
  file_id TEXT NOT NULL REFERENCES files(id)
);

-- Relationships (Edges)
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL, -- 'calls', 'imports', 'extends', 'implements', 'uses_type'
  metadata TEXT, -- JSON blob with extra details
  FOREIGN KEY (source_id) REFERENCES files(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Feedback
CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  context_id TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  accepted_items TEXT, -- JSON array
  rejected_items TEXT, -- JSON array
  created_at TEXT NOT NULL
);

-- Embeddings (SQLite Vec extension)
-- Stored in a separate virtual table
```

---

## 4. API Design

### REST API

```
POST /v1/context
  Body: {
    query: string,
    scope?: {
      files?: string[],
      directory?: string,
      git_diff?: string
    },
    format?: 'prompt' | 'structured' | 'minimal',
    max_tokens?: number
  }
  Response: {
    id: string,
    summary: string,
    sections: Array<{
      title: string,
      content: string,
      source_files: string[],
      relevance_score: number
    }>,
    token_cost: number,
    query_metadata: {
      interpreted_intent: string,
      entities_found: string[],
      confidence: number
    }
  }

POST /v1/context/stream (SSE)
  Same as above but streams context sections as assembled

POST /v1/feedback
  Body: {
    context_id: string,
    rating: 1-5,
    accepted_suggestions?: string[],
    rejected_suggestions?: string[],
    user_notes?: string
  }

POST /v1/index
  Body: { scope?: 'full' | { file: string } | { directory: string } }
```

### MCP Server Tools

- `get_context` — Main context retrieval tool
- `get_recent_changes` — What changed recently (by days, file, author)
- `find_related` — Find entities related to a given file or concept
- `get_file_context` — Deep context for a specific file

---

## 5. Client Interfaces

### CLI (`cb`)

```bash
# Initialize / re-index
cb init                    # Index current repo
cb init --watch            # Index and watch for changes

# Get context
cb context "help me understand the auth flow"
cb context "refactor payment module" --format prompt

# Recent changes
cb what-changed --days 7

# Interactive mode
cb ask
> What's our testing convention?
> Show data flow for user registration

# Health / status
cb status                  # Index stats, last indexed time
cb stats                   # Token counts, entity counts
```

### MCP Server

```bash
npx @contextbridge/mcp     # Starts MCP server on stdio
```

Configure in any MCP-compatible client (Cursor, Codebuff, Claude Desktop, Cline):
```json
{
  "mcpServers": {
    "contextbridge": {
      "command": "npx",
      "args": ["@contextbridge/mcp"]
    }
  }
}
```

### Node.js SDK

```typescript
import { ContextBridge } from '@contextbridge/sdk';

const bridge = new ContextBridge({ repoDir: '/path/to/repo' });
await bridge.index();

const context = await bridge.getContext({
  query: 'How does the payment flow work?'
});

console.log(context.summary);
```

---

## 6. MVP Scope (Phase 1 — Weeks 1-4)

### What We Build

| Feature | Description |
|---------|-------------|
| Local-first CLI | `cb init`, `cb context`, `cb ask` — all local, no cloud |
| TS/JS AST Parser | Extract functions, classes, imports, types via TypeScript Compiler API |
| SQLite + Vector Store | Local storage with semantic search |
| Basic Context Engine | Query → find relevant entities → synthesize prompt |
| MCP Server | stdio MCP server for integration with AI tools |
| Feedback Tracking | Local signals to improve ranking |

### What We Defer

- Cloud sync & team features
- Neo4j Knowledge Graph (starts relational + vectors)
- IDE extensions (VS Code, JetBrains)
- Integration bus (Slack, Notion, Jira)
- Multi-language support beyond TS/JS

### Tech Stack

- **Monorepo:** Turborepo + pnpm
- **Language:** TypeScript (Node.js)
- **CLI:** Commander.js + Ink (for interactive mode)
- **Storage:** better-sqlite3 + sqlite-vec
- **AST Parsing:** TypeScript Compiler API
- **Embeddings:** Local with transformers.js (or OpenAI API as fallback)
- **MCP:** Official MCP SDK
- **HTTP:** Express (for local API server)
- **Testing:** Vitest

### Project Structure

```
contextbridge/
├── package.json              # Root workspace config
├── turbo.json                # Turborepo config
├── tsconfig.base.json        # Shared TS config
│
├── packages/
│   ├── core/                 # Core logic: indexing, retrieval, graph
│   ├── cli/                  # CLI entry point
│   ├── mcp-server/           # MCP protocol server
│   └── sdk/                  # Node.js SDK
│
├── apps/
│   └── api/                  # HTTP API server (for future cloud)
│
└── docs/                     # Documentation
```

---

## 7. Revenue Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Local only, 1 repo, basic context |
| **Pro** | $15/mo | Cloud sync, 5 repos, advanced context, team of 3 |
| **Team** | $50/mo | Unlimited repos, 10 seats, shared context, integrations |
| **Enterprise** | Custom | SSO, audit, on-prem, SLA, custom integrations |

---

## 8. Open Questions

1. **Embedding model:** Use local (transformers.js) or cloud (OpenAI/AWS) for MVP? Local is better for privacy but less accurate.
2. **Feedback granularity:** Implicit (did they accept the AI suggestion?) vs explicit (thumbs up/down)?
3. **Large repo strategy:** How do we handle monorepos with 10K+ files? Incremental indexing? Focus on recently changed files?
4. **Scope of "context":** Just code? Or also git history, PR descriptions, commit messages, issue tracker data?

---

## 9. Future Roadmap

### Phase 2 (Weeks 5-8)
- Full Knowledge Graph (Neo4j)
- Multi-language support (Python, Go, Rust via Tree-sitter)
- Convention detection (auto-discover patterns)
- Architectural concept inference
- Web UI dashboard

### Phase 3 (Weeks 9-12)
- Cloud sync & team workspaces
- Integration bus (Git, Slack, Notion, Jira)
- IDE extensions (VS Code, JetBrains)
- Enterprise features (SSO, audit, RBAC)
- Usage analytics & billing

### Beyond
- CI/CD integration (auto-index on PR)
- Custom context profiles per team
- Context marketplace (shareable context packs)
- On-premises deployment option
