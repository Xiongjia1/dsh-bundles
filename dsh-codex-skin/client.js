/**
 * @local/dsh-codex-skin — browser half: the appearance layer.
 *
 * One plugin-owned stylesheet, expressed entirely through the host's own custom
 * properties and declared on `html body` / `html body *` so it outranks the theme's
 * `body` / `body *` declarations on specificity — no !important, so a surface that
 * deliberately rebinds a token keeps working. Both palettes are written: light on
 * `html body`, dark on `html body[data-ds-dark-theme]`.
 *
 * The Host half owns no behaviour; this bundle is appearance and nothing else.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-codex-skin',
  factory() {
    const PLUGIN_ID = '@local/dsh-codex-skin';

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

    /** The plugin-owned stylesheet: one tag, removed with the plugin's effect. */
    function insertSkin() {
      const tag = document.createElement('style');
      tag.dataset.plugin = PLUGIN_ID;
      tag.dataset.pluginCss = `${PLUGIN_ID}/skin`;
      tag.textContent = SKIN_CSS;
      document.head.appendChild(tag);
      return () => tag.remove();
    }

    const inject = [];

    function apply(ctx) {
      // Style ownership rides this plugin's fiber, so disabling the plugin removes the
      // skin without a page reload.
      if (typeof ctx.effect === 'function') ctx.effect(insertSkin, 'codex-skin stylesheet');
      else insertSkin();
    }

    return { inject, apply, name: 'codex-skin' };
  },
});
