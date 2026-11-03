(function (root) {
  'use strict';
  function paymentFor(principal, months, annualRate) {
    if (annualRate === 0) return principal / months;
    const rate = annualRate / 1200;
    return principal * rate / -Math.expm1(-months * Math.log1p(rate));
  }
  function calculate(loans, offer) {
    const currentTotal = loans.reduce((s, l) => s + l.payment * l.months, 0);
    const currentMonthly = loans.reduce((s, l) => s + l.payment, 0);
    const currentMonths = Math.max(...loans.map(l => l.months));
    const payment = offer.mode === 'rate' ? paymentFor(offer.principal, offer.months, offer.rate) : offer.payment;
    const newTotal = payment * offer.months + offer.fees;
    const knownBalance = loans.every(l => l.balance !== null);
    const balance = knownBalance ? loans.reduce((s, l) => s + l.balance, 0) : null;
    const principalDifference = knownBalance ? offer.principal - balance : null;
    const extraCash = knownBalance ? Math.max(0, principalDifference) : null;
    const ends = [...new Set([...loans.map(l => l.months), offer.months])].sort((a, b) => a - b);
    let start = 1;
    const timeline = ends.map(end => {
      const row = { start, end, current: loans.filter(l => l.months >= start).reduce((s, l) => s + l.payment, 0), next: start <= offer.months ? payment : 0 };
      start = end + 1;
      return row;
    });
    return { currentTotal, currentMonthly, currentMonths, payment, newTotal, savings: currentTotal - newTotal,
      monthlySavings: currentMonthly - payment, monthsDifference: offer.months - currentMonths,
      currentInterest: knownBalance ? currentTotal - balance : null,
      newInterest: newTotal - offer.principal, balance,
      principalDifference, extraCash,
      savingsWithCash: knownBalance && principalDifference >= 0 ? currentTotal - newTotal + extraCash : null, timeline };
  }
  const api = { calculate, paymentFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Refinancing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
