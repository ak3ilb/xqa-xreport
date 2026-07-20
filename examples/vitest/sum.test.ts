import { describe, it, expect } from 'vitest';
import { attach } from '@xqa.io/xreport/context';

describe('sum @unit', () => {
  it('returns sum', () => {
    attach.note({ type: 'json', title: 'operands', value: { a: 1, b: 2 } });
    attach.meta({ owner: 'platform', severity: 'low' });
    expect(1 + 2).toBe(3);
  });

  it('fails on purpose @smoke', { meta: { owner: 'platform', severity: 'high' } }, () => {
    attach.note({ type: 'text', title: 'hint', value: 'Demo failure for XREPORT' });
    expect(2 + 2).toBe(5);
  });
});
