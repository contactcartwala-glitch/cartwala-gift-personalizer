import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['app/lib/partial-cod-payment.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { inrPaise, verifyDepositSnapshot } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const money = (amount, currencyCode = 'INR') => ({ shopMoney: { amount, currencyCode } });
const expected = { intentId: 'intent-1', orderPaise: 100000, linkedDraftOrderId: 'gid://shopify/Order/1' };
const snapshot = {
  id: expected.linkedDraftOrderId, cancelledAt: null, displayFinancialStatus: 'PAID', test: false,
  customAttributes: [{ key: '_cartwala_order_kind', value: 'partial_cod_deposit' }, { key: '_cartwala_cod_intent', value: expected.intentId }],
  totalPriceSet: money('280.00'), totalReceivedSet: money('280.00'), totalRefundedSet: money('0.00'),
  transactions: [{ id: 'transaction-1', kind: 'SALE', status: 'SUCCESS', test: false, amountSet: money('280.00') }],
};
assert.equal(inrPaise(money('280.1')), 28010);
for (const invalid of ['-1', 'NaN', '1e3', '1.001', ' 1', '1000081']) assert.throws(() => inrPaise(money(invalid)));
assert.throws(() => inrPaise(money('280', 'USD')));
const proof = verifyDepositSnapshot(expected, snapshot);
assert.equal(proof.orderId, snapshot.id);
assert.deepEqual(proof.transactionIds, ['transaction-1']);
for (const modify of [
  s => { s.test = true; },
  s => { s.cancelledAt = '2026-10-05T00:00:00Z'; },
  s => { s.displayFinancialStatus = 'PENDING'; },
  s => { s.customAttributes[1].value = 'another-intent'; },
  s => { s.customAttributes.push(s.customAttributes[1]); },
  s => { s.totalPriceSet = money('281'); },
  s => { s.totalReceivedSet = money('200'); },
  s => { s.totalRefundedSet = money('1'); },
  s => { s.transactions[0].amountSet = money('279'); },
  s => { s.transactions[0].status = 'PENDING'; },
  s => { s.transactions[0].kind = 'AUTHORIZATION'; },
  s => { s.transactions[0].test = true; },
  s => { s.transactions.push({ ...s.transactions[0], kind: 'REFUND' }); },
  s => { s.transactions.push({ ...s.transactions[0], kind: 'VOID' }); },
]) {
  const changed = structuredClone(snapshot); modify(changed);
  assert.throws(() => verifyDepositSnapshot(expected, changed));
}
assert.throws(() => verifyDepositSnapshot({ ...expected, linkedDraftOrderId: null }, snapshot));
assert.throws(() => verifyDepositSnapshot({ ...expected, linkedDraftOrderId: 'different-order' }, snapshot));
const split = structuredClone(snapshot);
split.transactions = [
  { ...split.transactions[0], id: 'capture-b', kind: 'CAPTURE', amountSet: money('180') },
  { ...split.transactions[0], id: 'capture-a', kind: 'CAPTURE', amountSet: money('100') },
  { ...split.transactions[0], id: 'auth', kind: 'AUTHORIZATION' },
];
assert.equal(verifyDepositSnapshot(expected, split).fingerprint, 'capture-a|capture-b');
split.transactions.reverse();
assert.equal(verifyDepositSnapshot(expected, split).fingerprint, 'capture-a|capture-b');
console.log('Deposit identity, real captures, exact amounts, split payments, refunds and cancellation checks passed.');

