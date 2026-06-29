/* ============================================================
   Halcyon — typed JS token API (framework-agnostic)

   Every value is a `var(--token)` reference, NOT a raw color/size. That means
   it always resolves to the *currently active* theme + accent at runtime — use
   these in inline styles (React/Vue/Svelte/vanilla) and they react to
   data-theme / data-accent automatically, exactly like the CSS classes do.

       import { color, space, radius, font } from "./tokens.js";
       el.style.background = color.surface;        // "var(--surface)"
       el.style.padding    = space[4];             // "var(--space-4)"
       el.style.borderRadius = radius.card;        // "var(--radius-card)"

   Requires styles.css to be loaded (it defines the --tokens these point at).
   ============================================================ */

/** Surfaces, borders, and text. */
export const color = {
  bg: "var(--bg)",
  bgSubtle: "var(--bg-subtle)",
  bgSunken: "var(--bg-sunken)",
  surface: "var(--surface)",
  surface2: "var(--surface-2)",
  surfaceHover: "var(--surface-hover)",
  surfaceActive: "var(--surface-active)",
  glass: "var(--glass)",
  overlayBg: "var(--overlay-bg)",

  border: "var(--border)",
  borderSubtle: "var(--border-subtle)",
  borderStrong: "var(--border-strong)",

  text: "var(--text)",
  textMuted: "var(--text-muted)",
  textFaint: "var(--text-faint)",
  textInverse: "var(--text-inverse)",
  codeBg: "var(--code-bg)",
};

/** Active-accent tokens (resolve to slate or sage depending on data-accent). */
export const accent = {
  base: "var(--accent)",
  hover: "var(--accent-hover)",
  active: "var(--accent-active)",
  fg: "var(--accent-fg)", // text/icon sitting ON an accent fill
  text: "var(--accent-text)", // accent used as text/icon/link on a normal bg
  subtle: "var(--accent-subtle)",
  subtleStrong: "var(--accent-subtle-strong)",
  border: "var(--accent-border)",
  ring: "var(--ring)",
};

/** Status hues, each with a fill, a subtle tint, and a text shade. */
export const status = {
  success: "var(--success)",
  successSubtle: "var(--success-subtle)",
  successText: "var(--success-text)",
  warning: "var(--warning)",
  warningSubtle: "var(--warning-subtle)",
  warningText: "var(--warning-text)",
  danger: "var(--danger)",
  dangerSubtle: "var(--danger-subtle)",
  dangerText: "var(--danger-text)",
  info: "var(--info)",
  infoSubtle: "var(--info-subtle)",
  infoText: "var(--info-text)",
  onStatus: "var(--on-status)",
};

export const font = {
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
  display: "var(--font-display)",
};

/** Type scale. Numeric-ish keys are quoted; use text["2xl"]. */
export const text = {
  "2xs": "var(--text-2xs)",
  xs: "var(--text-xs)",
  sm: "var(--text-sm)",
  base: "var(--text-base)",
  md: "var(--text-md)",
  lg: "var(--text-lg)",
  xl: "var(--text-xl)",
  "2xl": "var(--text-2xl)",
  "3xl": "var(--text-3xl)",
  "4xl": "var(--text-4xl)",
  "5xl": "var(--text-5xl)",
  "6xl": "var(--text-6xl)",
  "7xl": "var(--text-7xl)",
};

export const weight = {
  light: "var(--weight-light)",
  regular: "var(--weight-regular)",
  medium: "var(--weight-medium)",
  semibold: "var(--weight-semibold)",
  bold: "var(--weight-bold)",
  extrabold: "var(--weight-extrabold)",
};

export const tracking = {
  tighter: "var(--tracking-tighter)",
  tight: "var(--tracking-tight)",
  normal: "var(--tracking-normal)",
  wide: "var(--tracking-wide)",
  wider: "var(--tracking-wider)",
  widest: "var(--tracking-widest)",
};

export const leading = {
  none: "var(--leading-none)",
  tight: "var(--leading-tight)",
  snug: "var(--leading-snug)",
  normal: "var(--leading-normal)",
  relaxed: "var(--leading-relaxed)",
};

/** 4px-base spacing scale. Use space[4], space["1.5"], etc. */
export const space = {
  0: "var(--space-0)",
  px: "var(--space-px)",
  "0.5": "var(--space-0-5)",
  1: "var(--space-1)",
  "1.5": "var(--space-1-5)",
  2: "var(--space-2)",
  3: "var(--space-3)",
  4: "var(--space-4)",
  5: "var(--space-5)",
  6: "var(--space-6)",
  7: "var(--space-7)",
  8: "var(--space-8)",
  10: "var(--space-10)",
  12: "var(--space-12)",
  16: "var(--space-16)",
  20: "var(--space-20)",
  24: "var(--space-24)",
  32: "var(--space-32)",
};

export const radius = {
  none: "var(--radius-none)",
  xs: "var(--radius-xs)",
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  full: "var(--radius-full)",
  control: "var(--radius-control)",
  card: "var(--radius-card)",
};

export const control = {
  sm: "var(--control-sm)",
  md: "var(--control-md)",
  lg: "var(--control-lg)",
};

export const shadow = {
  xs: "var(--shadow-xs)",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  xl: "var(--shadow-xl)",
  inset: "var(--shadow-inset)",
};

export const motion = {
  easeOut: "var(--ease-out)",
  easeInOut: "var(--ease-in-out)",
  easeSpring: "var(--ease-spring)",
  durFast: "var(--dur-fast)",
  dur: "var(--dur)",
  durSlow: "var(--dur-slow)",
  transition: "var(--transition)",
  focusRing: "var(--focus-ring)",
};

/** Everything under one namespace, for `import tokens from "./tokens.js"`. */
const tokens = { color, accent, status, font, text, weight, tracking, leading, space, radius, control, shadow, motion };
export default tokens;

/* ---------- Theme + accent runtime control ---------- */

export const THEMES = /** @type {const} */ (["light", "dark"]);
export const ACCENTS = /** @type {const} */ (["slate", "sage"]);

/**
 * Swap theme/accent without a mid-swap flash. Adds `.no-anim` for one frame so
 * token-derived properties repaint instantly (see base.css).
 * @param {{theme?: "light"|"dark", accent?: "slate"|"sage"}} opts
 * @param {Document|HTMLElement} [root] defaults to documentElement
 */
export function setHalcyon(opts, root) {
  const el = root ?? document.documentElement;
  const html = el instanceof Document ? el.documentElement : el;
  html.classList.add("no-anim");
  if (opts.theme) html.setAttribute("data-theme", opts.theme);
  if (opts.accent) html.setAttribute("data-accent", opts.accent);
  // Force a reflow, then drop .no-anim so interaction transitions resume.
  void html.offsetHeight;
  requestAnimationFrame(() => html.classList.remove("no-anim"));
}

export function setTheme(theme, root) {
  setHalcyon({ theme }, root);
}

export function setAccent(accent, root) {
  setHalcyon({ accent }, root);
}

/** Flip light <-> dark and return the new value. */
export function toggleTheme(root) {
  const html = (root instanceof Document ? root.documentElement : root) ?? document.documentElement;
  const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  setHalcyon({ theme: next }, html);
  return next;
}
