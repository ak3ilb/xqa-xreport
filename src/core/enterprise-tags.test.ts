import assert from 'assert';
import { describe, it } from 'node:test';
import {
  applyEnterpriseTagsToTest,
  buildControlMatrix,
  controlMatrixCsv,
  parseEnterpriseTags,
  traceabilityCsv,
} from './enterprise-tags';
import type { XReportTest } from './types';

function test(partial: Partial<XReportTest>): XReportTest {
  return {
    id: 't',
    historyId: 'h',
    title: 't',
    fullTitle: 's t',
    status: 'passed',
    flaky: false,
    duration: 1,
    tags: [],
    annotations: [],
    errors: [],
    attempts: [],
    attachments: [],
    steps: [],
    ...partial,
  };
}

describe('enterprise-tags', () => {
  it('parses control risk req layer tags', () => {
    const parsed = parseEnterpriseTags(
      test({
        tags: ['@control:PCI-1', '@risk:critical', '@req:REQ-9', '@layer:api'],
      }),
    );
    assert.deepStrictEqual(parsed.controlIds, ['PCI-1']);
    assert.deepStrictEqual(parsed.riskTier, ['critical']);
    assert.deepStrictEqual(parsed.requirementIds, ['REQ-9']);
    assert.deepStrictEqual(parsed.layers, ['api']);
  });

  it('builds control matrix and CSV', () => {
    const tests = [
      applyEnterpriseTagsToTest(
        test({ tags: ['@control:A'], status: 'passed' }),
      ),
      applyEnterpriseTagsToTest(
        test({ id: 't2', historyId: 'h2', tags: ['@control:A'], status: 'failed' }),
      ),
    ];
    const matrix = buildControlMatrix(tests);
    assert.strictEqual(matrix.length, 1);
    assert.strictEqual(matrix[0].controlId, 'A');
    assert.strictEqual(matrix[0].passed, 1);
    assert.strictEqual(matrix[0].failed, 1);
    assert.ok(controlMatrixCsv(matrix).includes('controlId'));
    assert.ok(traceabilityCsv(tests).includes('REQ') || traceabilityCsv(tests).includes('control'));
  });
});
