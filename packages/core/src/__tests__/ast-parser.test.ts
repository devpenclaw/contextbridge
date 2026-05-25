import { describe, it, expect } from 'vitest';
import { AstParser } from '../ast-parser.js';

describe('AstParser', () => {
  const parser = new AstParser();

  describe('shouldParse', () => {
    it('accepts .ts files', () => {
      expect(parser.shouldParse('foo.ts')).toBe(true);
    });

    it('accepts .tsx files', () => {
      expect(parser.shouldParse('foo.tsx')).toBe(true);
    });

    it('accepts .js files', () => {
      expect(parser.shouldParse('foo.js')).toBe(true);
    });

    it('accepts .jsx files', () => {
      expect(parser.shouldParse('foo.jsx')).toBe(true);
    });

    it('rejects non-code files', () => {
      expect(parser.shouldParse('foo.md')).toBe(false);
      expect(parser.shouldParse('foo.json')).toBe(false);
      expect(parser.shouldParse('foo.css')).toBe(false);
    });
  });

  describe('parseFile', () => {
    it('parses an empty file', () => {
      const result = parser.parseFile('empty.ts', '', 'typescript');
      expect(result.file.path).toBe('empty.ts');
      expect(result.functions).toHaveLength(0);
      expect(result.classes).toHaveLength(0);
      expect(result.types).toHaveLength(0);
    });

    it('extracts exported functions', () => {
      const code = `
        export function greet(name: string): string {
          return "Hello " + name;
        }

        function helper() {
          return 42;
        }
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');
      expect(result.functions).toHaveLength(2);

      const greetFn = result.functions.find((f) => f.name === 'greet');
      expect(greetFn).toBeDefined();
      expect(greetFn!.isExported).toBe(true);
      expect(greetFn!.signature).toContain('name: string');

      const helperFn = result.functions.find((f) => f.name === 'helper');
      expect(helperFn).toBeDefined();
      expect(helperFn!.isExported).toBe(false);
    });

    it('extracts arrow functions assigned to const', () => {
      const code = `
        export const add = (a: number, b: number): number => {
          return a + b;
        };

        const noop = () => {};
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');
      expect(result.functions).toHaveLength(2);

      const addFn = result.functions.find((f) => f.name === 'add');
      expect(addFn).toBeDefined();
      expect(addFn!.signature).toContain('a: number');
    });

    it('extracts classes with methods', () => {
      const code = `
        export class UserService {
          private users: string[] = [];

          getUser(id: string): string | null {
            return this.users.find(u => u === id) || null;
          }

          addUser(name: string): void {
            this.users.push(name);
          }
        }
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');
      expect(result.classes).toHaveLength(1);
      expect(result.functions).toHaveLength(2);
      expect(result.classes[0].isExported).toBe(true);
      expect(result.classes[0].name).toBe('UserService');
    });

    it('extracts interfaces and types', () => {
      const code = `
        export interface User {
          id: string;
          name: string;
          email: string;
        }

        export type Status = 'active' | 'inactive' | 'pending';

        export enum Role {
          Admin = 'admin',
          User = 'user',
        }
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');
      expect(result.types).toHaveLength(3);

      const interface_ = result.types.find((t) => t.kind === 'interface');
      expect(interface_).toBeDefined();
      expect(interface_!.name).toBe('User');
      expect(interface_!.properties).toContain('id');

      const typeAlias = result.types.find((t) => t.kind === 'type');
      expect(typeAlias).toBeDefined();
      expect(typeAlias!.name).toBe('Status');

      const enum_ = result.types.find((t) => t.kind === 'enum');
      expect(enum_).toBeDefined();
      expect(enum_!.name).toBe('Role');
    });

    it('detects test files', () => {
      const result = parser.parseFile('foo.test.ts', '', 'typescript');
      expect(result.file.isTest).toBe(true);
    });

    it('computes complexity correctly', () => {
      const code = `
        function complex(x: number, y: number) {
          if (x > 0) {
            if (y > 0) {
              return x + y;
            }
            return x;
          }
          for (let i = 0; i < 10; i++) {
            console.log(i);
          }
          return 0;
        }
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');
      expect(result.functions).toHaveLength(1);
      // Base 1 + 1 if + 1 nested if + 1 for = 4
      expect(result.functions[0].complexity).toBe(4);
    });

    it('extracts JSDoc comments', () => {
      const code = `
        /**
         * Greets a user by name.
         * This is a friendly greeting.
         */
        export function greet(name: string): string {
          return "Hello " + name;
        }
      `;
      const result = parser.parseFile('test.ts', code, 'typescript');
      const greetFn = result.functions.find((f) => f.name === 'greet');
      expect(greetFn).toBeDefined();
      expect(greetFn!.docComment).toContain('Greets a user');
    });
  });
});
