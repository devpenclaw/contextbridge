# ContextBridge 🧠

**Context orchestration for AI-assisted development.**

ContextBridge sits between your codebase and any AI coding tool (Codebuff, Cursor, Copilot, Claude, Cline, etc.), intelligently curating, retrieving, and injecting the right context at the right time.

## Why?

Every AI coding tool has the same bottleneck: **context**. The quality of AI output is directly proportional to the quality of context fed into it. Developers today spend more time crafting prompts and manually gathering context than actually producing output.

ContextBridge solves this by becoming the **single source of truth for context** — a platform that indexes your codebase, understands its architecture, and delivers pinpoint-accurate context to any AI tool on demand.

## Features

- **🔍 AST-based indexing** — Parses your code into a rich knowledge graph of functions, classes, types, and their relationships (not just file embeddings)
- **🎯 Smart context retrieval** — Given a natural language query, finds the most relevant code entities and synthesizes them into a focused context package
- **🔄 Incremental indexing** — Only re-indexes files that changed (detected via content hash)
- **🔌 MCP protocol support** — Plug into any MCP-compatible AI tool (Cursor, Codebuff, Claude Desktop, Cline)
- **💻 CLI interface** — `cb init`, `cb context`, `cb ask`, `cb status`
- **📊 Feedback loops** — Rate context results to improve relevance over time
- **🏠 Local-first** — Everything runs on your machine with SQLite, no cloud dependency

## Quick Start

### Installation

```bash
# Install globally
npm install -g @contextbridge/cli

# Or run directly
npx @contextbridge/cli
```

### Index your repository

```bash
cd your-project
cb init
```

Scans your codebase, parses TypeScript/JavaScript files, and builds a local index in `.contextbridge/`.

```
$ cb init
🔍 ContextBridge — Indexing repository...
  Directory: /Users/you/your-project

✓ Indexed 14 files
  • 67 functions indexed
  • 5 classes indexed
  • 14 types indexed
✓ Index complete (2.3s)

### Get context for a task

```bash
cb context "How does the payment flow work?"
cb context "Explain the authentication architecture" --format prompt
```

```
$ cb context "What does the context engine do?"
📦 Context: What does the context engine do?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 Summary: The ContextEngine class manages context retrieval and synthesis.

📋 packages/core/src/context-engine.ts
  • getContext - Main entry point for context retrieval
  • getFileContext - Get context about a specific file
  • recordFeedback - Record feedback for learning
  • buildFunctionSection - Build a section from function matches
  • buildSummary - Synthesize a summary from matched sections

📋 packages/core/src/__tests__/context-engine.test.ts (test file)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ 3 relevant sections found

### Interactive mode

```bash
cb ask
cb> How do we handle error states?
```

### Check index status

```bash
cb status
```

```
$ cb status
📊 ContextBridge Index Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Files:      14
  Functions:  67
  Classes:    5
  Types:      14
  DB Size:    108.0 KB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### MCP Server (for AI tool integration)

```bash
npx @contextbridge/mcp-server
```

Then configure in any MCP-compatible client:

```json
{
  "mcpServers": {
    "contextbridge": {
      "command": "npx",
      "args": ["@contextbridge/mcp-server"]
    }
  }
}
```

Available MCP tools:
- `get_context` — Get context about the codebase for any query
- `get_file_context` — Deep context for a specific file
- `get_recent_changes` — What changed recently
- `find_related` — Find related entities
- `index_repo` — Index or re-index

## SDK Usage

```typescript
import { ContextBridge } from '@contextbridge/sdk';

const bridge = new ContextBridge({ repoDir: '/path/to/repo' });
bridge.initialize();
bridge.index();

const result = bridge.getContext({
  query: 'How does the payment flow work?'
});

console.log(result.summary);
console.log(result.sections);
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   CLIENTS                            │
│  CLI (terminal)  │  MCP Clients  │  API / SDKs      │
└──────────┬──────────────────────────┬──────────────┘
           │                          │
┌──────────▼──────────────────────────▼──────────────┐
│              CONTEXT API GATEWAY                    │
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

## Project Structure

```
contextbridge/
├── packages/
│   ├── core/           # Core engine: indexing, storage, context retrieval, AST parsing
│   ├── cli/            # CLI: cb init, cb context, cb ask, cb status
│   ├── mcp-server/     # MCP protocol server for AI tool integration
│   └── sdk/            # Node.js SDK for programmatic use
├── docs/plans/         # Design documents
└── package.json        # Monorepo root (pnpm workspaces + Turborepo)
```

## Tech Stack

- **Runtime:** Node.js ≥ 22
- **Language:** TypeScript
- **Monorepo:** pnpm workspaces + Turborepo
- **Storage:** SQLite (better-sqlite3) with WAL mode
- **AST Parsing:** TypeScript Compiler API
- **CLI:** Commander.js + chalk + ora
- **MCP:** Model Context Protocol SDK
- **Testing:** Vitest

## Roadmap

### Phase 1 (MVP) ✅
- [x] Local-first CLI with SQLite storage
- [x] TS/JS AST parser (functions, classes, types)
- [x] Basic context retrieval engine
- [x] MCP server for AI tool integration
- [x] Feedback tracking

### Phase 2 (Coming Soon)
- [ ] Multi-language support (Python, Go, Rust via Tree-sitter)
- [ ] Full Knowledge Graph (Neo4j)
- [ ] Convention detection and architectural inference
- [ ] Web UI dashboard
- [x] Git integration (`cb what-changed`)
- [x] Comprehensive test suite (30+ tests)
- [x] Keyword-based context search (improved relevance)

### Phase 3 (Future)
- [ ] Cloud sync & team workspaces
- [ ] IDE extensions (VS Code, JetBrains)
- [ ] Integration bus (Slack, Notion, Jira, Linear)
- [ ] Enterprise features (SSO, audit, RBAC)
- [ ] File watching for auto re-indexing

## License

MIT
