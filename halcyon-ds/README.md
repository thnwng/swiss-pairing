# Halcyon — portable design system

> Calm, low-contrast, easy on the eyes.

A small, **framework-agnostic** design system: CSS-custom-property tokens + a
class-based component layer + a typed JS token API. No build step, no
dependencies, no framework lock-in. Drop it into any project — a plain HTML
page, a React/Vue/Svelte app, a slide deck — and everything shares one source
of truth for color, type, spacing, elevation, and components.

Open **`index.html`** for the living reference (with theme + accent switchers).

---

## Drop-in usage

Copy the `halcyon-ds/` folder into your project and link the two stylesheets.
Set the theme + accent on the root element:

```html
<!DOCTYPE html>
<html lang="en" data-theme="light" data-accent="slate">
<head>
  <link rel="stylesheet" href="halcyon-ds/styles.css">      <!-- tokens + base reset -->
  <link rel="stylesheet" href="halcyon-ds/components.css">  <!-- optional .hc-* components -->
</head>
<body>
  <button class="hc-btn">Primary action</button>
  <div class="hc-card hc-card--pad">A box.</div>
</body>
</html>
```

- `styles.css` — the entry point: fonts + every token file + the base reset.
- `components.css` — optional `.hc-*` component classes. Skip it if you only
  want the tokens.

You don't *need* the components: any element can be styled directly from the
tokens — `style="background: var(--surface); color: var(--text)"`.

---

## Three ways to consume it

**1. Component classes** (fastest):
```html
<button class="hc-btn hc-btn--secondary hc-btn--sm">Cancel</button>
<span class="hc-badge hc-badge--success">Saved</span>
```

**2. Raw CSS tokens** (for custom elements / inline styles):
```css
.my-thing { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); padding: var(--space-6); }
```

**3. Typed JS token API** (for React/Vue/Svelte inline styles — every value is a
live `var(--…)`, so it tracks the active theme/accent automatically):
```js
import { color, space, radius, font, setTheme, toggleTheme } from "./halcyon-ds/tokens.js";

el.style.background  = color.surface;   // "var(--surface)"
el.style.padding     = space[6];        // "var(--space-6)"
el.style.borderRadius = radius.card;

toggleTheme();             // flips light <-> dark, no flash
setTheme("dark");
```
TypeScript types ship in `tokens.d.ts`.

---

## Themes & accents

| Attribute     | Values            | Default |
|---------------|-------------------|---------|
| `data-theme`  | `light` · `dark`  | `light` |
| `data-accent` | `slate` · `sage`  | `slate` |

```js
document.documentElement.setAttribute("data-theme", "dark");
```
Or via the JS API (`setTheme`, `setAccent`, `toggleTheme`) — these add a
one-frame `.no-anim` guard so the swap repaints instantly without a mid-transition flash.

An accent can be **scoped to a subtree**: put `data-accent="sage"` on any
wrapper and its descendants pick it up.

---

## What's in the box

**Tokens** — surfaces/text/borders, accent (resolves to active family),
status (`success`/`warning`/`danger`/`info`, each with `-subtle`/`-text`),
type scale (`--text-2xs … --text-7xl`) on Hanken Grotesk + JetBrains Mono,
4px spacing (`--space-*`), radii, control heights, shadows, focus ring, motion.
Raw ramps too: `--neutral-*`, `--slate-*`, `--sage-*`.

**Components (`.hc-*`)** — button, input/textarea/select, field/label/hint,
checkbox/radio, switch, card, badge, avatar (+group), tabs (segmented +
underline), tooltip, alert, divider, progress, kbd, **list** (interactive /
prose), **table** (striped / hover). Live examples for all in `index.html`.

---

## File map

```
styles.css          entry point (imports everything below)
base.css            reset + element defaults
components.css      .hc-* component classes
tokens.js           typed JS token API + setTheme/setAccent/toggleTheme
tokens.d.ts         TypeScript declarations for tokens.js
tokens/
  fonts.css         webfont imports (Hanken Grotesk + JetBrains Mono)
  colors.css        ramps, light/dark themes, slate/sage accents
  typography.css    families, scale, weights, tracking
  spacing.css       spacing, radius, control sizing, z-index
  effects.css       shadows, focus ring, blur, motion
index.html          living reference + theme/accent switchers
```

## Fonts

Loaded from Google Fonts in `tokens/fonts.css` for convenience. For production,
self-host **Hanken Grotesk** and **JetBrains Mono** and replace the `@import`
with `@font-face` rules.

---

## Using it across projects

This folder is self-contained — copy it wherever, or reference one shared copy.
For the projects in this workspace it can be linked straight from disk
(`E:\Claude\halcyon-ds\`) or copied into each project's static assets. In a
bundler (Vite/webpack) `import "halcyon-ds/styles.css"` and
`import { color } from "halcyon-ds/tokens.js"` both work once the folder is on
the resolve path.

*Halcyon v1.0 — built to be easy on the eyes.*
