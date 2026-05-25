import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AstParser } from './ast-parser.js';
import { Storage } from './storage.js';

export interface IndexOptions {
  watch?: boolean;
  concurrency?: number;
}

export interface IndexProgress {
  total: number;
  indexed: number;
  skipped: number;
  errors: number;
}

export class Indexer {
  private parser: AstParser;
  private storage: Storage;
  private _isIndexing = false;

  constructor(storage: Storage, parser?: AstParser) {
    this.storage = storage;
    this.parser = parser || new AstParser();
  }

  get isIndexing(): boolean {
    return this._isIndexing;
  }

  /**
   * Index the entire repository. Scans all supported files and builds the database.
   */
  indexRepo(repoDir: string, options?: IndexOptions): IndexProgress {
    this._isIndexing = true;
    this.storage.initialize();

    const progress: IndexProgress = { total: 0, indexed: 0, skipped: 0, errors: 0 };
    const files = this.findCodeFiles(repoDir);

    progress.total = files.length;

    for (const filePath of files) {
      try {
        const relativePath = path.relative(repoDir, filePath);
        const existing = this.storage.getFileByPath(relativePath);
        const content = fs.readFileSync(filePath, 'utf-8');
        const currentHash = crypto.createHash('sha256').update(content).digest('hex');

        // Skip if content hasn't changed
        if (existing && existing.contentHash === currentHash) {
          progress.skipped++;
          continue;
        }

        const language = this.detectLanguage(filePath);
        const result = this.parser.parseFile(relativePath, content, language);

        // Upsert file
        const fileId = relativePath; // Use path as ID
        this.storage.upsertFile({ ...result.file, id: fileId });

        // Remove old data if file was previously indexed, then re-insert
        if (existing) {
          this.storage.deleteFile(fileId);
        }

        // Insert file
        this.storage.upsertFile({ ...result.file, id: fileId });

        // Insert functions
        for (const fn of result.functions) {
          this.storage.upsertFunction({ ...fn, id: `${fileId}:${fn.fullName}`, fileId });
        }

        // Insert classes
        for (const cls of result.classes) {
          this.storage.upsertClass({ ...cls, id: `${fileId}:${cls.name}`, fileId });
        }

        // Insert types
        for (const t of result.types) {
          this.storage.upsertType({ ...t, id: `${fileId}:${t.name}`, fileId });
        }

        progress.indexed++;
      } catch (err) {
        console.error(`Error indexing ${filePath}:`, err);
        progress.errors++;
      }
    }

    this._isIndexing = false;
    return progress;
  }

  /**
   * Index a single file incrementally.
   */
  indexFile(repoDir: string, filePath: string): void {
    this.storage.initialize();

    const relativePath = path.relative(repoDir, filePath);
    if (!this.parser.shouldParse(relativePath)) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const language = this.detectLanguage(filePath);
    const result = this.parser.parseFile(relativePath, content, language);
    const fileId = relativePath;

    // Remove old data and re-insert
    this.storage.deleteFile(fileId);
    this.storage.upsertFile({ ...result.file, id: fileId });

    for (const fn of result.functions) {
      this.storage.upsertFunction({ ...fn, id: `${fileId}:${fn.fullName}`, fileId });
    }
    for (const cls of result.classes) {
      this.storage.upsertClass({ ...cls, id: `${fileId}:${cls.name}`, fileId });
    }
    for (const t of result.types) {
      this.storage.upsertType({ ...t, id: `${fileId}:${t.name}`, fileId });
    }
  }

  /**
   * Remove a file from the index when it's deleted.
   */
  removeFile(repoDir: string, filePath: string): void {
    const relativePath = path.relative(repoDir, filePath);
    this.storage.deleteFile(relativePath);
  }

  private findCodeFiles(dir: string): string[] {
    const files: string[] = [];
    const gitignore = this.parseGitignore(dir);

    const walk = (currentDir: string) => {
      let entries;
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(dir, fullPath);

        if (this.shouldIgnore(relativePath, gitignore)) continue;

        if (entry.isDirectory()) {
          if (entry.name.startsWith('.')) continue; // Skip hidden dirs
          if (entry.name === 'node_modules') continue;
          if (entry.name === 'dist') continue;
          if (entry.name === '.contextbridge') continue;
          walk(fullPath);
        } else if (entry.isFile() && this.parser.shouldParse(entry.name)) {
          files.push(fullPath);
        }
      }
    };

    walk(dir);
    return files;
  }

  private parseGitignore(dir: string): string[] {
    const gitignorePath = path.join(dir, '.gitignore');
    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      return content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    } catch {
      return [];
    }
  }

  private shouldIgnore(relativePath: string, gitignore: string[]): boolean {
    for (const pattern of gitignore) {
      if (relativePath.startsWith(pattern) || relativePath.includes(pattern)) {
        return true;
      }
    }
    return false;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      default:
        return 'unknown';
    }
  }
}
