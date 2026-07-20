const { describe, it, expect } = require('@jest/globals');
const { attach } = require('@xqa.io/xreport/context');

describe('math @unit', () => {
  it('adds numbers', () => {
    attach.note({ type: 'json', title: 'operands', value: { a: 1, b: 2 } });
    attach.meta({ owner: 'platform', severity: 'low' });
    expect(1 + 2).toBe(3);
  });

  it('fails on purpose @smoke', () => {
    attach.note('Expected failure for demo report');
    attach.meta({ owner: 'platform', severity: 'high', labels: { jira: 'DEMO-1' } });
    expect(2 + 2).toBe(5);
  });
});
