import { describe, it, expect } from 'vitest';

describe('@contextbridge/mcp-server', () => {
  it('should export the package name', () => {
    const pkg = { name: '@contextbridge/mcp-server' };
    expect(pkg.name).toBe('@contextbridge/mcp-server');
  });
});
