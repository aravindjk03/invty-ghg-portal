---
activation: Glob
globs: ["**/*.tsx","**/*.jsx","**/*.css","**/tailwind.config.*"]
---
# UI design system — neumorphic, blue on light

Full specs and screen-by-screen detail: @docs/ui-master-prompt.md

Soft neumorphism on a light blue-grey canvas with an all-blue text palette.
Calm, precise, data-dense. A scientific instrument, not a consumer app.

## Tokens — use these exact values, never substitute

--canvas:#EDF1F7  --surface:#F4F7FB  --surface-raised:#FFFFFF  --surface-sunken:#E4EAF3
--text-heading:#071B3A  --text-body:#123C82  --text-link:#1D5BD6
--text-muted:#5A7391  --text-decorative:#8FA6C0
--blue-700:#10339E --blue-600:#1D5BD6 --blue-500:#3B7BEF --blue-100:#DCE7FA --blue-50:#EFF4FE
--border:#DCE4F0  --shadow-dark:#C7D4E6  --shadow-light:#FFFFFF
--scope-1:#D9480F  --scope-2:#1D5BD6  --scope-3:#6741D9  --biogenic:#64748B

Raised:      6px 6px 14px #C7D4E6, -6px -6px 14px #FFFFFF
Pressed:     inset 4px 4px 9px #C7D4E6, inset -4px -4px 9px #FFFFFF
Input inset: inset 2px 2px 5px #C7D4E6, inset -2px -2px 5px #FFFFFF

Radii: 8 / 14 / 20 / 28px. Spacing on a 4px grid.
Type: Inter for UI, JetBrains Mono for all numbers. Base 15px / 1.55.

## Hard rules that override the aesthetic

1. The page background is #EDF1F7, NOT pure white. Neumorphism needs the canvas
   darker than the raised surfaces or the effect does not exist.
2. Every interactive element has a 1px var(--border) border IN ADDITION to its
   shadow. Shadow alone must never be the only affordance signal.
3. Focus rings use outline + outline-offset, NEVER box-shadow. Shadow is already
   the design language, so a shadow ring is invisible.
     :where(a,button,input,select,textarea,[tabindex]):focus-visible {
       outline: 2px solid var(--blue-600); outline-offset: 2px; }
4. Neumorphic depth only on containers 80px tall or larger. Table rows, dropdown
   options and list items are FLAT with 1px hairline dividers.
5. All numerals use font-variant-numeric: tabular-nums.
6. Never text lighter than #5A7391 for words a user must read, placeholders
   included. #8FA6C0 is borders and gridlines only.
7. Required — Windows High Contrast Mode strips box-shadow and would erase the
   entire design:
     @media (forced-colors: active) {
       .nm-card,.nm-button,.nm-input,.nm-tile { box-shadow:none;
         border:1px solid CanvasText; }
       :where(a,button,input,select,textarea,[tabindex]):focus-visible {
         outline: 2px solid Highlight; } }
8. Honour prefers-reduced-motion.
9. Scope identity is always carried by a text label, never colour alone.
10. Use container queries (@container) for components, not viewport media
    queries.

## Do not

No pure-white background. No purple, teal, pink or gradient accents. No
glassmorphism, blur or transparency. No component library that imposes its own
look (Material, Ant, Chakra, MUI). No emoji as icons — lucide-react only. No
dark mode unless asked. Do not compress the whitespace.
