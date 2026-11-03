const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculate, paymentFor } = require('./calculator.js');
const loans = [{ payment: 18000, months: 24, balance: 350000 }, { payment: 12000, months: 36, balance: 300000 }];
const offer = { mode: 'payment', principal: 650000, months: 36, payment: 23000, fees: 0 };
test('compares totals, interest and declining monthly payments', () => {
  const r = calculate(loans, offer);
  assert.equal(r.currentTotal, 864000);
  assert.equal(r.newTotal, 828000);
  assert.equal(r.savings, 36000);
  assert.equal(r.monthlySavings, 7000);
  assert.equal(r.currentInterest, 214000);
  assert.equal(r.newInterest, 178000);
  assert.deepEqual(r.timeline, [{ start: 1, end: 24, current: 30000, next: 23000 }, { start: 25, end: 36, current: 12000, next: 23000 }]);
});
test('fees can reverse the verdict, lower monthly payment can cost more', () => {
  assert.equal(calculate(loans, { ...offer, fees: 40000 }).savings, -4000);
  const r = calculate(loans, { ...offer, months: 60, payment: 16000 });
  assert.equal(r.savings, -96000);
  assert.equal(r.monthsDifference, 24);
  assert.equal(r.monthlySavings, 14000);
  assert.equal(r.timeline.at(-1).current, 0);
});
test('annuity including zero interest matches known values', () => {
  assert.equal(paymentFor(120000, 12, 0), 10000);
  assert.ok(Math.abs(paymentFor(100000, 12, 12) - 8884.878867834) < .00001);
  assert.ok(Number.isFinite(paymentFor(100000, 1200, 1000)));
  assert.ok(Math.abs(paymentFor(120000, 12, 1e-10) - 10000) < .00001);
});
test('unknown balances do not invent interest; mismatched principal is exposed', () => {
  assert.equal(calculate([{ ...loans[0], balance: null }], offer).currentInterest, null);
  assert.equal(calculate(loans, { ...offer, principal: 700000 }).principalDifference, 50000);
  assert.equal(calculate(loans, { ...offer, principal: 600000 }).principalDifference, -50000);
});
test('five loans and shorter refinance produce the correct payment timeline', () => {
  const r = calculate(Array.from({ length: 5 }, (_, i) => ({ payment: 1000, months: i + 1, balance: null })), { ...offer, months: 3, payment: 4000 });
  assert.equal(r.currentTotal, 15000);
  assert.deepEqual(r.timeline.map(t => [t.current, t.next]), [[5000, 4000], [4000, 4000], [3000, 4000], [2000, 0], [1000, 0]]);
});
test('additional cash is separate from gross payments and adjusts the comparison', () => {
  const r = calculate(loans, { ...offer, principal: 700000, payment: 25000 });
  assert.equal(r.extraCash, 50000);
  assert.equal(r.savings, -36000);
  assert.equal(r.savingsWithCash, 14000);
  assert.equal(r.savingsWithCash, r.currentInterest - r.newInterest);
  assert.equal(calculate(loans, offer).savingsWithCash, 36000);
  assert.equal(calculate(loans, { ...offer, principal: 600000 }).savingsWithCash, null);
  assert.equal(calculate([{ ...loans[0], balance: null }], offer).savingsWithCash, null);
});
