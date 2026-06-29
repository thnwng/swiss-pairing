/* Type declarations for tokens.js — every token value is a CSS `var(--…)` string. */

export type CssVar = string;

export type ColorToken =
  | "bg" | "bgSubtle" | "bgSunken"
  | "surface" | "surface2" | "surfaceHover" | "surfaceActive"
  | "glass" | "overlayBg"
  | "border" | "borderSubtle" | "borderStrong"
  | "text" | "textMuted" | "textFaint" | "textInverse" | "codeBg";
export const color: Record<ColorToken, CssVar>;

export type AccentToken =
  | "base" | "hover" | "active" | "fg" | "text"
  | "subtle" | "subtleStrong" | "border" | "ring";
export const accent: Record<AccentToken, CssVar>;

export type StatusToken =
  | "success" | "successSubtle" | "successText"
  | "warning" | "warningSubtle" | "warningText"
  | "danger" | "dangerSubtle" | "dangerText"
  | "info" | "infoSubtle" | "infoText"
  | "onStatus";
export const status: Record<StatusToken, CssVar>;

export const font: Record<"sans" | "mono" | "display", CssVar>;

export type TextStep =
  | "2xs" | "xs" | "sm" | "base" | "md" | "lg" | "xl"
  | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
export const text: Record<TextStep, CssVar>;

export const weight: Record<
  "light" | "regular" | "medium" | "semibold" | "bold" | "extrabold",
  CssVar
>;
export const tracking: Record<"tighter" | "tight" | "normal" | "wide" | "wider" | "widest", CssVar>;
export const leading: Record<"none" | "tight" | "snug" | "normal" | "relaxed", CssVar>;

export type SpaceStep =
  | "0" | "px" | "0.5" | "1" | "1.5" | "2" | "3" | "4" | "5" | "6" | "7" | "8"
  | "10" | "12" | "16" | "20" | "24" | "32";
export const space: Record<SpaceStep, CssVar>;

export const radius: Record<"none" | "xs" | "sm" | "md" | "lg" | "xl" | "full" | "control" | "card", CssVar>;
export const control: Record<"sm" | "md" | "lg", CssVar>;
export const shadow: Record<"xs" | "sm" | "md" | "lg" | "xl" | "inset", CssVar>;
export const motion: Record<
  "easeOut" | "easeInOut" | "easeSpring" | "durFast" | "dur" | "durSlow" | "transition" | "focusRing",
  CssVar
>;

declare const tokens: {
  color: typeof color;
  accent: typeof accent;
  status: typeof status;
  font: typeof font;
  text: typeof text;
  weight: typeof weight;
  tracking: typeof tracking;
  leading: typeof leading;
  space: typeof space;
  radius: typeof radius;
  control: typeof control;
  shadow: typeof shadow;
  motion: typeof motion;
};
export default tokens;

export type Theme = "light" | "dark";
export type Accent = "slate" | "sage";
export const THEMES: readonly Theme[];
export const ACCENTS: readonly Accent[];

export function setHalcyon(opts: { theme?: Theme; accent?: Accent }, root?: Document | HTMLElement): void;
export function setTheme(theme: Theme, root?: Document | HTMLElement): void;
export function setAccent(accent: Accent, root?: Document | HTMLElement): void;
export function toggleTheme(root?: Document | HTMLElement): Theme;
