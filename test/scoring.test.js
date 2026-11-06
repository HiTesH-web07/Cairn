const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/scoring');
const st = S.mergeSettings({});
const r = (q) => ({ quality: q });

test('delivering all ranked items done well scores 100, whatever the count', () => {
  const items = [1, 2, 3].map((rank) => ({ id: String(rank), rank, status: 'delivered', ratings: rank <= 2 ? [r('done_well'), r('done_well')] : [r('done_well')] }));
  assert.equal(S.weeklyScore(items, st).score, 100);
});

test('#1 and #2 need a second rater before they count', () => {
  const res = S.weeklyScore([{ id: 'a', rank: 1, status: 'delivered', ratings: [r('done_well')] }], st);
  assert.equal(res.pending, 1);
  assert.equal(res.score, 0);
});

test('quality multipliers apply and are averaged across raters', () => {
  const res = S.weeklyScore([
    { id: 'a', rank: 1, status: 'delivered', ratings: [r('done_well'), r('needs_fixes')] }, // 35 * .75
    { id: 'b', rank: 3, status: 'missed', ratings: [] }
  ], st);
  assert.equal(res.score, Math.round((26.25 / 55) * 100));
});

test('stretch: missed costs nothing, done well earns a bonus, total capped at 100', () => {
  const missed = S.weeklyScore([{ id: 'a', rank: 3, status: 'delivered', ratings: [r('done_well')] }, { id: 'b', rank: 1, stretch: 1, status: 'missed', ratings: [] }], st);
  assert.equal(missed.score, 100);
  const won = S.weeklyScore([{ id: 'a', rank: 3, status: 'missed', ratings: [] }, { id: 'b', rank: 4, stretch: 1, status: 'delivered', ratings: [r('done_well')] }], st);
  assert.equal(won.score, Math.round((18 / 32) * 100));
  const cap = S.weeklyScore([{ id: 'b', rank: 3, stretch: 1, status: 'delivered', ratings: [r('done_well')] }], st);
  assert.equal(cap.score, 100);
});

test('blocked by others is not held against the person', () => {
  const res = S.weeklyScore([{ id: 'a', rank: 1, status: 'blocked_external', ratings: [] }, { id: 'b', rank: 3, status: 'delivered', ratings: [r('done_well')] }], st);
  assert.equal(res.score, 100);
});

test('leave lowers the expectation', () => {
  const items = [{ id: 'a', rank: 3, status: 'delivered', ratings: [r('done_well')] }, { id: 'b', rank: 4, status: 'missed', ratings: [] }];
  assert.equal(S.weeklyScore(items, st).score, Math.round((20 / 32) * 100));
  assert.equal(S.weeklyScore(items, st, { working: 5, available: 3 }).score, Math.min(100, Math.round((20 / (32 * 0.6)) * 100)));
});

test('unranked work never adds to the score', () => {
  const items = [{ id: 'x', rank: null, status: 'delivered', ratings: [r('done_well')] }];
  assert.equal(S.weeklyScore(items, st).score, null);
});

test('coin rules', () => {
  assert.match(S.checkCoinGift({ fromId: 'a', toId: 'a', coins: 1, givenThisWeek: 0, givenToThisPerson: 0 }, st), /yourself/);
  assert.match(S.checkCoinGift({ fromId: 'a', toId: 'b', coins: 4, givenThisWeek: 0, givenToThisPerson: 0 }, st), /At most 3/);
  assert.match(S.checkCoinGift({ fromId: 'a', toId: 'b', coins: 2, givenThisWeek: 9, givenToThisPerson: 0 }, st), /1 coins left/);
  assert.equal(S.checkCoinGift({ fromId: 'a', toId: 'b', coins: 3, givenThisWeek: 7, givenToThisPerson: 0 }, st), null);
});

test('settings validation', () => {
  assert.ok(S.validateSettings(S.mergeSettings({ rankWeights: [50, 40] })).length);
  assert.equal(S.validateSettings(S.mergeSettings({ rankWeights: [60, 40] })).length, 0);
});
