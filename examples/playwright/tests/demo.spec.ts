import { test, expect } from '@playwright/test';

test.describe('XREPORT demo', () => {
  test('passing example', async () => {
    expect(1 + 1).toBe(2);
  });

  test('fails once for report demo', async () => {
    expect(true).toBe(false);
  });
});
