// Render BOTH browser halves against stubbed browser globals: the skin's stylesheet, the
// cost strip's stylesheet, its slot registration, and the strip's output for every balance
// state — including the colour bands. Runs in plain Node, no browser needed.
const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(label);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
};
const checkThat = (label, condition, detail = '') => {
  if (!condition) failures.push(label);
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${condition ? '' : ` ${detail}`}`);
};

// --- browser globals ---------------------------------------------------------------
const loaded = [];
const styleTags = [];
globalThis.window = { __ModuleLoader__: { load: (mod) => { loaded.push(mod); } } };
globalThis.document = {
  head: { appendChild: (tag) => styleTags.push(tag) },
  createElement: () => ({ dataset: {}, textContent: '', remove() { this.removed = true; } }),
};

await import('../dsh-codex-skin/client.js');
await import('../dsh-cost-meter/client.js');

const load = (id) => {
  const mod = loaded.find((entry) => entry.id === id);
  if (!mod) throw new Error(`bundle ${id} did not register a factory`);
  return mod;
};
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }) };
const requireStub = (name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected module request: ${name}`);
};

// Apply one bundle and return its plugin, its slot registrations and its stylesheet.
function runBundle(id) {
  const mod = load(id);
  const plugin = mod.factory(requireStub);
  const registered = [];
  const services = new Map();
  const ctx = {
    effect: (fn) => fn(),
    get: (key) => services.get(key),
    slots: {
      inject: (_key, callback) => callback(),
      register: (options, component) => { registered.push({ options, component }); return () => {}; },
    },
  };
  plugin.apply(ctx);
  const tag = styleTags.find((entry) => entry.dataset.plugin === id);
  return { mod, plugin, registered, ctx, services, css: tag?.textContent ?? '', declared: styleTags.filter((e) => e.dataset.plugin === id).length };
}

check('both bundles register a factory', loaded.map((m) => m.id).sort(), ['@local/dsh-codex-skin', '@local/dsh-cost-meter']);

const skin = runBundle('@local/dsh-codex-skin');
const cost = runBundle('@local/dsh-cost-meter');

// --- skin half --------------------------------------------------------------------
check('skin injects no service', skin.plugin.inject, []);
check('skin inserts exactly one stylesheet', skin.declared, 1);
check('skin registers no slot entry', skin.registered.length, 0);
checkThat('skin declares the light bubble as pale blue', skin.css.includes('--dsw-specific-bubble: #e9f1ff;'));
checkThat('skin declares the dark bubble as saturated blue', /--dsw-specific-bubble: #2563eb;/.test(skin.css));
checkThat('skin keeps the composer white', skin.css.includes('--dsw-specific-input-major: #ffffff;'));
checkThat('skin gives the soft tier a halo', /--dsw-elevation-soft: var\(--dsw-elevation-stroke\), 0 2px 8px/.test(skin.css));
checkThat('skin gives dark mode its own halo', skin.css.includes('html body[data-ds-dark-theme] *'));
checkThat('skin zeroes the inline-code outline', skin.css.includes('border: 0;'));
checkThat('skin lists both palettes', skin.css.includes('html body {') && skin.css.includes('html body[data-ds-dark-theme] {'));
checkThat('skin avoids !important', !skin.css.replace(/\/\*[\s\S]*?\*\//g, '').includes('!important'));
checkThat('skin carries no strip CSS', !skin.css.includes('codex-cost-strip'));
checkThat('skin carries no severity scale', !skin.css.includes('dsh-codex-sev'));
checkThat('skin has no backtick inside its stylesheet', !skin.css.includes('`'));

// The renderer draws the inline-code outline, so the override must outrank it — compute the
// numeric claim rather than trusting it.
function specificity(selector) {
  let ids = 0;
  let classes = 0;
  let types = 0;
  const rest = selector.replace(/:not\(([^)]*)\)/g, (_match, inner) => {
    const best = inner
      .split(',')
      .map((part) => specificity(part))
      .sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2])
      .pop();
    ids += best[0];
    classes += best[1];
    types += best[2];
    return ' ';
  });
  ids += (rest.match(/#[\w-]+/g) ?? []).length;
  classes += (rest.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+(?:\([^)]*\))?/g) ?? []).length;
  types += (rest.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) ?? []).length;
  types += (rest.match(/::[\w-]+/g) ?? []).length;
  return [ids, classes, types];
}
const compareSpecificity = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
const rendererRule = '._markdown_1ypvv_5 :not(pre)>code';
const ourRule = 'html body [class] :not(pre) > code';
check('renderer rule specificity', specificity(rendererRule), [0, 1, 2]);
check('our override specificity', specificity(ourRule), [0, 1, 4]);
checkThat('our override outranks the renderer rule', compareSpecificity(specificity(ourRule), specificity(rendererRule)) > 0);
checkThat('the stylesheet uses that selector', skin.css.replace(/\/\*[\s\S]*?\*\//g, '').includes('[class] :not(pre) > code {'));

// --- cost half --------------------------------------------------------------------
const costCss = cost.css.replace(/\/\*[\s\S]*?\*\//g, '');
check('cost injects slots', cost.plugin.inject, ['slots']);
check('cost inserts exactly one stylesheet', cost.declared, 1);
check('cost registers exactly one slot entry', cost.registered.map((r) => r.options.id), ['codex-cost']);
check('the entry targets the composer dock', cost.registered[0].options.name, 'conversation.composer.dock');
checkThat('cost carries no skin tokens', !costCss.includes('--dsw-static-neutral-bluish-00') && !costCss.includes('--dsw-specific-bubble'));
checkThat('cost declares its own severity scale', ['--dsh-codex-sev-ok: #0f7b3f', '--dsh-codex-sev-warn: #b45309', '--dsh-codex-sev-bad: #c0362c'].every((line) => costCss.includes(line)));
checkThat('cost declares the dark severity scale', ['--dsh-codex-sev-ok: #3fb950', '--dsh-codex-sev-warn: #d29922', '--dsh-codex-sev-bad: #f85149'].every((line) => costCss.includes(line)));
checkThat('cost styles its strip', costCss.includes('.codex-cost-strip__item'));
checkThat('cost avoids !important', !costCss.includes('!important'));
checkThat('cost has no backtick inside its stylesheet', !cost.css.includes('`'));
checkThat('cost braces balance', (costCss.match(/{/g) ?? []).length === (costCss.match(/}/g) ?? []).length);

// --- the strip's rendering ---------------------------------------------------------
const services = cost.services;
services.set('locale', { getSnapshot: () => ({ active: 'zh-CN' }) });
const strip = cost.registered[0].component;
const projectionWith = (balance, extra = {}) => ({
  steps: 195,
  pricedSteps: 195,
  unpricedSteps: 0,
  totalTokens: 57_000_000,
  freshInputTokens: 269_862,
  cacheReadTokens: 56_480_384,
  cacheWriteTokens: 0,
  outputTokens: 208_090,
  reasoningTokens: 0,
  sessionCost: 2.23183,
  currentTurnCost: 0.42,
  lastTurnCost: 1.1,
  cacheHitPercent: 99.52,
  currency: 'CNY',
  pricingSource: 'table',
  holidayCount: 33,
  balance,
  ...extra,
});

const textOf = (node) => {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.children ?? []);
};
const itemsOf = (node, out = []) => {
  if (Array.isArray(node)) {
    node.forEach((child) => itemsOf(child, out));
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  const cls = node.props?.className;
  if (typeof cls === 'string' && cls.includes('codex-cost-strip__item')) {
    const kids = (node.children ?? []).filter(Boolean);
    const valueNode = kids[kids.length - 1];
    out.push({ label: kids.length > 1 ? textOf(kids[0]) : '', text: textOf(valueNode), className: valueNode?.props?.className ?? '' });
    return out;
  }
  (node.children ?? []).forEach((child) => itemsOf(child, out));
  return out;
};
const severityOf = (tree, label) => {
  const found = itemsOf(tree).find((entry) => entry.label === label);
  if (!found) return `(no item labelled ${label})`;
  const match = /codex-cost-strip__value--sev-(\w+)/.exec(found.className);
  return match ? match[1] : 'none';
};
const renderWith = (balance, sessionCost) =>
  strip({ useProjection: () => projectionWith(balance, sessionCost === undefined ? {} : { sessionCost }) });

let tree = renderWith({ status: 'ready', currency: 'CNY', total: '123.4567', bonus: '8.00', wallets: 2, source: 'account' });
let text = textOf(tree);
checkThat('ready strips render the balance', text.includes('¥123.46'), `got: ${text}`);
checkThat('ready strips render the bonus row', text.includes('¥8.00'), `got: ${text}`);
checkThat('ready strips render the session cost', text.includes('¥2.232'), `got: ${text}`);
checkThat('ready strips render the turn cost', text.includes('¥0.4200'), `got: ${text}`);
checkThat('ready strips render the cache share', text.includes('100%'), `got: ${text}`);

text = textOf(renderWith({ status: 'ready', currency: 'CNY', total: '0', bonus: '0', wallets: 0, source: 'account' }));
checkThat('zero balance shows ¥0.00', text.includes('¥0.00'), `got: ${text}`);

for (const [status, expected] of [
  ['pending', '余额读取中'],
  ['absent', '账户未登录'],
  ['failed', '平台查询失败'],
  ['empty', '账户无可用钱包'],
  ['error', '余额读取异常'],
  ['unavailable', '未接入账户服务'],
  ['disabled', '余额读取已关闭'],
]) {
  text = textOf(renderWith({ status }));
  checkThat(`${status} is named`, text.includes(expected), `got: ${text}`);
}
text = textOf(renderWith({ status: 'weird', reason: 'raw-reason-text' }));
checkThat('unmapped outcome shows its raw reason', text.includes('raw-reason-text'), `got: ${text}`);
text = textOf(renderWith(undefined));
checkThat('missing balance field renders a dash, not a crash', text.includes('余额'), `got: ${text}`);
text = textOf(strip({ useProjection: () => undefined }));
checkThat('missing projection shows the pending marker', text.includes('用量计量待接入'), `got: ${text}`);
let threw = false;
try {
  text = textOf(strip({ useProjection: () => { throw new Error('hook exploded'); } }));
} catch { threw = true; }
checkThat('throwing projection hook does not crash the entry', threw === false && text.includes('用量计量待接入'), `threw=${threw}`);
threw = false;
try { strip({}); } catch { threw = true; }
checkThat('missing useProjection prop does not crash', threw === false);

// --- colour bands ------------------------------------------------------------------
check('balance 60 -> ok', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '60', bonus: '0' }), '余额'), 'ok');
check('balance 30 + 30 bonus -> ok (total 60)', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '30', bonus: '30' }), '余额'), 'ok');
check('balance 50 boundary -> warn', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '50', bonus: '0' }), '余额'), 'warn');
check('balance 50.01 -> ok', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '50.01', bonus: '0' }), '余额'), 'ok');
check('balance 15 boundary -> bad', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '15', bonus: '0' }), '余额'), 'bad');
check('balance 15.01 -> warn', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '15.01', bonus: '0' }), '余额'), 'warn');
check('balance 0 -> bad', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '0', bonus: '0' }), '余额'), 'bad');
check('unread balance carries no colour', severityOf(renderWith({ status: 'failed', reason: 'x' }), '余额'), 'none');
check('session 9.99 -> ok', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '99', bonus: '0' }, 9.99), '本对话'), 'ok');
check('session 10 boundary -> warn', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '99', bonus: '0' }, 10), '本对话'), 'warn');
check('session 20 boundary -> warn', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '99', bonus: '0' }, 20), '本对话'), 'warn');
check('session 20.01 -> bad', severityOf(renderWith({ status: 'ready', currency: 'CNY', total: '99', bonus: '0' }, 20.01), '本对话'), 'bad');
const coloured = renderWith({ status: 'ready', currency: 'CNY', total: '30', bonus: '8', source: 'account' }, 20.01);
check('bonus row stays neutral', severityOf(coloured, '赠送'), 'none');
check('turn row stays neutral', severityOf(coloured, '本轮'), 'none');
check('tokens row stays neutral', severityOf(coloured, 'tokens'), 'none');
const overridden = strip({
  useProjection: () =>
    projectionWith(
      { status: 'ready', currency: 'CNY', total: '60', bonus: '0' },
      { thresholds: { balance: { green: 100, orange: 20 }, session: { green: 1, red: 2 } } },
    ),
});
check('override: balance 60 -> warn under green 100', severityOf(overridden, '余额'), 'warn');
check('override: session 2.23 -> bad under red 2', severityOf(overridden, '本对话'), 'bad');

// The tooltip keeps the bucket detail and the verdict.
const detail = renderWith({ status: 'failed', reason: 'platform-query-failed' }).props.title;
checkThat('tooltip lists the token buckets', detail.includes('cache read: 56480384'), detail);
checkThat('tooltip names the balance outcome', detail.includes('balance: failed'), detail);

console.log(failures.length === 0 ? '\nALL CLIENT CHECKS PASSED' : `\n${failures.length} FAILED: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
