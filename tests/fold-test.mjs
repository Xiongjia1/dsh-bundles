// Offline check of the codexCost fold, the holiday-aware tariff, and wallet normalization.
import {
  apply,
  PROJECTION_KEY,
  buildDefinition,
  isPeakInstant,
  normalizeWallets,
  resolvePricing,
  DEFAULT_CONFIG,
} from '../dsh-cost-meter/index.js';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
};

// --- tariff windows: Beijing (UTC+8), Mon-Fri 09:00-12:00 / 14:00-18:00, no holidays.
const holidays = new Set(DEFAULT_CONFIG.holidays);
const at = (iso) => Date.parse(iso);
// 2026-10-08 is a Thursday; 2026-10-10 is the make-up Saturday; 10-01..10-07 is the holiday.
check('Thu 10-08 10:00 Beijing -> peak', isPeakInstant(at('2026-10-08T02:00:00Z'), holidays), true);
check('Thu 10-08 13:00 Beijing -> off-peak', isPeakInstant(at('2026-10-08T05:00:00Z'), holidays), false);
check('Thu 10-08 15:00 Beijing -> peak', isPeakInstant(at('2026-10-08T07:00:00Z'), holidays), true);
check('Thu 10-08 19:00 Beijing -> off-peak', isPeakInstant(at('2026-10-08T11:00:00Z'), holidays), false);
check('Sat 10-10 10:00 Beijing (make-up workday) -> off-peak', isPeakInstant(at('2026-10-10T02:00:00Z'), holidays), false);
check('Sun 10-11 15:00 Beijing -> off-peak', isPeakInstant(at('2026-10-11T07:00:00Z'), holidays), false);
check('Thu 10-01 10:00 Beijing (National Day) -> off-peak', isPeakInstant(at('2026-10-01T02:00:00Z'), holidays), false);
check('Mon 02-16 15:00 Beijing (Spring Festival) -> off-peak', isPeakInstant(at('2026-02-16T07:00:00Z'), holidays), false);
check('Wed 11-11 10:00 Beijing -> peak', isPeakInstant(at('2026-11-11T02:00:00Z'), holidays), true);
check('no holidays configured still splits weekends', isPeakInstant(at('2026-10-10T02:00:00Z'), new Set()), false);

// --- wallet normalization over both credential routes.
check(
  'account outcome {value,bonusWallets}',
  normalizeWallets({ value: [{ currency: 'CNY', balance: '123.4500' }], bonusWallets: [{ currency: 'CNY', balance: '5.00' }] }),
  { currency: 'CNY', total: '123.4500', bonus: '5.00', wallets: 2 },
);
check(
  'account outcome with status wrapper',
  normalizeWallets({ status: 'ready', value: [{ currency: 'CNY', balance: '9.99' }] }),
  { currency: 'CNY', total: '9.99', bonus: '0', wallets: 1 },
);
check('account outcome null -> null (no grant)', normalizeWallets(null), null);
check(
  'present-but-empty wallet arrays are a real zero, not null',
  normalizeWallets({ value: [], bonusWallets: [] }),
  { currency: '', total: '0', bonus: '0', wallets: 0 },
);
check('unrecognized shape (no wallet arrays) -> null', normalizeWallets({ status: 'ready' }), null);
check('empty holidays list honoured', resolvePricing({ holidays: [] }).holidayCount, 0);
check('omitted holidays -> built-in 2026 table', resolvePricing({}).holidayCount, DEFAULT_CONFIG.holidays.length);
check('default thresholds', resolvePricing({}).thresholds, { balance: { green: 50, orange: 15 }, session: { green: 10, red: 20 } });
check(
  'one band merges over its default while the other survives',
  resolvePricing({ thresholds: { balance: { green: 100 } } }).thresholds,
  { balance: { green: 100, orange: 15 }, session: { green: 10, red: 20 } },
);
check(
  'non-numeric thresholds are ignored',
  resolvePricing({ thresholds: { balance: { green: 'lots' }, session: { red: null } } }).thresholds,
  { balance: { green: 50, orange: 15 }, session: { green: 10, red: 20 } },
);

// --- fold + pricing through a fake registry (peak vs off-peak vs holiday).
let definition;
const ctx = { sessionProjections: { register: (def) => { definition = def; return () => {}; } } };
apply(ctx, { holidays: DEFAULT_CONFIG.holidays });
check('registered key', definition.key, PROJECTION_KEY);
check('state version bumped for the tariff change', definition.stateVersion, 2);

const usageEvent = (time, usage, model = 'deepseek-flash') => ({
  type: 'assistant/message',
  seq: 1,
  time,
  data: {
    turn: 1,
    step: 1,
    message: { role: 'assistant', source: { kind: 'model', provider: 'deepseek-account', model } },
    stream: [],
    usage,
  },
});

let state = definition.init({}, 0);
state = definition.apply(state, usageEvent(at('2026-10-08T02:00:00Z'), { inputTokens: 1_000_000, outputTokens: 1_000_000 }));
check('peak 1M miss + 1M out', definition.wire.view(state).sessionCost, 10);

state = definition.apply(state, usageEvent(at('2026-10-01T02:00:00Z'), { inputTokens: 1_000_000, outputTokens: 1_000_000 }));
check('holiday day is priced off-peak (+5)', definition.wire.view(state).sessionCost, 15);

state = definition.apply(
  state,
  usageEvent(at('2026-12-25T07:00:00Z'), { inputTokens: 1_000_000, cacheReadTokens: 1_000_000 }, 'deepseek-v4-pro'),
);
check(
  'v4-pro peak: 9 (miss) + 0.30 (cache read)',
  Number(definition.wire.view(state).sessionCost.toFixed(4)),
  Number((15 + 9.3).toFixed(4)),
);
check('all steps priced exactly', definition.wire.view(state).unpricedSteps, 0);

// --- balance rides the view but never the persistent state.
const withBalance = buildDefinition(resolvePricing({}), () => ({ status: 'ready', total: '42.00', currency: 'CNY' }));
const view = withBalance.wire.view(withBalance.init({}, 0));
check('balance reaches the wire view', view.balance.total, '42.00');
check('balance stays out of the fold state', Object.hasOwn(withBalance.init({}, 0), 'balance'), false);
withBalance.wire.viewSchema.parse(view);
withBalance.stateSchema.parse(withBalance.init({}, 0));

// --- same-reference discipline.
const before = state;
state = definition.apply(state, { type: 'request/header', seq: 9, time: 0, data: { header: {}, reason: 'initial' } });
check('ignored event keeps the state reference', state === before, true);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
