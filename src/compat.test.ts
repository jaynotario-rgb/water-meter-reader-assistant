import { describe, expect, it } from 'vitest';
import { createId } from './compat';

describe('createId', () => {
  it('creates UUID v4 shaped identifiers without relying on randomUUID', () => {
    const id = createId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('creates distinct identifiers across repeated calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
  });
});
