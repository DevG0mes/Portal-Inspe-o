import { describe, expect, it } from 'vitest';
import { parseNamedCreate, parseNamedPatch, parseUnitQuery } from './organization.dto.js';

describe('organization input contracts', () => {
  it('normalizes names while preserving display spelling', () => {
    expect(parseNamedCreate({ name: '  Operação  ' })).toEqual({ name: 'Operação' });
  });

  it('parses pagination and false filters without boolean coercion surprises', () => {
    expect(parseUnitQuery({ page: '2', pageSize: '10', isActive: 'false' })).toMatchObject({
      page: 2,
      pageSize: 10,
      isActive: false,
    });
    expect(() => parseUnitQuery({ pageSize: '101' })).toThrow();
    expect(() => parseUnitQuery({ page: '0' })).toThrow();
  });

  it('rejects empty updates, reassignment fields and empty names', () => {
    expect(() => parseNamedCreate({ name: '   ' })).toThrow();
    expect(() => parseNamedPatch({})).toThrow();
    expect(() => parseNamedPatch({ unitId: 'reassignment' })).toThrow();
  });
});
