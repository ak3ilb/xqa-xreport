import assert from 'assert';
import { describe, it } from 'node:test';
import {
  classifyDefectKind,
  extractLikelyFixFile,
  normalizeErrorSignature,
} from './ai-classify';

describe('normalizeErrorSignature', () => {
  it('strips URLs, UUIDs, numbers, and timestamps', () => {
    const a = normalizeErrorSignature(
      'Request to https://api.example.com/v1/items/42 failed at 2024-01-15T10:00:00.000Z id=550e8400-e29b-41d4-a716-446655440000',
    );
    const b = normalizeErrorSignature(
      'Request to https://other.test/path/99 failed at 2025-06-01T12:30:00Z id=11111111-2222-3333-4444-555555555555',
    );
    assert.strictEqual(a, b);
    assert.ok(!a.includes('https'));
    assert.ok(!/\d{4}-\d{2}/.test(a));
  });
});

describe('classifyDefectKind', () => {
  it('detects automation from locator signals', () => {
    const r = classifyDefectKind({
      message: 'Timeout waiting for locator.getByRole("button")',
      failureCategory: 'timing',
    });
    assert.strictEqual(r.kind, 'automation');
    assert.ok(r.confidence >= 0.6);
  });

  it('detects product from assertion failures', () => {
    const r = classifyDefectKind({
      message: 'Expected "Open" to equal "Closed"',
      failureCategory: 'assertion',
    });
    assert.strictEqual(r.kind, 'product');
  });

  it('detects flake from flaky flag', () => {
    const r = classifyDefectKind({
      message: 'whatever',
      flaky: true,
    });
    assert.strictEqual(r.kind, 'flake');
  });

  it('detects environment from module / process signals', () => {
    const r = classifyDefectKind({
      message: 'Cannot find module "./missing"',
      failureCategory: 'environment',
    });
    assert.strictEqual(r.kind, 'environment');
  });
});

describe('extractLikelyFixFile', () => {
  it('returns first non-node_modules frame', () => {
    const stack = [
      'Error: boom',
      '    at Object.<anonymous> (/proj/node_modules/playwright/lib/x.js:1:1)',
      '    at run (/Users/me/app/tests/login.spec.ts:42:5)',
    ].join('\n');
    assert.strictEqual(extractLikelyFixFile(stack), '/Users/me/app/tests/login.spec.ts');
  });
});
