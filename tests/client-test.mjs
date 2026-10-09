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
// The shipped turn-rail stylesheet is the ONLY source of the rail's build-hashed class
// prefix, so this fixture is the real text `dsh-client-ui-chat` ships, copied verbatim from
// `TurnNavigator.module.css` inside app.asar. It pins both the discovery regex and the
// `@container` band the skin has to answer.
const RAIL_FIXTURE =
  '.xpvNua_slot{z-index:7;height:0;padding-inline:calc(var(--dsh-composer-side-clearance) + 16px);pointer-events:none;position:absolute;top:0;left:0;right:0;container-type:inline-size}' +
  '[data-conversation-scroll] .xpvNua_slot{position:sticky}' +
  '.xpvNua_frame{--turn-rail-band:calc(var(--dsh-conversation-viewport-height,100dvh) - var(--dsh-composer-height,152px));--turn-preview-height:100px;top:calc(var(--turn-rail-band) / 2);width:28px;max-height:min(max(0px, calc(var(--turn-rail-band) - 64px)), 420px);contain:layout;cursor:pointer;pointer-events:auto;position:absolute;right:12px;transform:translateY(-50%)}' +
  '.xpvNua_marks{position:relative}' +
  '.xpvNua_mark{cursor:pointer;background:0 0;border:0;border-radius:8px;height:10px;padding:0;position:absolute;top:0;left:0;right:0}' +
  '.xpvNua_mark:before{background:var(--dsw-alias-border-l4);content:"";transform-origin:100%;border-radius:2px;width:20px;height:2px;transition:transform .14s,background-color .14s;position:absolute;top:50%;right:0;transform:translateY(-50%)scaleX(.6)}' +
  '.xpvNua_markUnloaded:before{opacity:.6;transform:translateY(-50%)scaleX(.4)}' +
  '.xpvNua_markPreview:before{background:var(--dsw-alias-label-tertiary);transform:translateY(-50%)scaleX(.9)}' +
  '.xpvNua_markBusy:before{animation:1s ease-in-out infinite xpvNua_dsh-turn-mark-busy}' +
  '.xpvNua_markActive:before{background:var(--dsw-alias-label-primary);transform:translateY(-50%)scaleX(1)}' +
  '.xpvNua_preview{top:clamp(0px, calc(var(--turn-preview-center) - var(--turn-preview-height) / 2), calc(100% - var(--turn-preview-height)));box-sizing:border-box;width:min(300px,100cqw - 120px);max-height:var(--turn-preview-height);border-radius:var(--dsw-radius-lg);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel);pointer-events:none;border:0;padding:10px 12px;transition:top .14s cubic-bezier(.2,.8,.2,1);animation:.12s ease-out xpvNua_dsh-turn-preview-enter;position:absolute;right:calc(100% + 10px);overflow:hidden}' +
  '.xpvNua_previewPrompt{font:var(--dsw-font-xs-strong-13);-webkit-line-clamp:1}' +
  '.xpvNua_previewResponse{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxs-12);-webkit-line-clamp:3;margin-top:4px}' +
  '@container (width<=900px){.xpvNua_frame{display:none}}';

const loaded = [];
const styleTags = [];
globalThis.window = { __ModuleLoader__: { load: (mod) => { loaded.push(mod); } } };
globalThis.document = {
  head: { appendChild: (tag) => styleTags.push(tag) },
  createElement: () => ({
    dataset: {},
    style: {},
    textContent: '',
    hidden: true,
    appendChild() {},
    addEventListener() {},
    remove() { this.removed = true; },
  }),
  querySelector: (selector) =>
    String(selector).includes('TurnNavigator.module.css') ? { textContent: RAIL_FIXTURE } : null,
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
check('skin injects the slot service', skin.plugin.inject, ['slots']);
check('skin inserts one stylesheet per surface', skin.declared, 3);
check('skin registers the annotation chip in the composer dock', skin.registered.length, 1);
check('skin registers it under its own id', skin.registered[0]?.options, {
  name: 'conversation.input.dock',
  id: 'codex-annotations',
  order: 30,
});
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
// The shipped session strip already reports tokens and the cache share, so this strip must
// not print a second readout of the same quantities (they disagree in the last digit).
checkThat('the strip leaves token counts to the shipped strip', !itemsOf(tree).some((entry) => entry.label === 'tokens'));
checkThat('the strip leaves the cache share to the shipped strip', !itemsOf(tree).some((entry) => entry.label === '缓存'));

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
check('tokens row is gone (the shipped strip owns it)', severityOf(coloured, 'tokens'), '(no item labelled tokens)');
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
checkThat('tooltip keeps the total and the cache share the strip gave up', detail.includes('total: 57.00M tok · cache hit 100%'), detail);
checkThat('tooltip names the balance outcome', detail.includes('balance: failed'), detail);

// --- skin half: the turn rail ------------------------------------------------------
// DSH hides the rail under `@container (width<=900px)`, which is exactly the half-screen
// window the user runs. The override has to answer that band and name the rail's hashed
// classes, which the skin derives from the shipped stylesheet at runtime.
const internals = skin.plugin.apply.__test;
const railTag = styleTags.find((entry) => entry.dataset.pluginCss === '@local/dsh-codex-skin/rail');
const railCssText = railTag?.textContent ?? '';
const barTag = styleTags.find((entry) => entry.dataset.pluginCss === '@local/dsh-codex-skin/bar');
const barCssText = barTag?.textContent ?? '';

check('rail: the shipped band really is the hider', RAIL_FIXTURE.includes('@container (width<=900px){.xpvNua_frame{display:none}}'), true);
check('rail: prefix discovered from the shipped stylesheet', internals.railPrefixFrom(RAIL_FIXTURE), 'xpvNua');
check('rail: prefix undefined for a foreign stylesheet', internals.railPrefixFrom('.other_frameX{}'), undefined);
checkThat('rail: override stylesheet was inserted', railTag !== undefined && railCssText.includes('_markActive:before'));
checkThat('rail: override answers the shipped hide band', railCssText.includes('@container (width<=900px)'));
checkThat('rail: the frame is shown again inside that band', /@container \(width<=900px\) \{\s*html body \.xpvNua_frame \{\s*display: block/.test(railCssText));
checkThat('rail: override outranks the shipped hide rule', compareSpecificity(specificity('html body .xpvNua_frame'), specificity('.xpvNua_frame')) > 0);
checkThat('rail: override avoids !important', !railCssText.replace(/\/\*[\s\S]*?\*\//g, '').includes('!important'));
checkThat('rail: bars are shorter than the shipped 20px', railCssText.includes('width: 18px;'));
checkThat('rail: the summary card fits a narrow column', railCssText.includes('min(260px, 100cqw - 72px)'));
checkThat('rail: every selector is built from the discovered prefix', !internals.railCss('ZZZ').includes('xpvNua'));
checkThat('rail: the discovery path is the only place the prefix is named', internals.railCss('ZZZ').includes('.ZZZ_markActive:before'));
checkThat('rail: no backtick inside its stylesheet', !railCssText.includes('`'));

// --- skin half: attaching a selection to the next message --------------------------
// The annotation IS a draft file attachment: ui-conversation registers it, uploads it, the
// shipped rail draws its card, and the shipped send path carries it as a file part. So the
// skin's whole job is to hand the bytes over — and, because that path never touches the
// composer text, the excerpt can never be duplicated into the input box.
const draftsCreated = [];
const added = [];
const attachedFile = { parts: [], name: '', type: '' };
globalThis.File = class {
  constructor(parts, name, options) {
    attachedFile.parts = parts;
    attachedFile.name = name;
    attachedFile.type = options?.type ?? '';
  }
};
const actions = {
  addAttachments: (ids) => {
    added.push(ids);
    return true;
  },
};
const annotateCtx = {
  get: (key) =>
    key === 'sessions'
      ? { binding: (sessionId) => (sessionId === 'session-1' ? { sessionId } : undefined) }
      : key === 'conversation'
        ? {
            createDrafts: (sessionId, files) => {
              draftsCreated.push({ sessionId, files });
              return files.map((_file, index) => ({ id: `draft-${index}` }));
            },
          }
        : undefined,
};

check('text: a selection keeps its interior newlines', internals.selectionText('  a\r\nb  '), 'a\nb');
check('text: a whitespace-only selection carries nothing', internals.selectionText(' \n\t '), undefined);
check('text: a huge selection is capped', internals.selectionText('x'.repeat(25000)).length, 20000);

const sensor = internals.renderSensor;
check('sensor: draws nothing into the composer dock', sensor({ sessionId: 'session-1', inputActions: actions }), null);
check('sensor: publishes the live session', internals.bridge.sessionId, 'session-1');
checkThat('sensor: a live session can take an attachment', internals.canAttach());
check('attach: refused with nothing selected', internals.attachSelection(annotateCtx, '   '), false);
check('attach: registers exactly one draft file', internals.attachSelection(annotateCtx, 'quoted\nlines'), true);
check('attach: the draft belongs to the live session', draftsCreated.at(-1).sessionId, 'session-1');
check('attach: one file is registered', draftsCreated.at(-1).files.length, 1);
check('attach: the file carries the selection', attachedFile.parts, ['quoted\nlines']);
check('attach: the file is named for the chip', attachedFile.name, '1条注释');
check('attach: the file is plain text', attachedFile.type, 'text/plain');
check('attach: the draft id reaches the composer', added.at(-1), ['draft-0']);
check('attach: the excerpt is remembered for the card tooltip', internals.annotations.get('session-1'), ['quoted\nlines']);

const noConversation = { get: (key) => (key === 'sessions' ? { binding: () => ({}) } : undefined) };
check('attach: refused when the conversation service is missing', internals.attachSelection(noConversation, 'quoted'), false);
const noBinding = { get: (key) => (key === 'sessions' ? { binding: () => undefined } : annotateCtx.get(key)) };
check('attach: refused for a session with no binding', internals.attachSelection(noBinding, 'quoted'), false);
sensor({ sessionId: 'session-1', inputActions: { addAttachments: () => false } });
check('attach: refused while the composer refuses attachments', internals.attachSelection(annotateCtx, 'quoted'), false);
sensor({ sessionId: '', inputActions: actions });
check('attach: refused with no live session', internals.attachSelection(annotateCtx, 'quoted'), false);
sensor({ sessionId: 'session-1', inputActions: actions });

// The shipped card titles itself with the file name, so the excerpt is written back onto it
// — that is what keeps "hover the chip to read the whole selection" true.
const cards = [{ title: '1条注释' }, { title: '1条注释' }, { title: 'unrelated' }];
const cardDoc = { querySelectorAll: (selector) => (selector === '[title="1条注释"]' ? cards : []) };
internals.annotations.set('session-1', ['first excerpt', 'second excerpt']);
check('titles: one card per annotation is labelled', internals.syncCardTitles(cardDoc, 'session-1'), 2);
check('titles: the first card shows the first excerpt', cards[0].title, 'first excerpt');
check('titles: the second card shows the second excerpt', cards[1].title, 'second excerpt');
check('titles: an unrelated card keeps its own title', cards[2].title, 'unrelated');
check('titles: a session with no annotation labels nothing', internals.syncCardTitles(cardDoc, 'session-9'), 0);
checkThat('bar sheet avoids !important', !barCssText.includes('!important'));
checkThat('bar sheet has no backtick', !barCssText.includes('`'));
checkThat('bar sheet floats the bar above the page', barCssText.includes('position: fixed'));

// The bar itself against a fake document: it may only appear for a selection inside the
// conversation reading surface, and its one action prepends the quote the user saw.
function fakeBar(selection) {
  const listeners = new Map();
  const nodes = [];
  const makeNode = (tag) => {
    const node = {
      tag,
      className: '',
      style: {},
      hidden: false,
      disabled: false,
      textContent: '',
      children: [],
      appendChild(child) {
        node.children.push(child);
        return child;
      },
      addEventListener(type, fn) {
        listeners.set(`${tag}:${type}`, fn);
      },
      removeEventListener() {},
      remove() {},
      contains: () => false,
    };
    nodes.push(node);
    return node;
  };
  const body = { children: [], appendChild: (child) => body.children.push(child) };
  return {
    listeners,
    nodes,
    body,
    document: {
      body,
      createElement: makeNode,
      addEventListener: (type, fn) => listeners.set(`document:${type}`, fn),
      removeEventListener: () => {},
    },
    window: { innerWidth: 1200, getSelection: () => selection },
  };
}
function fakeSelection({ inConversation = true, text = 'quoted' } = {}) {
  const root = {};
  const element = {
    nodeType: 1,
    closest: (selector) => (selector === '[data-conversation-scroll]' && inConversation ? root : null),
  };
  return {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({ commonAncestorContainer: element, getBoundingClientRect: () => ({ left: 400, top: 300, width: 10 }) }),
    toString: () => text,
    removeAllRanges: () => {},
  };
}
const label = (key) => ({ 'annotate.add': '添加到对话' }[key] ?? key);

const inChat = fakeBar(fakeSelection());
const disposeBar = internals.mountAnnotateBar(annotateCtx, label, inChat);
checkThat('bar: mounted into the document body', inChat.body.children.length === 1);
checkThat('bar: listens for a selection release', typeof inChat.listeners.get('document:mouseup') === 'function');
inChat.listeners.get('document:mouseup')();
check('bar: a conversation selection raises it', inChat.body.children[0].hidden, false);
check('bar: places itself above the selection', inChat.body.children[0].style.top, '292px');
check('bar: the action is localized', inChat.nodes.find((node) => node.tag === 'button').textContent, '添加到对话');
check('bar: the action is enabled with a live composer', inChat.nodes.find((node) => node.tag === 'button').disabled, false);

const inComposer = fakeBar(fakeSelection({ inConversation: false }));
internals.mountAnnotateBar(annotateCtx, label, inComposer);
inComposer.listeners.get('document:mouseup')();
check('bar: a composer selection never raises it', inComposer.body.children[0].hidden, true);

const tooShort = fakeBar(fakeSelection({ text: 'a' }));
internals.mountAnnotateBar(annotateCtx, label, tooShort);
tooShort.listeners.get('document:mouseup')();
check('bar: a one-character selection never raises it', tooShort.body.children[0].hidden, true);

added.length = 0;
inChat.listeners.get('document:mouseup')();
inChat.listeners.get('button:click')();
check('bar: clicking attaches the selection as a draft file', attachedFile.parts, ['quoted']);
check('bar: the clicked selection registers one draft', added.at(-1), ['draft-0']);
check('bar: it hides once the annotation is taken', inChat.body.children[0].hidden, true);
checkThat('bar: disposal unhooks and removes it', typeof disposeBar === 'function');

console.log(failures.length === 0 ? '\nALL CLIENT CHECKS PASSED' : `\n${failures.length} FAILED: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
