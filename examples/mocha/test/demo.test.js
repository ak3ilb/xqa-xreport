const assert = require('assert');
const { attach } = require('../../../dist/context');

describe('XREPORT Mocha demo', function () {
  it('passes with context', function () {
    attach(this, { type: 'json', title: 'Meta', value: { product: 'XREPORT', brand: 'XQA' } });
    assert.strictEqual(2 + 2, 4);
  });

  it('fails for demo', function () {
    assert.strictEqual(true, false);
  });
});
