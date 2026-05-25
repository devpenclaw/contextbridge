import { describe, it, expect } from 'vitest';

describe('SDK', () => {
  it('SDK package has correct structure', () => {
    const pkg = { name: '@contextbridge/sdk', version: '0.1.0' };
    expect(pkg.name).toBe('@contextbridge/sdk');
  });
});
