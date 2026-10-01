/**
 * @local/dsh-cost-meter — browser half: the balance and cost strip.
 *
 * Registers one entry in the composer dock and renders the Host-computed `codexCost`
 * projection: balance (read on the Host, never here), this conversation's spend,
 * the in-flight turn, token buckets and cache-hit share, with the balance and session
 * figures painted by the severity bands below.
 *
 * The client never reads a credential and never folds the session log.
 *
 * Its stylesheet is its own: the strip layout plus the severity colours. It needs
 * nothing from the skin bundle and works on the shipped theme unchanged.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-cost-meter',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PLUGIN_ID = '@local/dsh-cost-meter';
    const PROJECTION_KEY = 'codexCost';
    const SLOT = 'conversation.composer.dock';

    const STRIP_CSS = `/* Severity scale for the status strip, tuned per palette: readable as small text on
   white in light mode and on near-black in dark mode. This is the strip's own scale, so
   it never repaints the host's --dsw-alias-state-* semantic colours. */
html body {
  --dsh-codex-sev-ok: #0f7b3f;
  --dsh-codex-sev-warn: #b45309;
  --dsh-codex-sev-bad: #c0362c;
}
html body[data-ds-dark-theme] {
  --dsh-codex-sev-ok: #3fb950;
  --dsh-codex-sev-warn: #d29922;
  --dsh-codex-sev-bad: #f85149;
}
/* ---- Status strip -------------------------------------------------------------- */
.codex-cost-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  row-gap: 4px;
  flex-wrap: wrap;
  min-width: 0;
  padding: 2px 2px 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.codex-cost-strip__item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
}
.codex-cost-strip__label {
  opacity: 0.72;
}
.codex-cost-strip__value {
  color: var(--dsw-alias-label-primary);
}
.codex-cost-strip__value--muted {
  color: var(--dsw-alias-label-secondary);
}
/* The strip's own severity scale. These are the strip's data colours, not host surfaces:
   the light values are chosen to stay legible as small text on white and the dark values
   on near-black, and nothing else in the application reads them. */
.codex-cost-strip__value--sev-ok {
  color: var(--dsh-codex-sev-ok);
}
.codex-cost-strip__value--sev-warn {
  color: var(--dsh-codex-sev-warn);
}
.codex-cost-strip__value--sev-bad {
  color: var(--dsh-codex-sev-bad);
}
.codex-cost-strip__sep {
  width: 1px;
  height: 10px;
  background: var(--dsw-alias-border-l2);
  flex: 0 0 auto;
}
`;

    /** Minimal labels; the active locale id chooses the dictionary. */
    const LABELS = {
      zh: {
        balance: '余额',
        bonus: '赠送',
        session: '本对话',
        turn: '本轮',
        tokens: 'tokens',
        cache: '缓存',
        unavailable: '—',
        fallbackNote: '（含未配价模型，按默认价估算）',
        estimate: '按本地价格表估算，非平台账单',
        detailTitle: '用量明细',
        pending: '用量计量待接入',
        balanceReasons: {
          disabled: '余额读取已关闭',
          pending: '余额读取中',
          unavailable: '未接入账户服务',
          absent: '账户未登录',
          failed: '平台查询失败',
          empty: '账户无可用钱包',
          error: '余额读取异常',
          'no-account-service': '未接入账户服务',
          'no-account-credential': '账户未登录',
          'platform-query-failed': '平台查询失败',
          'no-wallet-in-account': '账户无可用钱包',
          'no-credentials-service': '无凭据服务',
          'no-api-key': '未配置 API Key',
        },
      },
      en: {
        balance: 'Balance',
        bonus: 'Bonus',
        session: 'This chat',
        turn: 'Turn',
        tokens: 'tokens',
        cache: 'cache',
        unavailable: '—',
        fallbackNote: '(some models priced by fallback)',
        estimate: 'Estimated from the local price table, not a platform bill',
        detailTitle: 'Usage detail',
        pending: 'usage meter pending',
        balanceReasons: {
          disabled: 'balance read disabled',
          pending: 'reading balance',
          unavailable: 'no account service',
          absent: 'not signed in',
          failed: 'platform query failed',
          empty: 'no wallet in account',
          error: 'balance read failed',
          'no-account-service': 'no account service',
          'no-account-credential': 'not signed in',
          'platform-query-failed': 'platform query failed',
          'no-wallet-in-account': 'no wallet in account',
          'no-credentials-service': 'no credentials service',
          'no-api-key': 'no API key configured',
        },
      },
    };

    function labelsFor(active) {
      return typeof active === 'string' && active.toLowerCase().startsWith('zh') ? LABELS.zh : LABELS.en;
    }

    /** Compact token counts: 1234 -> 1.2k, 1234567 -> 1.2M. */
    function formatTokens(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
      if (value < 1000) return String(Math.round(value));
      if (value < 1e6) return `${(value / 1e3).toFixed(value < 1e4 ? 2 : 1)}k`;
      return `${(value / 1e6).toFixed(2)}M`;
    }

    const CURRENCY_SYMBOL = { CNY: '¥', RMB: '¥', USD: '$', EUR: '€', JPY: '¥', HKD: 'HK$' };

    /**
     * Cost figures need more resolution than a balance: sub-cent amounts must stay
     * visible, so they are rendered from four significant decimals and never round to 0.
     */
    function formatCost(value, currency) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
      const symbol = CURRENCY_SYMBOL[currency] ?? (currency ? `${currency} ` : '');
      if (value === 0) return `${symbol}0`;
      if (value >= 1) return `${symbol}${value.toFixed(3)}`;
      if (value >= 0.001) return `${symbol}${value.toFixed(4)}`;
      return `${symbol}${value.toExponential(2)}`;
    }

    /** Platform balances arrive as decimal strings; keep two decimals like the host UI. */
    function formatAmount(amount, currency) {
      if (typeof amount !== 'string' && typeof amount !== 'number') return null;
      const numeric = Number(amount);
      if (!Number.isFinite(numeric)) return null;
      const symbol = CURRENCY_SYMBOL[currency] ?? (currency ? `${currency} ` : '');
      const abs = Math.abs(numeric);
      if (abs === 0) return `${symbol}0.00`;
      if (abs < 0.01) return `${symbol}<0.01`;
      return `${numeric < 0 ? '-' : ''}${symbol}${abs.toFixed(2)}`;
    }

    function joinClasses(...values) {
      return values.filter(Boolean).join(' ');
    }

    /**
     * Read a Client service through `ctx.get` only: the restricted client context is
     * documented to be read that way, and property access on an un-injected service may
     * not be answerable.
     */
    function service(ctx, key) {
      try {
        return typeof ctx.get === 'function' ? ctx.get(key) : undefined;
      } catch (error) {
        console.error(`[codex-skin] service "${key}" unavailable`, error);
        return undefined;
      }
    }

    /** The active locale id, read once per render; a failure falls back to English. */
    function activeLocale(ctx) {
      try {
        return service(ctx, 'locale')?.getSnapshot?.()?.active;
      } catch {
        return undefined;
      }
    }

    function item(label, value, valueClass) {
      return h(
        'span',
        { className: 'codex-cost-strip__item' },
        label ? h('span', { className: 'codex-cost-strip__label' }, label) : null,
        h('span', { className: joinClasses('codex-cost-strip__value', valueClass) }, value),
      );
    }

    function separator() {
      return h('span', { className: 'codex-cost-strip__sep', 'aria-hidden': true });
    }

    /**
     * Human text for an unreadable balance. An unmapped outcome falls back to its own raw
     * reason, so the strip can never show a bare dash that hides the cause.
     */
    function balanceHint(balance, labels) {
      if (!balance) return labels.unavailable;
      const known = labels.balanceReasons[balance.status] ?? labels.balanceReasons[balance.reason];
      if (known) return known;
      return typeof balance.reason === 'string' && balance.reason ? balance.reason : labels.unavailable;
    }

    /**
     * Severity thresholds, in the displayed currency.
     *
     * A value exactly on a boundary belongs to the MORE severe band, so a balance of 50 is
     * orange and 15 is red; a session cost of 10 or 20 is orange.
     */
    const DEFAULT_THRESHOLDS = {
      balance: { green: 50, orange: 15 },
      session: { green: 10, red: 20 },
    };

    /** Credit (recharge + bonus): > green is fine, > orange is a warning, else critical. */
    function balanceSeverityOf(total, thresholds) {
      if (!Number.isFinite(total)) return undefined;
      if (total > thresholds.green) return 'ok';
      return total > thresholds.orange ? 'warn' : 'bad';
    }

    /** This conversation's spend: < green is fine, up to red is a warning, else critical. */
    function sessionSeverityOf(cost, thresholds) {
      if (!Number.isFinite(cost)) return undefined;
      if (cost < thresholds.green) return 'ok';
      return cost <= thresholds.red ? 'warn' : 'bad';
    }

    function severityClass(severity) {
      return severity === undefined ? undefined : `codex-cost-strip__value--sev-${severity}`;
    }

    function mergeThresholds(projection) {
      const provided = projection?.thresholds ?? {};
      return {
        balance: { ...DEFAULT_THRESHOLDS.balance, ...(provided.balance ?? {}) },
        session: { ...DEFAULT_THRESHOLDS.session, ...(provided.session ?? {}) },
      };
    }

    /** The status strip: balance, session cost, turn cost, token/cache figures. */
    function createStrip(ctx) {
      return function CostStrip(props) {
        const useProjection = props?.useProjection;
        const active = activeLocale(ctx);

        // A throwing slot entry blanks its seat, so the projection read is defended: an
        // unknown or not-yet-delivered key must degrade to a balance-only strip.
        let projection;
        try {
          projection = typeof useProjection === 'function' ? useProjection(PROJECTION_KEY) : undefined;
        } catch (error) {
          projection = undefined;
          console.error('[codex-skin] projection read failed', error);
        }

        try {
          return renderStrip();
        } catch (error) {
          console.error('[codex-skin] strip render failed', error);
          return h('div', { className: 'codex-cost-strip' });
        }

        function renderStrip() {
          const labels = labelsFor(active);
          const hasCost = typeof projection?.sessionCost === 'number';
          const balance = projection?.balance ?? null;
          const balanceReady = balance?.status === 'ready';
          const balanceText = balanceReady
            ? formatAmount(balance.total, balance.currency) ?? labels.unavailable
            : balanceHint(balance, labels);
          const bonusText = balanceReady && Number(balance.bonus) > 0 ? formatAmount(balance.bonus, balance.currency) : null;

          const currency = typeof projection?.currency === 'string' ? projection.currency : 'CNY';
          const fallback = projection?.pricingSource === 'fallback';

          // Colour rules: the balance band uses the TOTAL credit (recharge + bonus), and
          // the session band uses this conversation only — the turn figure stays neutral.
          const thresholds = mergeThresholds(projection);
          const balanceTotal = balanceReady ? Number(balance.total ?? 0) + Number(balance.bonus ?? 0) : undefined;
          const balanceSeverity = balanceSeverityOf(balanceTotal, thresholds.balance);
          const sessionSeverity = hasCost ? sessionSeverityOf(projection.sessionCost, thresholds.session) : undefined;

          const detail = [
            hasCost ? labels.detailTitle : labels.pending,
            hasCost
              ? [
                  `fresh input: ${Math.round(projection.freshInputTokens)} tok`,
                  `cache read: ${Math.round(projection.cacheReadTokens)} tok`,
                  `cache write: ${Math.round(projection.cacheWriteTokens)} tok`,
                  `output: ${Math.round(projection.outputTokens)} tok`,
                  `reasoning: ${Math.round(projection.reasoningTokens)} tok`,
                  `priced steps: ${projection.pricedSteps}${projection.unpricedSteps > 0 ? ` (+${projection.unpricedSteps} fallback)` : ''}`,
                  `holidays in table: ${projection.holidayCount ?? 0}`,
                ].join('\n')
              : '',
            balanceReady
              ? `balance: ${balance.total} ${balance.currency} + bonus ${balance.bonus} = ${balanceTotal} (${balance.source ?? 'account'}) → ${balanceSeverity}`
              : `balance: ${balance?.status ?? 'absent'}${balance?.reason ? ` — ${balance.reason}` : ''}`,
            hasCost
              ? `session cost: ${projection.sessionCost.toFixed(6)} → ${sessionSeverity} (green < ${thresholds.session.green}, red > ${thresholds.session.red})`
              : '',
            labels.estimate,
          ]
            .filter(Boolean)
            .join('\n');

          const children = [];
          children.push(
            item(
              labels.balance,
              balanceText,
              balanceReady ? severityClass(balanceSeverity) : 'codex-cost-strip__value--muted',
            ),
          );
          if (bonusText) children.push(item(labels.bonus, bonusText, 'codex-cost-strip__value--muted'));
          if (hasCost) {
            children.push(separator());
            children.push(item(labels.session, formatCost(projection.sessionCost, currency), severityClass(sessionSeverity)));
            if (typeof projection.currentTurnCost === 'number' && projection.currentTurnCost > 0) {
              children.push(
                item(labels.turn, formatCost(projection.currentTurnCost, currency), 'codex-cost-strip__value--muted'),
              );
            }
            children.push(separator());
            children.push(item(labels.tokens, formatTokens(projection.totalTokens), 'codex-cost-strip__value--muted'));
            children.push(
              item(labels.cache, `${Math.round(projection.cacheHitPercent)}%`, 'codex-cost-strip__value--muted'),
            );
            if (fallback) children.push(item('', labels.fallbackNote, 'codex-cost-strip__value--sev-warn'));
          } else {
            children.push(item('', labels.pending, 'codex-cost-strip__value--muted'));
          }

          return h('div', { className: 'codex-cost-strip', title: detail }, children);
        }
      };
    }

    /** The plugin-owned stylesheet: one tag, removed with the plugin's effect. */
    function insertSkin() {
      const tag = document.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = `${PLUGIN_ID}/strip`;
      tag.textContent = STRIP_CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    const inject = ['slots'];

    function apply(ctx) {
      // Style ownership rides this plugin's fiber, so disabling the plugin removes the
      // strip and its colour scale without a page reload.
      if (typeof ctx.effect === 'function') ctx.effect(insertSkin, 'codex-cost strip stylesheet');
      else insertSkin();

      ctx.slots.inject(SLOT, () =>
        ctx.slots.register({ name: SLOT, id: 'codex-cost', order: 10 }, createStrip(ctx)),
      );
    }

    return { inject, apply, name: 'codex-cost' };
  },
});
