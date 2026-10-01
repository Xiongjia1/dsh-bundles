// Exercise the Host half's apply() path: balance legs -> wire view, plus failure reporting.
import { apply, PROJECTION_KEY } from '../dsh-cost-meter/index.js';

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(label);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
};

function makeCtx({ account, credentials } = {}) {
  const services = new Map();
  if (account) services.set('deepseekAccount', account);
  if (credentials) services.set('credentials', credentials);
  const ctx = {
    effects: [],
    get: (name) => services.get(name),
    effect(fn, label) {
      ctx.effects.push(label ?? 'effect');
      return fn() ?? (() => {});
    },
    sessionProjections: {
      register(definition) {
        services.set('definition', definition);
        return () => {};
      },
    },
    definition: () => services.get('definition'),
  };
  return ctx;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
const balanceOf = (ctx) => {
  const definition = ctx.definition();
  return definition.wire.view(definition.init({}, 0)).balance;
};

// 1) account route ready: recharge wallet first, bonus reported separately.
const ready = makeCtx({ account: { getBalance: async () => ({ status: 'ready', value: [{ currency: 'CNY', balance: '88.80' }], bonusWallets: [{ currency: 'CNY', balance: '12.34' }] }) } });
apply(ready, undefined);
await settle();
check('account route registers the unit', ready.definition().key, PROJECTION_KEY);
check('unit stateVersion', ready.definition().stateVersion, 2);
const readyBalance = balanceOf(ready);
check(
  'ready balance reaches the view',
  { status: readyBalance.status, currency: readyBalance.currency, total: readyBalance.total, bonus: readyBalance.bonus, wallets: readyBalance.wallets, source: readyBalance.source },
  { status: 'ready', currency: 'CNY', total: '88.80', bonus: '12.34', wallets: 2, source: 'account' },
);
check('holiday table size reaches the view', ready.definition().wire.view(ready.definition().init({}, 0)).holidayCount, 33);
check(
  'thresholds reach the view',
  ready.definition().wire.view(ready.definition().init({}, 0)).thresholds,
  { balance: { green: 50, orange: 15 }, session: { green: 10, red: 20 } },
);
check('balance is not part of the persistent state', Object.hasOwn(ready.definition().init({}, 0), 'balance'), false);

// 2) the three distinct non-ready answers of the account service stay distinct.
const absent = makeCtx({ account: { getBalance: async () => null } });
apply(absent, {});
await settle();
check('null answer (no grant) is reported as absent', balanceOf(absent).status, 'absent');

const failed = makeCtx({ account: { getBalance: async () => ({ status: 'failed' }) } });
apply(failed, {});
await settle();
check('{status:failed} stays a failed query', balanceOf(failed).status, 'failed');

const zero = makeCtx({ account: { getBalance: async () => ({ status: 'ready', value: [], bonusWallets: [] }) } });
apply(zero, {});
await settle();
check(
  'present-but-empty wallets are a real zero balance',
  { status: balanceOf(zero).status, total: balanceOf(zero).total, wallets: balanceOf(zero).wallets },
  { status: 'ready', total: '0', wallets: 0 },
);

const shapeless = makeCtx({ account: { getBalance: async () => ({ status: 'ready' }) } });
apply(shapeless, {});
await settle();
check('unrecognized shape is reported as empty', balanceOf(shapeless).status, 'empty');

// 3) reason text always names both legs.
const bare = makeCtx({});
apply(bare, {});
await settle();
check('both legs named when neither is available', balanceOf(bare).reason, 'no-account-service | api-key: no-credentials-service');

// 4) API-key fallback through the published endpoint.
const originalFetch = globalThis.fetch;
let seenUrl = null;
let seenAuth = null;
globalThis.fetch = async (url, init) => {
  seenUrl = url;
  seenAuth = init?.headers?.authorization;
  return { ok: true, status: 200, json: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '7.50', granted_balance: '1.00' }] }) };
};
const apiKey = makeCtx({ credentials: { resolve: async (ref) => (ref === 'DEEPSEEK_API_KEY' ? { value: 'sk-test' } : undefined) } });
apply(apiKey, { apiBase: 'https://api.deepseek.com' });
await settle();
check(
  'api-key fallback reaches the view',
  { status: balanceOf(apiKey).status, source: balanceOf(apiKey).source, total: balanceOf(apiKey).total },
  { status: 'ready', source: 'api-key', total: '7.50' },
);
check('api-key endpoint called', seenUrl, 'https://api.deepseek.com/user/balance');
check('api-key sent as bearer', seenAuth, 'Bearer sk-test');

// 5) HTTP failure on the API-key leg is named, not swallowed.
globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
const keyRejected = makeCtx({ credentials: { resolve: async () => ({ value: 'sk-bad' }) } });
apply(keyRejected, {});
await settle();
check('http failure on the api-key leg is named', balanceOf(keyRejected).reason, 'no-account-service | api-key: http-401');
globalThis.fetch = originalFetch;

// 6) a throwing account read stays an error; readBalance:false stays disabled.
const throwing = makeCtx({ account: { getBalance: async () => { throw new Error('boom'); } } });
apply(throwing, {});
await settle();
check(
  'throwing account read is an error',
  { status: balanceOf(throwing).status, reason: balanceOf(throwing).reason },
  { status: 'error', reason: 'boom | api-key: no-credentials-service' },
);

const off = makeCtx({ account: { getBalance: async () => ({ status: 'ready', value: [{ currency: 'CNY', balance: '1' }], bonusWallets: [] }) } });
apply(off, { readBalance: false });
await settle();
check('readBalance:false is honoured', balanceOf(off).status, 'disabled');

for (const ctx of [ready, absent, failed, zero, shapeless, bare, apiKey, keyRejected, throwing, off]) {
  const definition = ctx.definition();
  definition.wire.viewSchema.parse(definition.wire.view(definition.init({}, 0)));
}
check('every produced view passes the wire schema', true, true);

console.log(failures.length === 0 ? '\nALL APPLY CHECKS PASSED' : `\n${failures.length} FAILED: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
