import { describe, it, expect } from 'vitest';

// Test the idempotency key extraction logic (unit test without Fastify)
function extractIdempotencyKey(headers: Record<string, string | undefined>): string | undefined {
  return headers['x-idempotency-key'] || headers['X-Idempotency-Key'];
}

describe('Idempotency Key', () => {
  it('extracts key from lowercase header', () => {
    const key = extractIdempotencyKey({ 'x-idempotency-key': 'abc-123' });
    expect(key).toBe('abc-123');
  });

  it('extracts key from mixed-case header', () => {
    const key = extractIdempotencyKey({ 'X-Idempotency-Key': 'def-456' });
    expect(key).toBe('def-456');
  });

  it('returns undefined when header is missing', () => {
    const key = extractIdempotencyKey({});
    expect(key).toBeUndefined();
  });

  it('accepts UUID format keys', () => {
    const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const key = extractIdempotencyKey({ 'x-idempotency-key': uuid });
    expect(key).toBe(uuid);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
