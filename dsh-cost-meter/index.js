/**
 * @local/dsh-cost-meter — Host half.
 *
 * Two responsibilities:
 *
 *  1. `codexCost` session projection: folds provider-reported usage from committed
 *     `assistant/message` events into per-Session token buckets and an estimated cost,
 *     priced with the operator-supplied price table under the published DeepSeek
 *     peak/off-peak tariff (weekends and Chinese statutory holidays are off-peak).
 *  2. Account balance: read on the Host, where the credential lives, and published
 *     through the same projection — the renderer never receives a token, and the
 *     client half needs no Remote call of its own.
 *
 * The fold is pure and synchronous and returns the SAME state reference for events it
 * ignores, which is what keeps the projection drive cheap. The balance deliberately
 * lives OUTSIDE the fold state: it is not derived from the session log, so it must not
 * reach the durable projection checkpoint.
 *
 * Appearance is not this bundle's business: beyond the strip's own layout and severity
 * colours it ships no stylesheet, and it works on the shipped theme with or without
 * @local/dsh-codex-skin.
 */

/** Cordis plugin name. */
export const name = 'codex-cost';

/** The projection registry is this half's whole purpose. */
export const inject = ['sessionProjections'];

/** Projection key shared by both halves. */
export const PROJECTION_KEY = 'codexCost';

/**
 * Default price table.
 *
 * Source: DeepSeek API 模型 & 价格 — https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * Units are the configured currency per ONE MILLION tokens. Peak hours are Beijing time
 * (UTC+8), Monday to Friday 09:00-12:00 and 14:00-18:00, EXCLUDING Chinese statutory
 * holidays; every other moment — including weekends and every statutory holiday, and so
 * including the make-up workdays that fall on a weekend — is off-peak at half of peak.
 */
export const DEFAULT_CONFIG = {
  currency: 'CNY',
  /** 'auto' follows the Beijing-time peak rule; 'always' | 'never' force one tariff. */
  offPeakMode: 'auto',
  /** Model used for pricing when the reported model name is absent from `models`. */
  fallbackModel: 'deepseek-flash',
  /**
   * Chinese statutory holidays (rest days), Beijing dates. Weekends are off-peak by the
   * tariff itself, so only weekday rest days matter here; the full published ranges are
   * kept for auditability. 2026 安排: 国务院办公厅 2025-11-04 通知.
   */
  holidays: [
    '2026-01-01', '2026-01-02', '2026-01-03',
    '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
    '2026-04-04', '2026-04-05', '2026-04-06',
    '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
    '2026-06-19', '2026-06-20', '2026-06-21',
    '2026-09-25', '2026-09-26', '2026-09-27',
    '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
  ],
  /** How often the Host re-reads the account balance, in milliseconds. */
  balanceRefreshMs: 60000,
  /** Set false to skip the balance read entirely (cost figures keep working). */
  readBalance: true,
  /**
   * Severity bands the status strip paints. A value exactly on a boundary takes the MORE
   * severe band, so a balance of 50 is orange and 15 is red. The balance band reads the
   * TOTAL credit (recharge + bonus); the session band reads this conversation's spend and
   * never the in-flight turn.
   */
  thresholds: {
    balance: { green: 50, orange: 15 },
    session: { green: 10, red: 20 },
  },
  models: {
    'deepseek-flash': {
      cacheHit: { peak: 0.04, offPeak: 0.02 },
      cacheMiss: { peak: 2, offPeak: 1 },
      cacheWrite: { peak: 2, offPeak: 1 },
      output: { peak: 8, offPeak: 4 },
    },
    'deepseek-v4-pro': {
      cacheHit: { peak: 0.3, offPeak: 0.15 },
      cacheMiss: { peak: 9, offPeak: 4.5 },
      cacheWrite: { peak: 9, offPeak: 4.5 },
      output: { peak: 27, offPeak: 13.5 },
    },
  },
};

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Beijing wall-clock facts for an epoch-millisecond instant. */
function beijingClock(ms) {
  const shifted = new Date(ms + BEIJING_OFFSET_MS);
  return {
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours() + shifted.getUTCMinutes() / 60,
    date: shifted.toISOString().slice(0, 10),
  };
}

/**
 * Whether an instant falls in a published DeepSeek peak window.
 *
 * @param ms - epoch milliseconds.
 * @param holidays - set of Beijing `YYYY-MM-DD` statutory rest days.
 */
function isPeakInstant(ms, holidays) {
  if (!Number.isFinite(ms)) return true;
  const { weekday, hour, date } = beijingClock(ms);
  if (weekday === 0 || weekday === 6) return false;
  if (holidays.has(date)) return false;
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Shallow-merge one model's tariff over its default. */
function mergeTariff(base, override) {
  const merged = { ...base };
  for (const bucket of ['cacheHit', 'cacheMiss', 'cacheWrite', 'output']) {
    const next = override?.[bucket];
    if (next === undefined || next === null) continue;
    if (typeof next === 'number') merged[bucket] = { peak: next, offPeak: next };
    else {
      merged[bucket] = {
        peak: numberOr(next.peak, base[bucket]?.peak ?? 0),
        offPeak: numberOr(next.offPeak, base[bucket]?.offPeak ?? base[bucket]?.peak ?? 0),
      };
    }
  }
  return merged;
}

/** Merge one band's thresholds over its default, ignoring non-numeric values. */
function mergeBand(base, provided) {
  const merged = { ...base };
  if (provided && typeof provided === 'object') {
    for (const [key, value] of Object.entries(provided)) {
      if (typeof value === 'number' && Number.isFinite(value)) merged[key] = value;
    }
  }
  return merged;
}

function resolvePricing(rawConfig) {
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const models = {};
  for (const [key, value] of Object.entries(DEFAULT_CONFIG.models)) models[key] = mergeTariff(value, undefined);
  for (const [key, value] of Object.entries(config.models ?? {})) {
    models[key] = mergeTariff(models[key] ?? DEFAULT_CONFIG.models[DEFAULT_CONFIG.fallbackModel], value);
  }
  const holidayList = Array.isArray(config.holidays)
    ? config.holidays
    : config.holidays === undefined
      ? DEFAULT_CONFIG.holidays
      : [];
  const holidays = new Set(holidayList.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)));
  const thresholds = config.thresholds && typeof config.thresholds === 'object' ? config.thresholds : {};
  return {
    currency: typeof config.currency === 'string' && config.currency ? config.currency : DEFAULT_CONFIG.currency,
    offPeakMode: ['auto', 'always', 'never'].includes(config.offPeakMode) ? config.offPeakMode : DEFAULT_CONFIG.offPeakMode,
    fallbackModel:
      typeof config.fallbackModel === 'string' && models[config.fallbackModel]
        ? config.fallbackModel
        : DEFAULT_CONFIG.fallbackModel,
    holidays,
    holidayCount: holidays.size,
    thresholds: {
      balance: mergeBand(DEFAULT_CONFIG.thresholds.balance, thresholds.balance),
      session: mergeBand(DEFAULT_CONFIG.thresholds.session, thresholds.session),
    },
    models,
  };
}

/** A duck-typed schema: the registry only ever calls `.parse()`. */
function schema(label, check) {
  return {
    parse(value) {
      if (!check(value)) throw new Error(`codex-cost: ${label} failed validation`);
      return value;
    },
  };
}

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const NUMERIC_VIEW_FIELDS = [
  'steps',
  'pricedSteps',
  'unpricedSteps',
  'totalTokens',
  'freshInputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'outputTokens',
  'reasoningTokens',
  'sessionCost',
  'currentTurnCost',
  'lastTurnCost',
  'cacheHitPercent',
];

const viewSchema = schema('wire view', (value) => {
  if (!isPlainObject(value)) return false;
  for (const key of NUMERIC_VIEW_FIELDS) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) return false;
  }
  if (typeof value.currency !== 'string' || typeof value.pricingSource !== 'string') return false;
  if (value.balance !== null && !isPlainObject(value.balance)) return false;
  return true;
});

const stateSchema = schema('state', (value) => {
  if (!isPlainObject(value)) return false;
  if (typeof value.steps !== 'number') return false;
  if (typeof value.sessionCost !== 'number') return false;
  if (typeof value.totalTokens !== 'number') return false;
  return value.openTurn === null || isPlainObject(value.openTurn);
});

function emptyState() {
  return {
    steps: 0,
    pricedSteps: 0,
    unpricedSteps: 0,
    totalTokens: 0,
    freshInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    sessionCost: 0,
    openTurn: null,
    lastTurnCost: 0,
    lastPricedModel: '',
  };
}

/** Provider-reported bucket reads, guarded exactly like the shipped window fold. */
function readUsage(usage) {
  if (!isPlainObject(usage)) return null;
  const fresh = finite(usage.inputTokens);
  const output = finite(usage.outputTokens);
  const cacheRead = finite(usage.cacheReadTokens);
  const cacheWrite = finite(usage.cacheWriteTokens);
  const reasoning = finite(usage.reasoningTokens);
  const total = finite(usage.totalTokens) || fresh + output + cacheRead + cacheWrite;
  if (total === 0 && fresh === 0 && output === 0) return null;
  return { fresh, output, cacheRead, cacheWrite, reasoning, total };
}

function buildDefinition(pricing, readBalance) {
  const priceOf = (model, instant) => {
    const exact = Object.hasOwn(pricing.models, model);
    const tariff = exact ? pricing.models[model] : pricing.models[pricing.fallbackModel];
    if (tariff === undefined) return null;
    const unit =
      pricing.offPeakMode === 'always'
        ? 'offPeak'
        : pricing.offPeakMode === 'never'
          ? 'peak'
          : isPeakInstant(instant, pricing.holidays)
            ? 'peak'
            : 'offPeak';
    return { tariff, unit, exact };
  };

  const costOf = (usage, model, instant) => {
    const resolved = priceOf(model, instant);
    if (resolved === null) return { cost: 0, exact: false };
    const { tariff, unit, exact } = resolved;
    const rate = (bucket, fallbackBucket) => tariff[bucket]?.[unit] ?? tariff[fallbackBucket]?.[unit] ?? 0;
    const cost =
      (usage.fresh * rate('cacheMiss', 'cacheMiss') +
        usage.cacheRead * rate('cacheHit', 'cacheMiss') +
        usage.cacheWrite * rate('cacheWrite', 'cacheMiss') +
        usage.output * rate('output', 'output')) /
      1e6;
    return { cost: Number.isFinite(cost) && cost >= 0 ? cost : 0, exact };
  };

  return {
    key: PROJECTION_KEY,
    stateVersion: 2,
    stateSchema,
    init: () => emptyState(),
    apply: (state, event) => {
      switch (event.type) {
        case 'turn/start':
          return { ...state, openTurn: { turn: event.data.turn, cost: 0, tokens: 0 } };
        case 'assistant/message': {
          const usage = readUsage(event.data?.usage);
          if (usage === null) return state;
          const model = typeof event.data?.message?.source?.model === 'string' ? event.data.message.source.model : '';
          const { cost, exact } = costOf(usage, model, event.time);
          const openTurn = state.openTurn;
          return {
            ...state,
            totalTokens: state.totalTokens + usage.total,
            freshInputTokens: state.freshInputTokens + usage.fresh,
            cacheReadTokens: state.cacheReadTokens + usage.cacheRead,
            cacheWriteTokens: state.cacheWriteTokens + usage.cacheWrite,
            outputTokens: state.outputTokens + usage.output,
            reasoningTokens: state.reasoningTokens + usage.reasoning,
            sessionCost: state.sessionCost + cost,
            pricedSteps: state.pricedSteps + (exact ? 1 : 0),
            unpricedSteps: state.unpricedSteps + (exact ? 0 : 1),
            lastPricedModel: exact ? model : state.lastPricedModel,
            openTurn:
              openTurn === null || openTurn.turn !== event.data.turn
                ? openTurn
                : { ...openTurn, cost: openTurn.cost + cost, tokens: openTurn.tokens + usage.total },
          };
        }
        case 'turn/end': {
          if (state.openTurn === null) return state;
          return { ...state, openTurn: null, lastTurnCost: state.openTurn.cost };
        }
        case 'step/end':
          return { ...state, steps: state.steps + 1 };
        default:
          return state;
      }
    },
    wire: {
      viewSchema,
      view: (state) => {
        const billableInput = state.freshInputTokens + state.cacheReadTokens;
        return {
          steps: state.steps,
          pricedSteps: state.pricedSteps,
          unpricedSteps: state.unpricedSteps,
          totalTokens: state.totalTokens,
          freshInputTokens: state.freshInputTokens,
          cacheReadTokens: state.cacheReadTokens,
          cacheWriteTokens: state.cacheWriteTokens,
          outputTokens: state.outputTokens,
          reasoningTokens: state.reasoningTokens,
          sessionCost: state.sessionCost,
          currentTurnCost: state.openTurn === null ? 0 : state.openTurn.cost,
          lastTurnCost: state.lastTurnCost,
          cacheHitPercent: billableInput === 0 ? 0 : (state.cacheReadTokens / billableInput) * 100,
          currency: pricing.currency,
          pricingSource: state.unpricedSteps > 0 ? 'fallback' : 'table',
          holidayCount: pricing.holidayCount,
          // The strip's colour bands travel with the value so the client never hardcodes them.
          thresholds: pricing.thresholds,
          // Read outside the fold: the account balance is not log-derived, so it never
          // enters the durable projection checkpoint.
          balance: readBalance(),
        };
      },
    },
  };
}

// #region account balance (Host-side, credential never leaves the Host)

/** Latest balance snapshot, refreshed by the timer below. */
let balanceSnapshot = { status: 'pending' };

/** Wallet shapes differ between the account service and the API-key endpoint. */
function walletAmount(wallet) {
  if (!isPlainObject(wallet)) return null;
  const raw = wallet.balance ?? wallet.amount ?? wallet.total_balance;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw);
  return Number.isFinite(Number(text)) ? text : null;
}

function normalizeWallets(balance) {
  if (balance === null || balance === undefined) return null;
  const recharge = Array.isArray(balance) ? balance : Array.isArray(balance.value) ? balance.value : [];
  const bonus = Array.isArray(balance?.bonusWallets) ? balance.bonusWallets : [];
  // No wallet arrays at all means the shape is not one we understand; present-but-empty
  // arrays are a real answer (a zero balance) and must be reported as such.
  if (!Array.isArray(balance) && !Array.isArray(balance.value) && !Array.isArray(balance.bonusWallets)) return null;
  const wallet = recharge[0] ?? bonus[0];
  const total = walletAmount(wallet);
  if (total === null) return { currency: '', total: '0', bonus: '0', wallets: 0 };
  return {
    currency: typeof wallet?.currency === 'string' ? wallet.currency : '',
    total,
    bonus: walletAmount(bonus[0]) ?? '0',
    wallets: recharge.length + bonus.length,
  };
}

/**
 * One balance attempt on the account route.
 *
 * The shipped platform provider answers three ways: `null` when no grant is stored or
 * the platform rejected it, `{ status: 'failed' }` when the query itself failed, and
 * `{ status: 'ready', value, bonusWallets }` on success. Keeping those three distinct is
 * the point — collapsing them is what turned a failed query into a silent dash.
 */
async function readAccountBalance(ctx, settings) {
  const account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : undefined;
  if (account?.getBalance === undefined) return { status: 'unavailable', reason: 'no-account-service' };
  try {
    const detail = await account.getBalance({
      version: settings.clientVersion ?? '0.2.0-rc.2',
      locale: settings.locale ?? 'zh-CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    });
    if (detail === null) return { status: 'absent', reason: 'no-account-credential' };
    if (detail?.status === 'failed') return { status: 'failed', reason: 'platform-query-failed' };
    const wallets = normalizeWallets(detail);
    if (wallets === null) return { status: 'empty', reason: 'no-wallet-in-account' };
    return { status: 'ready', ...wallets };
  } catch (error) {
    return { status: 'error', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * `GET https://api.deepseek.com/user/balance` — the published balance endpoint of the
 * API-key route. The Host reads the key from the credentials service; it never reaches
 * the renderer. Returns `null` when this deployment holds no API key at all.
 */
async function readApiKeyBalance(ctx, settings) {
  const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined;
  if (credentials?.resolve === undefined) return { status: 'unavailable', reason: 'no-credentials-service' };
  const ref = typeof settings.apiKeyEnv === 'string' && settings.apiKeyEnv ? settings.apiKeyEnv : 'DEEPSEEK_API_KEY';
  const hit = await credentials.resolve(ref);
  const key = hit?.value;
  if (typeof key !== 'string' || key.length === 0) return { status: 'unavailable', reason: 'no-api-key' };
  const base = String(settings.apiBase ?? 'https://api.deepseek.com').replace(/\/+$/, '');
  let response;
  try {
    response = await fetch(`${base}/user/balance`, {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: AbortSignal.timeout(numberOr(settings.balanceTimeoutMs, 15000)),
    });
  } catch (error) {
    return { status: 'error', reason: `network:${error instanceof Error ? error.message : String(error)}` };
  }
  if (!response.ok) return { status: 'error', reason: `http-${response.status}` };
  const body = await response.json().catch(() => undefined);
  const info = Array.isArray(body?.balance_infos) ? body.balance_infos[0] : undefined;
  if (!isPlainObject(info)) return { status: 'error', reason: 'unexpected-payload' };
  const total = info.total_balance;
  if (total === undefined || total === null || !Number.isFinite(Number(String(total)))) {
    return { status: 'error', reason: 'unexpected-amount' };
  }
  return {
    status: 'ready',
    currency: typeof info.currency === 'string' ? info.currency : '',
    total: String(total),
    bonus: info.granted_balance === undefined || info.granted_balance === null ? '0' : String(info.granted_balance),
    wallets: 1,
  };
}

// #endregion

/**
 * Register the cost unit; the registration is an effect on this plugin's fiber, so
 * switching the plugin off removes the key together with its cached cells.
 *
 * @param ctx - registrant context carrying the projection registry.
 * @param config - the row's raw `config` (see DEFAULT_CONFIG for the shape).
 */
export function apply(ctx, config) {
  const pricing = resolvePricing(config);
  const settings = config && typeof config === 'object' ? config : {};
  const readBalanceEnabled = settings.readBalance !== false;
  const refreshMs = numberOr(settings.balanceRefreshMs, DEFAULT_CONFIG.balanceRefreshMs);

  const refreshBalance = async () => {
    if (!readBalanceEnabled) {
      balanceSnapshot = { status: 'disabled' };
      return;
    }
    const account = await readAccountBalance(ctx, settings);
    if (account.status === 'ready') {
      balanceSnapshot = { ...account, source: 'account', fetchedAt: Date.now() };
      return;
    }
    // Fall back to the published balance endpoint of the API-key route, when this
    // deployment stores a key for it. Both legs stay visible in the reason text, so a
    // dash never hides which one failed and why.
    const apiKey = await readApiKeyBalance(ctx, settings).catch((error) => ({
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    }));
    if (apiKey.status === 'ready') {
      balanceSnapshot = { ...apiKey, source: 'api-key', account: account.status, fetchedAt: Date.now() };
      return;
    }
    balanceSnapshot = {
      ...account,
      reason: `${account.reason ?? account.status} | api-key: ${apiKey.reason ?? apiKey.status}`,
      fetchedAt: Date.now(),
    };
  };

  if (typeof ctx.effect === 'function') {
    ctx.effect(() => {
      void refreshBalance();
      const timer = setInterval(() => void refreshBalance(), refreshMs);
      if (typeof timer.unref === 'function') timer.unref();
      return () => clearInterval(timer);
    }, 'codex-cost balance refresh');
  } else {
    void refreshBalance();
  }

  ctx.sessionProjections.register(buildDefinition(pricing, () => ({ ...balanceSnapshot })));
}

// Exported for the offline fold test: the tariff rule and the wallet normalizer are the
// two pieces worth pinning without a running Harness.
export { isPeakInstant, normalizeWallets, resolvePricing, buildDefinition };
