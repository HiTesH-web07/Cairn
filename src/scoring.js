// Pure scoring logic. No I/O. Task count never appears in any result.

const DEFAULT_SETTINGS = {
  rankWeights: [35, 25, 20, 12, 8],
  quality: { done_well: 1.0, needs_fixes: 0.5, redo: 0 },
  stretchBonus: 0.5,
  secondRaterRanks: 2, // ranks 1..N need a second rater
  coinsPerWeek: 10,
  maxCoinsPerPerson: 3,
  workingDays: [1, 2, 3, 4, 5], // Mon..Fri (0 = Sunday)
  blockerEscalationHours: 4,
  // Where people, reporting lines and leave come from. Each company chooses.
  peopleSource: 'manual', // 'manual' | 'csv' | 'keka'
  // With Keka, only the fields ticked here are ever read. Salary, payroll, bank, tax, documents and attendance never are.
  hrFields: { reportingLine: true, department: true, jobTitle: true, leave: true, phone: false },
  ratingReminderHours: 48,
  ratingEscalationHours: 96
};

function mergeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  s.quality = { ...DEFAULT_SETTINGS.quality, ...((raw && raw.quality) || {}) };
  s.hrFields = { ...DEFAULT_SETTINGS.hrFields, ...((raw && raw.hrFields) || {}) };
  return s;
}

function validateSettings(s) {
  const errors = [];
  const w = s.rankWeights;
  if (!Array.isArray(w) || w.length < 1 || w.length > 10 || w.some((x) => typeof x !== 'number' || x < 0)) {
    errors.push('rankWeights must be a list of 1-10 non-negative numbers');
  } else if (Math.round(w.reduce((a, b) => a + b, 0)) !== 100) {
    errors.push('rankWeights must add up to 100');
  }
  for (const k of ['done_well', 'needs_fixes', 'redo']) {
    const v = s.quality[k];
    if (typeof v !== 'number' || v < 0 || v > 1) errors.push(`quality.${k} must be between 0 and 1`);
  }
  if (!(s.coinsPerWeek >= 0 && s.coinsPerWeek <= 100)) errors.push('coinsPerWeek must be 0-100');
  if (!(s.maxCoinsPerPerson >= 1 && s.maxCoinsPerPerson <= s.coinsPerWeek)) errors.push('maxCoinsPerPerson must be 1..coinsPerWeek');
  if (!Array.isArray(s.workingDays) || !s.workingDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) errors.push('workingDays must be weekday numbers 0-6');
  if (!(s.stretchBonus >= 0 && s.stretchBonus <= 1)) errors.push('stretchBonus must be 0-1');
  if (!['manual', 'csv', 'keka'].includes(s.peopleSource)) errors.push('peopleSource must be manual, csv or keka');
  const allowedHr = Object.keys(DEFAULT_SETTINGS.hrFields);
  if (Object.keys(s.hrFields).some((k) => !allowedHr.includes(k)) || Object.values(s.hrFields).some((v) => typeof v !== 'boolean')) errors.push(`hrFields may only switch ${allowedHr.join(', ')} on or off`);
  return errors;
}

function weightForRank(rank, settings) {
  if (!rank || rank < 1) return 0;
  return settings.rankWeights[rank - 1] || 0;
}

// Quality multiplier for one item from its ratings. Returns null while a required rating is missing.
function itemMultiplier(item, ratings, settings) {
  if (!ratings.length) return null;
  const needsTwo = item.rank && item.rank <= settings.secondRaterRanks;
  if (needsTwo && ratings.length < 2) return null;
  const vals = ratings.map((r) => settings.quality[r.quality]);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * items: ranked items of one person for one week, each with ratings[]
 * leave: { available, working } days
 * Returns { score|null, earned, possible, items[], pending }
 */
function weeklyScore(items, settings, leave) {
  let earned = 0;
  let possible = 0;
  let pending = 0;
  const detail = [];
  for (const it of items) {
    if (!it.rank) continue;
    const w = weightForRank(it.rank, settings);
    const row = { id: it.id, rank: it.rank, weight: w, status: it.status, stretch: !!it.stretch, multiplier: null, earned: 0, counted: true };
    if (it.status === 'blocked_external') {
      row.counted = false; // raised early, not held against the person
    } else if (it.stretch && it.status !== 'delivered') {
      row.counted = false; // stretch: no penalty if missed
    } else {
      possible += w;
      if (it.status === 'delivered') {
        const m = itemMultiplier(it, it.ratings || [], settings);
        if (m === null) {
          pending += 1;
          row.multiplier = null;
        } else {
          row.multiplier = m;
          let e = w * m;
          if (it.stretch && m === settings.quality.done_well) e += w * settings.stretchBonus;
          row.earned = e;
          earned += e;
        }
      }
    }
    detail.push(row);
  }
  let factor = 1;
  if (leave && leave.working > 0) factor = Math.max(0.2, leave.available / leave.working);
  const effective = possible * factor;
  const score = effective > 0 ? Math.min(100, Math.round((earned / effective) * 100)) : null;
  return { score, earned: Math.round(earned * 10) / 10, possible, leaveFactor: factor, pending, items: detail };
}

function qualitySummary(ratings) {
  const out = { done_well: 0, needs_fixes: 0, redo: 0 };
  for (const r of ratings) if (out[r.quality] !== undefined) out[r.quality] += 1;
  return out;
}

function alignmentPct(items, settings) {
  let total = 0;
  let linked = 0;
  for (const it of items) {
    if (!it.rank) continue;
    const w = weightForRank(it.rank, settings);
    total += w;
    if (it.parent_item_id) linked += w;
  }
  return total > 0 ? Math.round((linked / total) * 100) : null;
}

// Coin rules: no self-giving, weekly budget, per-person cap.
function checkCoinGift({ fromId, toId, coins, givenThisWeek, givenToThisPerson }, settings) {
  if (fromId === toId) return 'You cannot give coins to yourself';
  if (!Number.isInteger(coins) || coins < 1) return 'Coins must be a whole number of at least 1';
  if (givenThisWeek + coins > settings.coinsPerWeek) return `You have ${settings.coinsPerWeek - givenThisWeek} coins left this week`;
  if (givenToThisPerson + coins > settings.maxCoinsPerPerson) return `At most ${settings.maxCoinsPerPerson} coins to one person per week`;
  return null;
}

module.exports = { DEFAULT_SETTINGS, mergeSettings, validateSettings, weightForRank, itemMultiplier, weeklyScore, qualitySummary, alignmentPct, checkCoinGift };
