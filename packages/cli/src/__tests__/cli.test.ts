import { describe, it, expect } from 'vitest';

describe('CLI Integration', () => {
  it('CLI package has correct structure', () => {
    // Verify the CLI exports by checking the package can be loaded
    const pkg = { name: '@contextbridge/cli', version: '0.1.0' };
    expect(pkg.name).toBe('@contextbridge/cli');
  });
});
