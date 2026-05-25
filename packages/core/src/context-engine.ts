import crypto from 'node:crypto';
import { Storage } from './storage.js';
import type {
  ContextQuery,
  ContextResult,
  ContextSection,
  IndexedFunction,
  IndexedFile,
  IndexedClass,
  IndexedType,
} from './types.js';

export class ContextEngine {
  constructor(private storage: Storage) {}

  /**
   * Retrieve context for a given query. This is the main entry point.
   */
  getContext(query: ContextQuery): ContextResult {
    const startTime = performance.now();
    const sections: ContextSection[] = [];
    const entitiesFound: string[] = [];

    // Normalize query
    const queryStr = this.normalizeQuery(query.query);
    const maxTokens = query.maxTokens || 4000;
    let totalTokens = 0;

    // 1. Search for matching functions
    const functions = this.storage.searchFunctions(queryStr, 10);
    if (functions.length > 0) {
      entitiesFound.push(...functions.map((f) => f.fullName));
      const section = this.buildFunctionSection(functions, queryStr);
      totalTokens += this.estimateTokens(section.content);
      if (totalTokens <= maxTokens) sections.push(section);
    }

    // 2. Search for matching files
    const files = this.storage.searchFiles(queryStr, 10);
    if (files.length > 0) {
      entitiesFound.push(...files.map((f) => f.path));
      const section = this.buildFileSection(files);
      totalTokens += this.estimateTokens(section.content);
      if (totalTokens <= maxTokens) sections.push(section);
    }

    // 3. Get related entities for found functions
    if (functions.length > 0) {
      const fileIds = [...new Set(functions.map((f) => f.fileId))];
      const relatedClasses: IndexedClass[] = [];
      const relatedTypes: IndexedType[] = [];

      for (const fileId of fileIds) {
        relatedClasses.push(...this.storage.getClassesByFile(fileId));
        relatedTypes.push(...this.storage.getTypesByFile(fileId));
      }

      if (relatedClasses.length > 0) {
        const section = this.buildClassSection(relatedClasses);
        totalTokens += this.estimateTokens(section.content);
        if (totalTokens <= maxTokens) sections.push(section);
      }

      if (relatedTypes.length > 0) {
        const section = this.buildTypeSection(relatedTypes);
        totalTokens += this.estimateTokens(section.content);
        if (totalTokens <= maxTokens) sections.push(section);
      }
    }

    // 4. Build summary
    const summary = this.buildSummary(query.query, sections, functions);

    const elapsed = performance.now() - startTime;
    const contextId = crypto.randomUUID();

    return {
      id: contextId,
      summary,
      sections,
      tokenCost: totalTokens,
      queryMetadata: {
        interpretedIntent: this.interpretIntent(query.query),
        entitiesFound: [...new Set(entitiesFound)],
        confidence: sections.length > 0 ? Math.min(sections.length / 3, 1) : 0,
      },
    };
  }

  /**
   * Get context for a specific file.
   */
  getFileContext(filePath: string): ContextSection | null {
    const file = this.storage.getFileByPath(filePath);
    if (!file) return null;

    const functions = this.storage.getFunctionsByFile(file.id);
    const classes = this.storage.getClassesByFile(file.id);
    const types = this.storage.getTypesByFile(file.id);

    let content = `## File: ${file.path}\n\n`;
    content += `Language: ${file.language}\n`;
    content += `Token count: ${file.tokenCount}\n`;
    content += `Is test: ${file.isTest}\n\n`;

    if (classes.length > 0) {
      content += `### Classes\n\n`;
      for (const cls of classes) {
        content += `- ${cls.name}${cls.extendsId ? ` extends ${cls.extendsId.split(':').pop()}` : ''}\n`;
        if (cls.methods.length > 0) {
          content += `  - Methods: ${cls.methods.map((m) => m.split(':').pop()).join(', ')}\n`;
        }
      }
      content += '\n';
    }

    if (functions.length > 0) {
      content += `### Functions\n\n`;
      for (const fn of functions) {
        content += `- ${fn.fullName}: ${fn.signature}\n`;
        if (fn.docComment) {
          content += `  - ${fn.docComment.split('\n')[0]}\n`;
        }
      }
      content += '\n';
    }

    if (types.length > 0) {
      content += `### Types\n\n`;
      for (const t of types) {
        content += `- ${t.name} (${t.kind})\n`;
      }
      content += '\n';
    }

    return {
      title: `File: ${file.path}`,
      content,
      sourceFiles: [file.path],
      relevanceScore: 1.0,
    };
  }

  /**
   * Record feedback for a context result.
   */
  recordFeedback(
    contextId: string,
    query: string,
    rating: 1 | 2 | 3 | 4 | 5,
    accepted: string[] = [],
    rejected: string[] = [],
  ): void {
    this.storage.insertFeedback({
      query,
      contextId,
      rating,
      acceptedItems: accepted,
      rejectedItems: rejected,
    });
  }

  private buildFunctionSection(functions: IndexedFunction[], query: string): ContextSection {
    let content = `## Relevant Functions\n\n`;
    let relevanceScore = 0;

    for (const fn of functions.slice(0, 8)) {
      const matchScore = this.calculateMatchScore(fn, query);
      relevanceScore += matchScore;
      content += `### ${fn.fullName}\n`;
      content += `- **Location:** ${fn.fileId}:${fn.startLine}-${fn.endLine}\n`;
      content += `- **Signature:** \`${fn.signature}\`\n`;
      if (fn.docComment) {
        content += `- **Doc:** ${fn.docComment.slice(0, 200)}\n`;
      }
      content += `- **Exported:** ${fn.isExported ? 'Yes' : 'No'}\n`;
      content += `- **Complexity:** ${fn.complexity}\n\n`;
    }

    return {
      title: 'Relevant Functions',
      content,
      sourceFiles: [...new Set(functions.map((f) => f.fileId))],
      relevanceScore: relevanceScore / functions.length,
    };
  }

  private buildFileSection(files: IndexedFile[]): ContextSection {
    let content = `## Related Files\n\n`;

    for (const file of files.slice(0, 8)) {
      content += `- **${file.path}** — ${file.language}, ${file.tokenCount} tokens${file.isTest ? ' (test)' : ''}\n`;
    }

    return {
      title: 'Related Files',
      content,
      sourceFiles: files.map((f) => f.path),
      relevanceScore: 0.5,
    };
  }

  private buildClassSection(classes: IndexedClass[]): ContextSection {
    let content = `## Related Classes\n\n`;

    for (const cls of classes.slice(0, 5)) {
      content += `### ${cls.name}\n`;
      if (cls.extendsId) {
        content += `- **Extends:** ${cls.extendsId.split(':').pop()}\n`;
      }
      if (cls.methods.length > 0) {
        content += `- **Methods:** ${cls.methods.map((m) => m.split(':').pop()).join(', ')}\n`;
      }
      content += '\n';
    }

    return {
      title: 'Related Classes',
      content,
      sourceFiles: [...new Set(classes.map((c) => c.fileId))],
      relevanceScore: 0.6,
    };
  }

  private buildTypeSection(types: IndexedType[]): ContextSection {
    let content = `## Related Types\n\n`;

    for (const t of types.slice(0, 5)) {
      content += `- **${t.name}** (${t.kind})\n`;
      if (t.properties.length > 0) {
        content += `  - Properties: ${t.properties.join(', ')}\n`;
      }
    }

    return {
      title: 'Related Types',
      content,
      sourceFiles: [...new Set(types.map((t) => t.fileId))],
      relevanceScore: 0.4,
    };
  }

  private buildSummary(query: string, sections: ContextSection[], functions: IndexedFunction[]): string {
    if (sections.length === 0) {
      return `No context found for "${query}". Try rephrasing your query or running \`cb init\` to index the repository first.`;
    }

    const topFunctions = functions.slice(0, 3);
    let summary = `## Context Summary for: "${query}"\n\n`;
    summary += `Found ${sections.length} relevant sections across ${new Set(sections.flatMap((s) => s.sourceFiles)).size} files.\n\n`;

    if (topFunctions.length > 0) {
      summary += `**Key functions:** ${topFunctions.map((f) => f.fullName).join(', ')}\n`;
    }

    return summary;
  }

  private interpretIntent(query: string): string {
    const lowercase = query.toLowerCase();

    if (lowercase.includes('how') && (lowercase.includes('work') || lowercase.includes('flow'))) {
      return 'Understanding how something works';
    }
    if (lowercase.includes('refactor') || lowercase.includes('change') || lowercase.includes('modify')) {
      return 'Planning a change or refactor';
    }
    if (lowercase.includes('find') || lowercase.includes('search') || lowercase.includes('where')) {
      return 'Locating code or functionality';
    }
    if (lowercase.includes('what') || lowercase.includes('explain') || lowercase.includes('describe')) {
      return 'Getting an explanation or overview';
    }
    return 'General context retrieval';
  }

  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateMatchScore(fn: IndexedFunction, query: string): number {
    const lowercase = query.toLowerCase();
    let score = 0;

    // Name match is strongest
    if (fn.name.toLowerCase().includes(lowercase)) score += 0.8;
    if (fn.fullName.toLowerCase().includes(lowercase)) score += 0.6;

    // Doc comment match
    if (fn.docComment.toLowerCase().includes(lowercase)) score += 0.3;

    // Signature match
    if (fn.signature.toLowerCase().includes(lowercase)) score += 0.2;

    // Exported functions are more relevant
    if (fn.isExported) score += 0.1;

    return Math.min(score, 1);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
