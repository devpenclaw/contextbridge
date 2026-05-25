import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Storage } from '../storage.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('Storage', () => {
  let tmpDir: string;
  let storage: Storage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-test-'));
    storage = new Storage(tmpDir);
    storage.initialize();
  });

  afterEach(() => {
    storage.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('File operations', () => {
    it('inserts and retrieves a file', () => {
      const id = storage.upsertFile({
        path: 'src/foo.ts',
        language: 'typescript',
        contentHash: 'abc123',
        tokenCount: 100,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });

      const file = storage.getFileByPath('src/foo.ts');
      expect(file).not.toBeNull();
      expect(file!.path).toBe('src/foo.ts');
      expect(file!.language).toBe('typescript');
    });

    it('updates file on conflict by path', () => {
      storage.upsertFile({
        path: 'src/foo.ts',
        language: 'typescript',
        contentHash: 'old',
        tokenCount: 100,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });

      storage.upsertFile({
        path: 'src/foo.ts',
        language: 'typescript',
        contentHash: 'new',
        tokenCount: 200,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });

      const file = storage.getFileByPath('src/foo.ts');
      expect(file!.contentHash).toBe('new');
      expect(file!.tokenCount).toBe(200);
    });

    it('deletes a file', () => {
      storage.upsertFile({
        path: 'src/foo.ts',
        language: 'typescript',
        contentHash: 'abc',
        tokenCount: 100,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });

      storage.deleteFile('src/foo.ts');
      expect(storage.getFileByPath('src/foo.ts')).toBeNull();
    });
  });

  describe('Function operations', () => {
    it('inserts and retrieves functions for a file', () => {
      storage.upsertFile({
        path: 'src/service.ts',
        language: 'typescript',
        contentHash: 'abc',
        tokenCount: 200,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });

      storage.upsertFunction({
        name: 'greet',
        fullName: 'greet',
        fileId: 'src/service.ts',
        signature: '(name: string) => string',
        docComment: 'Greets a user',
        complexity: 1,
        startLine: 1,
        endLine: 5,
        isExported: true,
        isAsync: false,
      });

      const functions = storage.getFunctionsByFile('src/service.ts');
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('greet');
    });

    it('cascades delete when file is removed', () => {
      storage.upsertFile({
        path: 'src/service.ts',
        language: 'typescript',
        contentHash: 'abc',
        tokenCount: 200,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });

      storage.upsertFunction({
        name: 'greet',
        fullName: 'greet',
        fileId: 'src/service.ts',
        signature: '(name: string) => string',
        docComment: '',
        complexity: 1,
        startLine: 1,
        endLine: 5,
        isExported: true,
        isAsync: false,
      });

      storage.deleteFile('src/service.ts');
      expect(storage.getFunctionsByFile('src/service.ts')).toHaveLength(0);
    });
  });

  describe('Search', () => {
    it('searches functions by name', () => {
      storage.upsertFile({
        path: 'src/auth.ts',
        language: 'typescript',
        contentHash: 'abc',
        tokenCount: 100,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });

      storage.upsertFunction({
        name: 'authenticate',
        fullName: 'authenticate',
        fileId: 'src/auth.ts',
        signature: '(token: string) => boolean',
        docComment: 'Validates auth token',
        complexity: 2,
        startLine: 1,
        endLine: 10,
        isExported: true,
        isAsync: false,
      });

      const results = storage.searchFunctions('authenticate');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('authenticate');
    });

    it('returns empty array for no matches', () => {
      const results = storage.searchFunctions('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('Stats', () => {
    it('returns correct counts', () => {
      storage.upsertFile({
        path: 'src/a.ts',
        language: 'typescript',
        contentHash: 'a',
        tokenCount: 10,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });
      storage.upsertFile({
        path: 'src/b.ts',
        language: 'typescript',
        contentHash: 'b',
        tokenCount: 20,
        isTest: false,
        lastIndexedAt: new Date().toISOString(),
      });

      const stats = storage.getStats();
      expect(stats.fileCount).toBe(2);
    });
  });
});
