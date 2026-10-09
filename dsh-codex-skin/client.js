/**
 * @local/dsh-codex-skin — browser half: the Codex appearance layer, plus the
 * conversation-attachment affordance that sits on top of it.
 *
 * Appearance: one plugin-owned stylesheet, expressed entirely through the host's own custom
 * properties and declared on `html body` / `html body *` so it outranks the theme's `body` /
 * `body *` declarations on specificity — no !important, so a surface that deliberately
 * rebinds a token keeps working. Both palettes are written: light on `html body`, dark on
 * `html body[data-ds-dark-theme]`.
 *
 * Two more surfaces ride the same fiber:
 *
 * - The shipped turn rail is restyled into Codex's shorter bars AND re-shown at every width:
 *   `dsh-client-ui-chat` hides it under `@container (width <= 900px)`, so a half-screen
 *   window loses it entirely. The override has to name the rail's build-hashed classes, which
 *   are discovered at runtime from the shipped stylesheet's own text.
 *
 * - A selected passage of a reply can be attached to the next message ("添加到对话"). The
 *   attach path is deliberately draft-based: the passage is written into the composer draft as
 *   a quote block, so the chip advertises literally what will be sent, it survives a refresh
 *   and an undo, and the whole feature stays in the browser half — no Host half, so no app
 *   restart is needed to change it.
 *
 * The Host half owns no behaviour.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-codex-skin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN_ID = '@local/dsh-codex-skin';

    /** Dictionary namespace owned by this plugin. */
    const NS = 'codex-skin';

    /** The composer zone the annotation chip rides: full-width entries above the card. */
    const DOCK_SLOT = 'conversation.input.dock';

    /** The conversation's reading surface; a selection outside it is not quotable. */
    const SCROLL_ROOT = '[data-conversation-scroll]';

    /** Plugin-css key of the stylesheet whose text carries the rail's class prefix. */
    const RAIL_STYLE_KEY = 'TurnNavigator.module.css';

    /** Longest selection carried as one annotation. */
    const MAX_QUOTE_CHARS = 20000;

    const zh = {
      'annotate.add': '添加到对话',
      'annotate.chip.one': '1 条注释',
      'annotate.chip.many': '{n} 条注释',
      'annotate.selected': '所选文本',
      'annotate.remove': '移除',
    };
    const en = {
      'annotate.add': 'Add to conversation',
      'annotate.chip.one': '1 note',
      'annotate.chip.many': '{n} notes',
      'annotate.selected': 'Selected text',
      'annotate.remove': 'Remove',
    };

    // ---------------------------------------------------------------- quote blocks ----
    // A quote block is the only annotation state there is. Everything else — the chip, its
    // count, the full text on hover, removal — is a read of the draft, so an undo, a refresh
    // or a hand edit can never desynchronise the chip from what will actually be sent.

    /** A line that belongs to a quote block. */
    const QUOTE_LINE = /^>(\s|$)/u;

    /**
     * Collapse a selection into one quote block.
     * @param text - the selected text.
     * @returns the block to prepend to a draft, or undefined when the selection carries none.
     */
    function quoteBlock(text) {
      const lines = String(text ?? '').replace(/\r\n?/gu, '\n').split('\n');
      const trimmed = lines.map((line) => line.replace(/\s+$/u, ''));
      while (trimmed.length > 0 && trimmed[0].trim() === '') trimmed.shift();
      while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === '') trimmed.pop();
      if (trimmed.length === 0) return undefined;
      const quoted = trimmed.map((line) => (line === '' ? '>' : `> ${line}`));
      return `${quoted.join('\n')}\n\n`;
    }

    /**
     * Split a draft into its leading annotations and the rest of the text.
     *
     * Only the leading run is read: an attach always prepends, and a quote a user typed
     * mid-draft is their own prose. A blank line separates two attached blocks; the blank
     * line after the last one belongs to the block, not to the draft.
     *
     * @param draft - the composer draft text.
     * @returns the annotations, in attach order, and the draft without them.
     */
    function splitLeadingQuotes(draft) {
      const lines = String(draft ?? '').replace(/\r\n?/gu, '\n').split('\n');
      const annotations = [];
      let index = 0;
      while (index < lines.length && QUOTE_LINE.test(lines[index])) {
        const body = [];
        while (index < lines.length && QUOTE_LINE.test(lines[index])) {
          body.push(lines[index].replace(/^>\s?/u, ''));
          index += 1;
        }
        while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
        annotations.push({ text: body.join('\n') });
        // The blank line a block ends with belongs to the block, so it never reaches `rest`.
        while (index < lines.length && lines[index].trim() === '') index += 1;
      }
      return { annotations, rest: lines.slice(index).join('\n') };
    }

    /**
     * Drop one leading annotation from a draft.
     * @param draft - the composer draft text.
     * @param remove - index of the annotation to drop.
     * @returns the next draft.
     */
    function withoutAnnotation(draft, remove) {
      const { annotations, rest } = splitLeadingQuotes(draft);
      const kept = annotations
        .filter((_annotation, index) => index !== remove)
        .map((annotation) => quoteBlock(annotation.text) ?? '');
      return `${kept.join('')}${rest}`;
    }

    // ---------------------------------------------------------------- rail discovery ----

    /**
     * Read the rail's build-hashed class prefix out of the shipped stylesheet's own text.
     * The hash changes between builds, so it is never hard-coded here.
     * @param cssText - the text of the shipped `TurnNavigator.module.css` tag.
     * @returns the prefix, or undefined when the text is not that stylesheet.
     */
    function railPrefixFrom(cssText) {
      const match = /\.([A-Za-z0-9_-]+)_frame\s*[,{]/u.exec(String(cssText ?? ''));
      return match === null ? undefined : match[1];
    }

    /**
     * Codex's rail: short bars that grow toward the reading edge, and a summary card that
     * stays inside a narrow column.
     * @param prefix - the shipped class prefix.
     * @returns the stylesheet text.
     */
    function railCss(prefix) {
      return `
/* ---- Turn rail: visible at every width, Codex bar geometry ---------------------- */
/* The shipped module hides the rail below 900px of CONTAINER width with
   @container (width <= 900px) { .frame { display: none } }. Answering that block keeps the
   query conditions identical, and the body prefix adds the weight that wins the cascade
   without !important and without depending on stylesheet order. */
@container (width<=900px) {
  html body .${prefix}_frame {
    display: block;
    right: 6px;
  }
}
/* Codex's marks are short bars: quiet at rest, longer on hover, longest and darkest for the
   turn you are reading. The shipped rules already anchor them to the right edge, so growth
   reads toward the text. */
html body .${prefix}_mark:before {
  background: var(--dsw-alias-border-l4);
  border-radius: 999px;
  height: 2.5px;
  width: 18px;
  transform: translateY(-50%) scaleX(.5);
}
html body .${prefix}_markUnloaded:before {
  opacity: .45;
  transform: translateY(-50%) scaleX(.32);
}
html body .${prefix}_markPreview:before {
  background: var(--dsw-alias-label-tertiary);
  transform: translateY(-50%) scaleX(.85);
}
html body .${prefix}_markActive:before {
  background: var(--dsw-alias-label-primary);
  transform: translateY(-50%) scaleX(1);
}
/* The summary card keeps the skin's real halo — the panel tier is stroke-only here. */
html body .${prefix}_preview {
  background: var(--dsw-menu-surface-fill);
  box-shadow: var(--dsw-elevation-soft);
  padding: 10px 12px;
}
@container (width<=1100px) {
  html body .${prefix}_preview {
    width: min(260px, 100cqw - 72px);
  }
}
`;
    }

    /** The annotation chip, its hover card, and the floating selection bar. */
    const ANNOTATION_CSS = `
/* ---- Attach a selection to the next message ------------------------------------- */
.codex-annotations {
  position: relative;
  display: flex;
  align-items: center;
  pointer-events: auto;
}
.codex-annotations__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xs-strong-13);
  cursor: default;
  user-select: none;
}
.codex-annotations__icon {
  flex: none;
  opacity: .75;
}
.codex-annotations__pop {
  display: none;
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 30;
  box-sizing: border-box;
  width: min(460px, 60vw);
  max-height: 300px;
  overflow-y: auto;
  gap: 10px;
  flex-direction: column;
  padding: 12px;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-menu-surface-fill);
  box-shadow: var(--dsw-elevation-soft);
  color: var(--dsw-alias-label-primary);
}
.codex-annotations:hover .codex-annotations__pop,
.codex-annotations:focus-within .codex-annotations__pop {
  display: flex;
}
.codex-annotations__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.codex-annotations__item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.codex-annotations__caption {
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxs-12);
}
.codex-annotations__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 160px;
  overflow-y: auto;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xs-strong-13);
}
.codex-annotations__remove {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: 0 0;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxs-12);
  cursor: pointer;
}
.codex-annotations__remove:hover {
  color: var(--dsw-alias-state-error-primary, var(--dsw-alias-label-primary));
}
.codex-annotate-bar {
  position: fixed;
  z-index: 50;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: center;
  padding: 3px;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-menu-surface-fill);
  box-shadow: var(--dsw-elevation-soft);
}
.codex-annotate-bar[hidden] {
  display: none;
}
.codex-annotate-bar__button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: 0 0;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xs-strong-13);
  cursor: pointer;
}
.codex-annotate-bar__button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.codex-annotate-bar__button[disabled] {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}
`;

    const SKIN_CSS = `
/* ---- Codex skin: neutral palette, flat surfaces, square corners ---------------- */
html body {
  /* Underlying neutral scale: strip the blue tint, widen the contrast at both ends. */
  --dsw-static-neutral-bluish-00: #ffffff;
  --dsw-static-neutral-bluish-50: #fafafa;
  --dsw-static-neutral-bluish-60: #f5f5f5;
  --dsw-static-neutral-bluish-75: #efefef;
  --dsw-static-neutral-bluish-100: #e8e8e8;
  --dsw-static-neutral-bluish-150: #e3e3e3;
  --dsw-static-neutral-bluish-200: #dcdcdc;
  --dsw-static-neutral-bluish-300: #cfcfcf;
  --dsw-static-neutral-bluish-400: #a6a6a6;
  --dsw-static-neutral-bluish-500: #8f8f8f;
  --dsw-static-neutral-bluish-600: #787878;
  --dsw-static-neutral-bluish-700: #5a5a5a;
  --dsw-static-neutral-bluish-750: #3d3d3d;
  --dsw-static-neutral-bluish-800: #303030;
  --dsw-static-neutral-bluish-850: #262626;
  --dsw-static-neutral-bluish-875: #1f1f1f;
  --dsw-static-neutral-bluish-900: #191919;
  --dsw-static-neutral-bluish-950: #101010;
  --dsw-static-neutral-bluish-1000: #0a0a0a;

  /* Typography: the UI composes every font shorthand from these two tokens. */
  --dsw-font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system,
    "Helvetica Neue", "PingFang SC", "Microsoft YaHei UI", sans-serif;
  --ds-font-family-code: "Cascadia Code", "Cascadia Mono", "JetBrains Mono", "SF Mono",
    Consolas, "Liberation Mono", ui-monospace, monospace;

  /* Softer than the shipped scale, but still round: Codex's bubbles, composer and code
     cards are generously rounded, only the small chrome stays tight. */
  --dsw-radius-xs: 4px;
  --dsw-radius-sm: 8px;
  --dsw-radius-md: 10px;
  --dsw-radius-lg: 14px;
  --dsw-radius-xl: 18px;
  --dsw-radius-panel: 20px;
  --dsw-corner-shape: round;

  /* Visible hairlines instead of weightless ones. */
  --dsw-alias-border-l1: #0000000f;
  --dsw-alias-border-l2: #00000026;
  --dsw-alias-border-l3: #00000033;
  --dsw-alias-border-l4: #00000040;

  /* Cards stay flat; the soft tier is the composer's halo, restored below. */
  --dsw-shadow-lv1: none;
  --dsw-shadow-lv1-blur: none;
  --dsw-shadow-lv2: none;
  --dsw-shadow-lv3: 0 10px 30px #00000014, 0 0 0 0.5px var(--dsw-alias-border-l4);

  /* Opaque menus: no frosted glass. */
  --dsw-menu-surface-fill: #ffffff;
  --dsw-menu-backdrop-filter: none;

  /* Code: a light card with a slightly deeper header bar, and inline code as a chip. */
  --dsw-alias-markdown-code-block: #fafafa;
  --dsw-alias-markdown-code-block-banner: #f4f4f5;
  --dsw-alias-markdown-inline-code: #f4f4f5;
  --dsw-font-markdown-code: 13px/20px var(--ds-font-family-code);
  --dsw-font-markdown-code-font-size: 13px;
  --dsw-font-markdown-code-line-height: 20px;
  --dsw-alias-bg-document-selection: #0000002e;

  /* Codex's user bubble is pale blue in light mode; the selected sidebar row and the
     selectors stay neutral so only the conversation carries the accent. */
  --dsw-specific-bubble: #e9f1ff;
  --dsw-specific-bubble-highlight: #dbe7fe;
  --dsw-specific-input-major: #ffffff;
  --dsw-specific-selector: #f0f0f0;
  --dsw-specific-sidebar-nav-item-active-accent: #e6e6e6;
  --dsw-specific-sidebar-nav-item-active: #ececec;
  --dsw-specific-sidebar-nav-item-hover: #f3f3f3;
  --dsw-alias-bg-overlay: #fafafa;
  --dsw-alias-interactive-bg-hover: #0000000a;
  --dsw-alias-interactive-bg-active: #00000012;

  --dsh-scrollbar-width: 8px;
  --dsh-scrollbar-thumb-border: 0px;
}
html body[data-ds-dark-theme] {
  --dsw-static-neutral-bluish-00: #ffffff;
  --dsw-static-neutral-bluish-50: #f5f5f5;
  --dsw-static-neutral-bluish-60: #ededed;
  --dsw-static-neutral-bluish-75: #e0e0e0;
  --dsw-static-neutral-bluish-100: #d4d4d4;
  --dsw-static-neutral-bluish-150: #c4c4c4;
  --dsw-static-neutral-bluish-200: #b0b0b0;
  --dsw-static-neutral-bluish-300: #a0a0a0;
  --dsw-static-neutral-bluish-400: #8a8a8a;
  --dsw-static-neutral-bluish-500: #7a7a7a;
  --dsw-static-neutral-bluish-600: #6a6a6a;
  --dsw-static-neutral-bluish-700: #565656;
  --dsw-static-neutral-bluish-750: #3a3a3a;
  --dsw-static-neutral-bluish-800: #2e2e2e;
  --dsw-static-neutral-bluish-850: #242424;
  --dsw-static-neutral-bluish-875: #1e1e1e;
  --dsw-static-neutral-bluish-900: #171717;
  --dsw-static-neutral-bluish-950: #0d0d0d;
  --dsw-static-neutral-bluish-1000: #050505;

  --dsw-alias-border-l1: #ffffff1a;
  --dsw-alias-border-l2: #ffffff26;
  --dsw-alias-border-l3: #ffffff33;
  --dsw-alias-border-l4: #ffffff40;

  --dsw-shadow-lv3: 0 12px 36px #000000a3, 0 0 0 0.5px var(--dsw-alias-border-l3);

  --dsw-menu-surface-fill: #1c1c1c;

  /* Code: near-black card, slightly lifted header bar, chips one step above the page. */
  --dsw-alias-markdown-code-block: #111111;
  --dsw-alias-markdown-code-block-banner: #1b1b1b;
  --dsw-alias-markdown-inline-code: #262626;
  --dsw-font-markdown-code: 13px/20px var(--ds-font-family-code);
  --dsw-font-markdown-code-font-size: 13px;
  --dsw-font-markdown-code-line-height: 20px;
  --dsw-alias-bg-document-selection: #ffffff38;

  /* Dark mode is where Codex's bubble goes saturated blue with white text. */
  --dsw-specific-bubble: #2563eb;
  --dsw-specific-bubble-highlight: #3b74ee;
  --dsw-specific-input-major: #1a1a1a;
  --dsw-specific-selector: #232323;
  --dsw-specific-sidebar-nav-item-active-accent: #2c2c2c;
  --dsw-specific-sidebar-nav-item-active: #242424;
  --dsw-specific-sidebar-nav-item-hover: #1c1c1c;
  --dsw-alias-bg-overlay: #1c1c1c;
  --dsw-alias-interactive-bg-hover: #ffffff14;
  --dsw-alias-interactive-bg-active: #ffffff24;
}
/* The elevation tokens are re-declared per element by the theme, so they need the
   descendant selector. Cards lose the layered blur; the SOFT tier keeps a real halo,
   because that is the tier the composer sits on and it is what separates the input
   surface from the page. The stroke colour stays rebindable per surface. */
html body * {
  --dsw-elevation-panel: var(--dsw-elevation-stroke);
  --dsw-elevation-prominent: var(--dsw-elevation-stroke);
  --dsw-elevation-soft: var(--dsw-elevation-stroke), 0 2px 8px #0000000f, 0 10px 28px #00000017;
}
html body[data-ds-dark-theme] * {
  --dsw-elevation-soft: var(--dsw-elevation-stroke), 0 0 0 4px #ffffff0a, 0 6px 24px #0000008c;
}
/* Inline code is a filled chip with no outline.
   The shipped renderer draws that outline itself, as
   .markdown :not(pre) > code { border: .5px solid var(--dsw-alias-border-l1) },
   and its class sits on the markdown CONTAINER, never on the code element, so an override
   has to carry its extra weight on an ancestor: the [class] guard matches that container
   and lifts this rule above the renderer's (0,1,2) without reaching for !important.
   Fill, radius, padding and the 0.875em mono size still come from the renderer. */
html body [class] :not(pre) > code {
  border: 0;
}
html body pre,
html body code,
html body kbd,
html body samp {
  font-variant-ligatures: none;
}

`;

    // ---------------------------------------------------------------- draft bridge ----
    // The selection bar lives outside the slot system, so it has no props of its own. The
    // chip publishes the composer's live draft and action surface here on every render — the
    // selector hook re-renders the chip on each draft change, which keeps both current.

    const bridge = { draft: '', actions: undefined, session: undefined };

    /**
     * Attach a selection to the next message.
     * @param text - the selected text.
     * @returns whether the draft took it (false with no live composer).
     */
    function attachSelection(text) {
      const block = quoteBlock(text);
      const actions = bridge.actions;
      if (block === undefined || actions === undefined || typeof actions.setDraft !== 'function') return false;
      actions.setDraft(`${block}${bridge.draft}`);
      return true;
    }

    /** Whether a live composer can receive an annotation. */
    function canAttach() {
      return bridge.actions !== undefined && typeof bridge.actions.setDraft === 'function';
    }

    // ---------------------------------------------------------------- annotations UI ----

    const ICON_PATH = 'M2.6 3.4h10.8v6.4h-5.6l-3.1 2.6v-2.6h-2.1z';

    /** The chip: one annotation per quote block in the draft, full text on hover. */
    function createChip() {
      return function AnnotationChip(props) {
        let draft = '';
        try {
          if (typeof props?.useInput === 'function') draft = String(props.useInput((value) => value?.draft ?? '') ?? '');
        } catch (error) {
          console.error('[codex-skin] input read failed', error);
        }
        bridge.draft = draft;
        bridge.actions = props?.inputActions;
        bridge.session = props?.sessionId;

        try {
          const { annotations } = splitLeadingQuotes(draft);
          if (annotations.length === 0) return null;
          const label = annotations.length === 1 ? t('annotate.chip.one') : t('annotate.chip.many', { n: annotations.length });
          const items = annotations.map((annotation, index) =>
            h(
              'div',
              { className: 'codex-annotations__item', key: `annotation-${index}` },
              h('div', { className: 'codex-annotations__caption' }, t('annotate.selected')),
              h('div', { className: 'codex-annotations__text' }, annotation.text),
              h(
                'button',
                {
                  type: 'button',
                  className: 'codex-annotations__remove',
                  onClick: () => {
                    if (canAttach()) bridge.actions.setDraft(withoutAnnotation(bridge.draft, index));
                  },
                },
                t('annotate.remove'),
              ),
            ),
          );
          return h(
            'div',
            { className: 'codex-annotations' },
            h(
              'div',
              { className: 'codex-annotations__chip' },
              icon(),
              h('span', { className: 'codex-annotations__label' }, label),
            ),
            h('div', { className: 'codex-annotations__pop', role: 'tooltip' }, items),
          );
        } catch (error) {
          console.error('[codex-skin] annotation chip render failed', error);
          return null;
        }
      };
    }

    /** The chip's comment glyph, drawn inline so the bundle stays asset-free. */
    function icon() {
      return h(
        'svg',
        {
          className: 'codex-annotations__icon',
          viewBox: '0 0 16 16',
          width: 13,
          height: 13,
          'aria-hidden': 'true',
        },
        h('path', { d: ICON_PATH, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
      );
    }

    /**
     * The floating bar shown over a selection inside the conversation.
     * @param t - bound translator.
     * @param env - document/window override, used by the offline tests.
     * @returns a disposer, or undefined where the document cannot carry a floating node.
     */
    function mountAnnotateBar(t, env) {
      const doc = env?.document ?? (typeof document === 'undefined' ? undefined : document);
      const win = env?.window ?? (typeof window === 'undefined' ? undefined : window);
      if (doc === undefined || win === undefined) return undefined;
      if (typeof doc.addEventListener !== 'function' || typeof doc.createElement !== 'function') return undefined;
      if (doc.body === undefined || typeof doc.body.appendChild !== 'function') return undefined;

      const host = doc.createElement('div');
      host.className = 'codex-annotate-bar';
      host.hidden = true;
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'codex-annotate-bar__button';
      host.appendChild(button);
      doc.body.appendChild(host);

      let quoted = '';

      function hide() {
        host.hidden = true;
        quoted = '';
      }

      function show(text, rect) {
        quoted = text;
        button.textContent = t('annotate.add');
        button.disabled = !canAttach();
        host.hidden = false;
        const width = Number(win.innerWidth ?? 0);
        const center = Number(rect?.left ?? 0) + Number(rect?.width ?? 0) / 2;
        const left = width > 0 ? Math.min(Math.max(center, 96), width - 96) : center;
        host.style.left = `${left}px`;
        host.style.top = `${Math.max(Number(rect?.top ?? 0) - 8, 44)}px`;
      }

      /** The conversation's reading surface, never the composer or this bar. */
      function quotable(range) {
        const node = range?.commonAncestorContainer;
        const element = node === undefined || node === null ? undefined : node.nodeType === 1 ? node : node.parentElement;
        if (element === undefined || element === null || typeof element.closest !== 'function') return false;
        if (typeof host.contains === 'function' && host.contains(element) === true) return false;
        return element.closest(SCROLL_ROOT) !== null;
      }

      function onMouseUp() {
        const selection = typeof win.getSelection === 'function' ? win.getSelection() : undefined;
        if (selection === undefined || selection === null || selection.isCollapsed === true) return hide();
        if (Number(selection.rangeCount ?? 0) === 0) return hide();
        let range;
        try {
          range = selection.getRangeAt(0);
        } catch (error) {
          return hide();
        }
        if (!quotable(range)) return hide();
        const text = String(selection.toString() ?? '').slice(0, MAX_QUOTE_CHARS).replace(/\s+$/u, '');
        if (text.trim().length < 2) return hide();
        show(text, typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : undefined);
      }

      function onSelectionChange() {
        const selection = typeof win.getSelection === 'function' ? win.getSelection() : undefined;
        if (selection === undefined || selection === null || selection.isCollapsed === true) hide();
      }

      function onKeyDown(event) {
        if (event?.key === 'Escape') hide();
      }

      // mousedown, not click: the press must not collapse the selection the bar was built for.
      function onButtonDown(event) {
        if (typeof event?.preventDefault === 'function') event.preventDefault();
      }

      function onButtonClick() {
        if (quoted === '' || !canAttach()) return hide();
        if (attachSelection(quoted)) {
          if (typeof win.getSelection === 'function') win.getSelection()?.removeAllRanges?.();
          hide();
        }
      }

      doc.addEventListener('mouseup', onMouseUp, true);
      doc.addEventListener('selectionchange', onSelectionChange, true);
      doc.addEventListener('keydown', onKeyDown, true);
      doc.addEventListener('scroll', hide, true);
      button.addEventListener('mousedown', onButtonDown);
      button.addEventListener('click', onButtonClick);

      return () => {
        doc.removeEventListener('mouseup', onMouseUp, true);
        doc.removeEventListener('selectionchange', onSelectionChange, true);
        doc.removeEventListener('keydown', onKeyDown, true);
        doc.removeEventListener('scroll', hide, true);
        button.removeEventListener('mousedown', onButtonDown);
        button.removeEventListener('click', onButtonClick);
        host.remove();
      };
    }

    // ---------------------------------------------------------------- wiring ----

    /** Insert one plugin-owned stylesheet and hand back its removal. */
    function insertStyle(doc, kind, css) {
      const tag = doc.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = `${PLUGIN_ID}/${kind}`;
      tag.textContent = css;
      doc.head.appendChild(tag);
      return () => tag.remove();
    }

    /** The plugin-owned stylesheet: one tag, removed with the plugin's effect. */
    function insertSkin() {
      return insertStyle(document, 'skin', SKIN_CSS);
    }

    /**
     * Insert the rail override, whose selectors need the shipped class prefix.
     *
     * The shipped stylesheet is not guaranteed to be in the head when this half evaluates, so
     * a bounded retry waits for it and gives up silently — without the prefix the override is
     * skipped rather than guessed.
     *
     * @param doc - the document.
     * @param retries - how many times to wait for the shipped stylesheet.
     * @returns a disposer that also cancels a pending retry.
     */
    function insertRailStyle(doc, retries = 40) {
      if (typeof doc?.querySelector !== 'function') return undefined;
      let dispose;
      let timer;
      const attempt = (left) => {
        const shipped = doc.querySelector(`style[data-plugin-css*="${RAIL_STYLE_KEY}"]`);
        const prefix = railPrefixFrom(shipped?.textContent);
        if (prefix !== undefined) {
          dispose = insertStyle(doc, 'rail', railCss(prefix));
          return;
        }
        if (left <= 0 || typeof setTimeout !== 'function') return;
        timer = setTimeout(() => attempt(left - 1), 250);
      };
      attempt(retries);
      return () => {
        if (timer !== undefined) clearTimeout(timer);
        if (dispose !== undefined) dispose();
      };
    }

    let t = (key, params) => {
      const template = zh[key] ?? key;
      if (params === undefined) return template;
      return Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), template);
    };

    // `slots` is the one hard dependency: the chip is registered through it. The locale
    // service is read softly with ctx.get, so a client without it still gets the skin.
    const inject = ['slots'];

    function apply(ctx) {
      // Style ownership rides this plugin's fiber, so disabling the plugin removes the
      // skin without a page reload.
      const effect = typeof ctx.effect === 'function' ? ctx.effect : (fn) => fn();
      const locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
      if (locale !== undefined && typeof locale.bind === 'function') {
        // Register before binding, the order the shipped client plugins use.
        if (typeof locale.register === 'function') {
          effect(() => locale.register(NS, { zh, en }), 'codex-skin dictionaries');
        }
        t = locale.bind(NS);
      }
      effect(insertSkin, 'codex-skin stylesheet');
      effect(() => insertStyle(document, 'annotations', ANNOTATION_CSS), 'codex-skin annotation stylesheet');
      effect(() => insertRailStyle(document), 'codex-skin turn-rail override');
      effect(() => mountAnnotateBar(t, undefined), 'codex-skin selection bar');

      ctx.slots.inject(DOCK_SLOT, () =>
        ctx.slots.register({ name: DOCK_SLOT, id: 'codex-annotations', order: 30 }, createChip()),
      );
    }

    // Read by the offline tests; the module loader only ever looks at inject/apply/name.
    apply.__test = {
      attachSelection,
      canAttach,
      bridge,
      quoteBlock,
      railCss,
      railPrefixFrom,
      splitLeadingQuotes,
      withoutAnnotation,
      mountAnnotateBar,
      renderChip: createChip(),
    };

    return { inject, apply, name: 'codex-skin' };
  },
});
