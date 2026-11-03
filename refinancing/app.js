'use strict';
const $ = id => document.getElementById(id);
const form = $('calculator');
const rub = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽';
const duration = value => value + ' мес.';
const loansRoot = $('loans');
const results = $('results');
let loanDrafts = Array.from({ length: 5 }, () => ({ payment: '', months: '', balance: '' }));
let hasResult = false;
function renderLoans() {
  loansRoot.innerHTML = loanDrafts.slice(0, Number($('loan-count').value)).map((loan, i) => `
    <article class="loan"><h3><span aria-hidden="true"></span>Кредит ${i + 1}</h3>
    <div class="fields"><label for="payment-${i}">Платёж в месяц<span class="input-wrap"><input id="payment-${i}" data-index="${i}" data-key="payment" inputmode="decimal" autocomplete="off" placeholder="Например, 15 000"><span>₽</span></span></label>
    <label for="months-${i}">Осталось платить<span class="input-wrap"><input id="months-${i}" data-index="${i}" data-key="months" inputmode="numeric" autocomplete="off" placeholder="Например, 24"><span>мес.</span></span></label></div>
    <details class="extra"><summary>Остаток долга — необязательно</summary><label for="balance-${i}">Сумма для полного погашения сегодня<span class="input-wrap"><input id="balance-${i}" data-index="${i}" data-key="balance" inputmode="decimal" autocomplete="off" placeholder="Уточните в приложении банка"><span>₽</span></span><small>Нужна для расчёта переплаты по процентам. Не сумма всех будущих платежей.</small></label></details></article>`).join('');
  loanDrafts.slice(0, Number($('loan-count').value)).forEach((loan, i) => {
    for (const key of ['payment', 'months', 'balance']) $(`${key}-${i}`).value = loan[key];
  });
  updateSummary();
}
function number(raw) {
  const cleaned = raw.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned) ? Number(cleaned) : NaN;
}
function updateSummary() {
  const loans = loanDrafts.slice(0, Number($('loan-count').value));
  const validPayment = loans.every(l => number(l.payment) > 0);
  const validMonths = loans.every(l => Number.isInteger(number(l.months)) && number(l.months) > 0);
  $('current-monthly').textContent = validPayment ? rub(loans.reduce((s, l) => s + number(l.payment), 0)) : '—';
  $('current-total').textContent = validPayment && validMonths ? rub(loans.reduce((s, l) => s + number(l.payment) * number(l.months), 0)) : '—';
}
function stale() {
  if (hasResult && !$('stale')) results.insertAdjacentHTML('afterbegin', '<p id="stale" class="stale" role="status">Условия изменились. Нажмите «Рассчитать выгоду», чтобы обновить результат.</p>');
}
loansRoot.addEventListener('input', event => {
  if (event.target.dataset.key) loanDrafts[Number(event.target.dataset.index)][event.target.dataset.key] = event.target.value;
  updateSummary();
});
$('loan-count').addEventListener('change', () => { renderLoans(); stale(); });
form.addEventListener('input', event => {
  event.target.removeAttribute('aria-invalid');
  if (event.target.name === 'mode') updateMode();
  stale();
});
function updateMode() {
  const rateMode = form.elements.mode.value === 'rate';
  $('rate-field').hidden = !rateMode;
  $('payment-field').hidden = rateMode;
}
function read(id, label, { optional = false, zero = false, integer = false, max = 1e10 } = {}) {
  const input = $(id);
  if (optional && !input.value.trim()) return null;
  const value = number(input.value);
  if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0) || value > max || (integer && !Number.isInteger(value))) {
    input.setAttribute('aria-invalid', 'true');
    const details = input.closest('details');
    if (details) details.open = true;
    input.focus();
    throw new Error(`${label}: ${integer ? 'введите целое число от 1 до ' + max : zero ? 'введите число от 0 до ' + rub(max) : 'введите число больше нуля и не больше ' + rub(max)}.`);
  }
  return value;
}
function row(label, current, next) { return `<tr><td>${label}</td><td>${current}</td><td>${next}</td></tr>`; }
function metric(label, value, hint) { return `<div class="metric"><span>${label}</span><strong>${value}</strong><p>${hint}</p></div>`; }
form.addEventListener('submit', event => {
  event.preventDefault();
  $('error').hidden = true;
  try {
    const loans = Array.from({ length: Number($('loan-count').value) }, (_, i) => {
      const loan = { payment: read(`payment-${i}`, `Кредит ${i + 1}, платёж`), months: read(`months-${i}`, `Кредит ${i + 1}, срок`, { integer: true, max: 1200 }), balance: read(`balance-${i}`, `Кредит ${i + 1}, остаток долга`, { optional: true }) };
      if (loan.balance !== null && loan.balance > loan.payment * loan.months + .01) throw new Error(`Кредит ${i + 1}: остаток долга больше суммы будущих платежей. Проверьте остаток, платёж и срок.`);
      return loan;
    });
    const mode = form.elements.mode.value;
    const offer = { mode, principal: read('principal', 'Сумма нового кредита'), months: read('new-months', 'Срок нового кредита', { integer: true, max: 1200 }), fees: read('fees', 'Дополнительные расходы', { optional: true, zero: true }) ?? 0 };
    if (mode === 'rate') offer.rate = read('rate', 'Годовая ставка', { zero: true, max: 1000 });
    else offer.payment = read('new-payment', 'Новый ежемесячный платёж');
    const r = Refinancing.calculate(loans, offer);
    if (r.payment * offer.months < offer.principal - .01) throw new Error('Общая сумма новых платежей меньше суммы нового кредита. Проверьте сумму, срок и ежемесячный платёж.');
    const shortfall = r.principalDifference !== null && r.principalDifference <= -1;
    const hasExtra = r.extraCash !== null && r.extraCash >= 1;
    const benefit = hasExtra ? r.savingsWithCash : r.savings;
    const same = Math.abs(benefit) < .5;
    const title = shortfall ? 'Не хватает для закрытия долгов' : same ? 'По расходам одинаково' : benefit > 0 ? `Выгодно: экономия ${rub(benefit)}` : `Невыгодно: дороже на ${rub(-benefit)}`;
    const monthlyText = Math.abs(r.monthlySavings) < .5 ? 'Первый ежемесячный платёж не изменится.' : r.monthlySavings > 0 ? `Вначале платёж снизится на ${rub(r.monthlySavings)} в месяц.` : `Вначале платёж вырастет на ${rub(-r.monthlySavings)} в месяц.`;
    const termText = r.monthsDifference === 0 ? 'Общий срок не изменится.' : r.monthsDifference > 0 ? `Платить придётся на ${duration(r.monthsDifference)} дольше.` : `Все кредиты будут закрыты на ${duration(-r.monthsDifference)} раньше.`;
    const verdictText = shortfall ? 'Новый кредит не покрывает все текущие долги. Для полного погашения потребуются собственные деньги.' : hasExtra ? `Сумма сверх погашения долгов — ${rub(r.extraCash)}. Текущие кредиты полностью закрываются; разница остаётся вам на руки и учтена в сравнении.` : same ? 'По сумме всех будущих выплат разницы практически нет.' : benefit > 0 ? 'Рефинансирование выгоднее по сумме будущих выплат при полном закрытии выбранных кредитов.' : 'По сумме будущих выплат рефинансирование невыгодно.';
    results.innerHTML = `<div class="verdict ${shortfall || same ? 'neutral' : benefit < 0 ? 'bad' : ''}"><div class="eyebrow">РЕЗУЛЬТАТ СРАВНЕНИЯ</div><h2 id="result-title">${title}</h2><p>${verdictText}</p><p>${monthlyText} ${termText}</p>${hasExtra ? `<p class="result-note">Расчёт выгоды: ${rub(r.currentTotal)} − ${rub(r.newTotal)} + ${rub(r.extraCash)} на руках. Если банк удержит из разницы страховку или комиссию, выгода уменьшится на сумму удержания.</p>` : ''}</div>
      <div class="metrics">${metric('Все будущие расходы', rub(r.newTotal), `Сейчас: ${rub(r.currentTotal)}`)}${metric('Новый платёж в месяц', rub(r.payment), `Сейчас: ${rub(r.currentMonthly)} в начале срока`)}${metric('До полного погашения', duration(offer.months), `Сейчас: ${duration(r.currentMonths)}`)}</div>
      <div class="comparison"><h3>Сравнение условий</h3><div class="table-wrap"><table><thead><tr><th scope="col">Показатель</th><th scope="col">Сейчас</th><th scope="col">Новый кредит</th></tr></thead><tbody>
      ${row('Все будущие выплаты', rub(r.currentTotal), rub(r.newTotal))}${row('Платёж в начале срока', rub(r.currentMonthly), rub(r.payment))}${row('До полного погашения', duration(r.currentMonths), duration(offer.months))}${row('Долг / сумма кредита', r.balance === null ? 'Не указан' : rub(r.balance), rub(offer.principal))}${row('Переплата с этого момента', r.currentInterest === null ? 'Нужны остатки долгов' : rub(r.currentInterest), rub(r.newInterest))}${row('Доп. расходы из своих денег', '—', rub(offer.fees))}
      </tbody></table></div><p class="result-note">Общие расходы — сумма оставшихся платежей. Для нового кредита к ним добавлены дополнительные расходы. Переплата — расходы сверх суммы долга; уже уплаченные проценты не учитываются.${r.currentInterest === null ? ' Чтобы сравнить переплату по процентам, укажите остаток долга для каждого текущего кредита.' : ` Разница переплат: ${Math.abs(r.currentInterest - r.newInterest) < .5 ? 'практически одинаково' : r.currentInterest > r.newInterest ? 'на ' + rub(r.currentInterest - r.newInterest) + ' меньше по новому кредиту' : 'на ' + rub(r.newInterest - r.currentInterest) + ' больше по новому кредиту'}.`}</p></div>
      <div class="comparison"><h3>Как будут меняться платежи</h3><div class="table-wrap"><table><thead><tr><th scope="col">Месяцы от сегодня</th><th scope="col">Сейчас, в месяц</th><th scope="col">Новый, в месяц</th></tr></thead><tbody>${r.timeline.map(t => row(t.start === t.end ? t.start : `${t.start}–${t.end}`, rub(t.current), rub(t.next))).join('')}</tbody></table></div><p class="result-note">Текущий платёж уменьшается по мере закрытия отдельных кредитов. Дополнительные разовые расходы в график не включены.</p></div>
      ${shortfall ? `<p class="warning">Для закрытия долгов нужно добавить ${rub(-r.principalDifference)} из своих денег. Эта доплата не включена в новые расходы выше. Если не закрыть текущие кредиты полностью, останутся дополнительные платежи по ним.</p>` : r.balance === null ? '<p class="result-note">Сравнение предполагает, что новый кредит полностью закроет выбранные кредиты. Укажите остатки долгов, чтобы проверить покрытие и отдельно учесть возможные деньги на руки.</p>' : ''}`;
    results.hidden = false;
    hasResult = true;
    results.focus({ preventScroll: true });
    results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  } catch (error) {
    $('error').textContent = error.message;
    $('error').hidden = false;
    stale();
  }
});
$('example').addEventListener('click', () => {
  loanDrafts = [{ payment: '18000', months: '24', balance: '350000' }, { payment: '12000', months: '36', balance: '300000' }, ...Array.from({ length: 3 }, () => ({ payment: '', months: '', balance: '' }))];
  $('loan-count').value = '2';
  renderLoans();
  $('principal').value = '650000';
  $('new-months').value = '36';
  $('new-payment').value = '23000';
  $('rate').value = '18';
  $('fees').value = '0';
  form.elements.mode.value = 'payment';
  updateMode();
  form.requestSubmit();
});
renderLoans();
