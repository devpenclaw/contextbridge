#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ContextBridge } from '@contextbridge/sdk';

const repoDir = process.cwd();
const bridge = new ContextBridge({ repoDir });
bridge.initialize();

const server = new Server(
  {
    name: 'contextbridge',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── List Available Tools ──────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_context',
        description: 'Get context about the codebase for a given query. Use this to understand architecture, find relevant code, or prepare for refactoring tasks.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'What do you want context on? (e.g., "How does the payment flow work?")',
            },
            max_tokens: {
              type: 'number',
              description: 'Maximum token count for the context package',
              default: 4000,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_file_context',
        description: 'Get detailed context about a specific file in the codebase.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Path to the file (relative to repo root)',
            },
          },
          required: ['file_path'],
        },
      },
      {
        name: 'get_recent_changes',
        description: 'Get context about recent changes in the codebase.',
        inputSchema: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Number of days to look back',
              default: 7,
            },
          },
        },
      },
      {
        name: 'find_related',
        description: 'Find files and functions related to a given file or concept.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'File path or concept to find related entities for',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'index_repo',
        description: 'Index or re-index the current repository.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// ─── Handle Tool Calls ─────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'get_context': {
      const query = String(args?.query || '');
      const maxTokens = Number(args?.max_tokens) || 4000;

      const result = bridge.getContext({
        query,
        maxTokens,
        format: 'prompt',
      });

      return {
        content: [
          {
            type: 'text',
            text: result.summary + '\n\n' + result.sections.map((s) => s.content).join('\n'),
          },
        ],
      };
    }

    case 'get_file_context': {
      const filePath = String(args?.file_path || '');
      const result = bridge.getFileContext(filePath);

      if (!result) {
        return {
          content: [
            {
              type: 'text',
              text: `File "${filePath}" not found in the index. Try running \`index_repo\` first.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.sections[0]?.content || 'No context available.',
          },
        ],
      };
    }

    case 'get_recent_changes': {
      const days = Number(args?.days) || 7;
      // MVP: Return stats + ask user to run cb what-changed
      const stats = bridge.getStats();

      return {
        content: [
          {
            type: 'text',
            text: `## Recent Changes (last ${days} days)\n\n` +
              `Current index stats:\n` +
              `- ${stats.fileCount} files\n` +
              `- ${stats.functionCount} functions\n` +
              `- ${stats.classCount} classes\n` +
              `- ${stats.typeCount} types\n\n` +
              `For detailed git changes, run \`git log --since="${days}.days.ago"\` in your terminal.`,
          },
        ],
      };
    }

    case 'find_related': {
      const query = String(args?.query || '');
      const result = bridge.getContext({ query, format: 'prompt' });

      if (result.sections.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No related entities found for "${query}".`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.sections.map((s) => s.content).join('\n'),
          },
        ],
      };
    }

    case 'index_repo': {
      const progress = bridge.index();
      return {
        content: [
          {
            type: 'text',
            text: `Indexing complete! ${progress.indexed} files indexed, ${progress.skipped} skipped, ${progress.errors} errors.`,
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ─── Start Server ──────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ContextBridge MCP Server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
