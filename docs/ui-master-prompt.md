# INVTY GHG Portal — UI Design System & Paste-Ready Master Prompt

**Version** 1.0 · **Companion to** `INVTY_GHG_Portal_Architecture_Spec.md`
**Purpose:** a copy-paste prompt that reliably produces the exact UI you want, plus the reasoning behind the design decisions encoded in it.

---

## PART A — Read this before you paste (5 minutes, saves you a week)

### A.1 Pure neumorphism will fail this product. Here is the fix.

You asked for neumorphism, blue text, white background. That aesthetic is achievable and will look excellent — but classic neumorphism has four failure modes, and this product (data-dense tables, industry professionals, printed reports, long form-filling sessions) hits all four. I have solved each one inside the prompt rather than talking you out of the style.

| Failure mode | Why it bites here | The fix encoded in the prompt |
|---|---|---|
| **Pure white can't do neumorphism.** The effect needs a light shadow *and* a dark shadow. On `#FFFFFF` there is no lighter colour available. | Your "white background" would look flat and broken. | **Canvas is `#EDF1F7`; raised surfaces are `#FFFFFF`.** Reads unmistakably as a white/light UI, and the raised cards genuinely glow. This is the single most important token decision. |
| **Shadow-only affordance.** Neumorphic buttons are defined purely by shadow, so low-vision users, High Contrast Mode users, and anyone on a dim laptop screen cannot tell what is clickable. | Industry professionals on old plant-floor monitors. | **Every interactive element carries a 1px `#DCE4F0` border in addition to its shadow.** Non-negotiable rule in the prompt. |
| **`box-shadow` is stripped in Forced Colors / Windows High Contrast Mode.** The entire visual language disappears — every card, button and input becomes an invisible rectangle. | A real accessibility failure, not a theoretical one. | A `@media (forced-colors: active)` block that swaps every neumorphic shadow for a `1px solid CanvasText` border. Roughly 15 lines that keep the app usable. |
| **Neumorphism at small scale becomes mud.** Soft shadows on 32px table rows read as blur, not depth. | Your Scope 3 tables have hundreds of rows. | **Two-tier surface rule: neumorphism for containers ≥ 80px tall; flat surfaces with hairline dividers for dense data.** Depth is a container property, not a row property. |

There is one more, and it's the reason focus states get their own section in the prompt: **a focus ring cannot be a shadow in this design**, because shadow is already the design language and a shadow-based ring is invisible against it. Focus rings use `outline` + `outline-offset`. This is also the correct modern practice generally, but here it is load-bearing.

### A.2 Blue-text-on-light contrast budget

Blue text on a light ground is elegant and it is easy to make it illegible. The ramp below is built so every text token clears **WCAG 2.2 AA (4.5:1)** against both `#EDF1F7` and `#FFFFFF`:

- `#071B3A` headings — very high contrast, near-black navy
- `#123C82` body text — the workhorse
- `#1D5BD6` links, primary actions, live numbers
- `#5A7391` secondary/muted — the lightest text permitted anywhere; do not go lighter
- `#8FA6C0` **decorative only** — borders, icons, chart gridlines. Never text.

The rule stated in the prompt: *if it is a word a user must read, it is one of the first four. No exceptions, including placeholder text.*

### A.3 How to use these prompts

The master prompt is long on purpose — vague prompts are why builder output disappoints. But most tools truncate or lose fidelity past a certain length, so use this sequence:

1. **Paste PROMPT 0 (Foundation)** first. Get the design system, tokens and component library built and confirm it looks right.
2. **Then paste PROMPT 1, 2, 3…** one screen at a time. Each references the foundation.
3. Only paste the **All-in-one prompt** (Part C) if you're using a tool with a large context and want a single shot.

Works with: Claude (best fidelity for this), v0, Lovable, Bolt, Base44, Cursor. For Figma-first workflows, paste Part B.1 (tokens) into the Figma AI plugin, then build screens from B.3.

**Sequence advice:** build screens in the order 3 → 4 → 11 (Scope Hub → Scope 1 workspace → Results dashboard). Those three prove the whole design language. Everything else is a variation.

---

## PART B — THE MASTER PROMPT

Everything from here to the end of Part B is meant to be copied. Fenced blocks are shown with their content intact — copy the whole section including the code blocks.

---

### ▶ PROMPT 0 — FOUNDATION (paste this first)

````
You are a senior product designer and front-end engineer. Build the design
system and component library for a professional-grade web application. Follow
this specification exactly. Do not substitute your own colours, spacing,
shadows or typography. Where I give a token value, use that value verbatim.

## PROJECT

INVTY GHG Accounting Portal — a public web tool where industrial and corporate
professionals enter energy, fuel and value-chain data and receive a calculated
greenhouse gas inventory (Scope 1, Scope 2, Scope 3) plus a downloadable,
watermarked PDF report.

Audience: sustainability managers, plant engineers, procurement managers and
executives at manufacturing companies. They are technical, time-poor, and
sceptical. The interface must feel precise and trustworthy, not playful.

## VISUAL DIRECTION

Soft neumorphism ("soft UI") on a light blue-grey canvas, with an all-blue
text palette. Calm, clean, spacious, highly legible. Think premium scientific
instrument, not consumer app. Depth is expressed with soft dual shadows;
colour is used sparingly and only to carry meaning.

Hard rules that override the aesthetic wherever they conflict:
1. Every interactive element has a visible 1px border IN ADDITION to its
   shadow. Shadow alone must never be the only signal that something is
   clickable, focusable or editable.
2. All text meets WCAG 2.2 AA contrast (4.5:1 minimum) against its background.
3. Focus rings use `outline` + `outline-offset`, never `box-shadow`.
4. Neumorphic depth applies only to containers 80px tall or larger. Dense
   data (table rows, list items, dropdown options) uses flat surfaces with
   1px hairline dividers.
5. Colour is never the sole carrier of meaning — always pair with a label,
   icon or pattern.

## TECHNICAL STACK

- React 18 + TypeScript
- Tailwind CSS v3 with the tokens below mapped into `tailwind.config.js`
- Framer Motion for transitions
- Recharts for charts
- lucide-react for icons (stroke width 1.5, size 20 default)
- Inter for UI text, JetBrains Mono for numeric/technical values
- No component library that imposes its own visual style (no Material, no
  Ant, no Chakra). Build the primitives yourself from the specs below.

## DESIGN TOKENS — use these exact values

Define as CSS custom properties on `:root`, organised in `@layer base`, and
mirror them into the Tailwind theme.

```css
@layer reset, base, theme, components, utilities;

:root {
  color-scheme: light;

  /* ---- Surfaces ---- */
  --canvas:          #EDF1F7;  /* page background — NOT pure white; the
                                  neumorphic light shadow needs headroom */
  --surface:         #F4F7FB;  /* recessed / secondary panels */
  --surface-raised:  #FFFFFF;  /* cards, inputs, raised elements */
  --surface-sunken:  #E4EAF3;  /* wells, track backgrounds */

  /* ---- Blue text ramp (all AA-compliant on --canvas and --surface-raised) ---- */
  --text-heading:    #071B3A;
  --text-body:       #123C82;
  --text-link:       #1D5BD6;
  --text-muted:      #5A7391;  /* lightest permitted TEXT colour */
  --text-decorative: #8FA6C0;  /* borders, icons, gridlines ONLY — never text */

  /* ---- Blue accents ---- */
  --blue-700:        #10339E;  /* pressed / active state */
  --blue-600:        #1D5BD6;  /* primary action */
  --blue-500:        #3B7BEF;  /* hover */
  --blue-200:        #B9CEF6;
  --blue-100:        #DCE7FA;  /* selected row fill, chips */
  --blue-50:         #EFF4FE;  /* hover fill */

  /* ---- Borders (mandatory on all interactive elements) ---- */
  --border:          #DCE4F0;
  --border-strong:   #C3D2E8;

  /* ---- Neumorphic shadow colours ---- */
  --shadow-dark:     #C7D4E6;
  --shadow-light:    #FFFFFF;

  /* ---- Semantic / scope colours (fixed across ALL charts, badges, PDF) ---- */
  --scope-1:         #D9480F;  /* direct combustion — warm */
  --scope-2:         #1D5BD6;  /* purchased energy — blue */
  --scope-3:         #6741D9;  /* value chain — violet */
  --biogenic:        #64748B;  /* out-of-scope memo items — grey */

  --success:         #0F7B4F;
  --warning:         #A66300;
  --danger:          #B42318;
  --info:            #1D5BD6;

  /* Data quality grades */
  --grade-a:         #0F7B4F;
  --grade-b:         #4C9A2A;
  --grade-c:         #A66300;
  --grade-d:         #C2540A;
  --grade-e:         #B42318;

  /* ---- Radii ---- */
  --r-sm:  8px;   /* chips, badges */
  --r-md:  14px;  /* inputs, buttons */
  --r-lg:  20px;  /* cards */
  --r-xl:  28px;  /* modals, hero panels */
  --r-pill: 999px;

  /* ---- Neumorphic elevation ---- */
  --nm-raised:
      6px 6px 14px var(--shadow-dark),
     -6px -6px 14px var(--shadow-light);
  --nm-raised-sm:
      3px 3px 7px var(--shadow-dark),
     -3px -3px 7px var(--shadow-light);
  --nm-raised-lg:
      12px 12px 28px var(--shadow-dark),
     -12px -12px 28px var(--shadow-light);
  --nm-pressed:
      inset 4px 4px 9px var(--shadow-dark),
      inset -4px -4px 9px var(--shadow-light);
  --nm-inset-input:
      inset 2px 2px 5px var(--shadow-dark),
      inset -2px -2px 5px var(--shadow-light);

  /* ---- Spacing: 4px base grid ---- */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-8: 32px; --s-10: 40px;
  --s-12: 48px; --s-16: 64px;

  /* ---- Motion ---- */
  --ease: cubic-bezier(0.32, 0.72, 0, 1);
  --t-fast: 150ms;
  --t-base: 250ms;
  --t-slow: 400ms;
}
```

## TYPOGRAPHY

- Family: `Inter` (UI), `JetBrains Mono` (all numbers, units, factor values, IDs)
- Base 15px / 1.55 line-height, `--text-body`
- Scale: 12 / 13 / 15 / 17 / 20 / 26 / 34 / 46 px
- Headings: `--text-heading`, weight 600, letter-spacing -0.02em
- **All numerals use `font-variant-numeric: tabular-nums`.** Non-tabular
  figures make live-updating totals visibly jitter. This is mandatory.
- Large display numbers (KPI tiles, running totals): JetBrains Mono, weight
  600, letter-spacing -0.03em
- Units are always a separate, smaller, `--text-muted` span next to the
  number — never baked into the same string.

## COMPONENT SPECIFICATIONS

Build each of these as a typed React component.

### Card
Background `--surface-raised`, radius `--r-lg`, shadow `--nm-raised`,
border `1px solid var(--border)`, padding `--s-6`.
Interactive variant: on hover lift to `--nm-raised-lg` over `--t-base`; on
active drop to `--nm-pressed`. Never animate the border.

### Button
- **Primary:** background `--blue-600`, text `#FFFFFF`, radius `--r-md`,
  shadow `--nm-raised-sm`, border `1px solid var(--blue-700)`, height 44px,
  padding 0 24px, weight 600.
  Hover `--blue-500` + `--nm-raised`. Active `--blue-700` + `--nm-pressed`.
- **Secondary:** background `--surface-raised`, text `--text-link`,
  border `1px solid var(--border)`, shadow `--nm-raised-sm`.
- **Ghost:** transparent, text `--text-link`, border `1px solid transparent`;
  on hover background `--blue-50` and border `--border`.
- **Disabled:** shadow `none`, background `--surface`, text `--text-decorative`,
  border `1px solid var(--border)`, `cursor: not-allowed`, opacity 1
  (do NOT communicate disabled state with shadow removal alone).

### Input / Select / Textarea
Background `--surface-raised`, shadow `--nm-inset-input` (recessed — inputs
are holes, not bumps), border `1px solid var(--border)`, radius `--r-md`,
height 44px, padding 0 16px, text `--text-body`.
Placeholder `--text-muted` (never lighter).
Focus: border becomes `--blue-600` AND
`outline: 2px solid var(--blue-600); outline-offset: 2px`.
Error: border `--danger`, plus an inline message with an icon — never colour alone.
Label sits above, 13px, weight 500, `--text-body`. Every input has a real
`<label for>`; placeholder text is never used as a label.

### Focus ring (global, applies to every focusable element)
```css
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--blue-600);
  outline-offset: 2px;
  border-radius: inherit;
}
```
Never use `:focus` for styling and never use `box-shadow` for the ring.

### Toggle / Segmented control
Track `--surface-sunken` with `--nm-pressed`; the active thumb is
`--surface-raised` with `--nm-raised-sm` and `--text-link` label; inactive
labels `--text-muted`. Thumb slides on `--t-base var(--ease)`.

### Badge / Chip
Radius `--r-pill`, height 24px, padding 0 10px, 12px weight 600, flat (no
shadow), background = 12% tint of its semantic colour, text = the full-strength
colour. Scope badges always show both a coloured dot and the text label.

### Table (dense data — NO neumorphism inside)
Container: Card. Inside: flat `--surface-raised`, rows 44px, 1px
`--border` bottom dividers, sticky header with `--surface` background and
13px uppercase `--text-muted` labels, letter-spacing 0.04em.
Row hover `--blue-50`. Selected row `--blue-100` + a 3px `--blue-600` left
border (never fill colour alone).
All numeric columns right-aligned, tabular figures.

### KPI tile
Card with `--nm-raised`. Label 13px `--text-muted` uppercase; value 34px
JetBrains Mono `--text-heading`; unit 15px `--text-muted`; optional delta
chip. Value animates on change with a 400ms count-up (see Motion).

### Activity row (the most-used component in the app)
A single horizontal row combining selects, a number input, a unit select, and
a live-calculated result. Below it, always visible, a provenance strip in 12px
`--text-muted` showing the emission factor, its source, its publication year
and the data-quality tier. A `⋮` menu on the right.
Result value is `--text-heading`, JetBrains Mono, and animates on change.

## MOTION

- Hover/press: `--t-fast`
- Panel & accordion transitions: `--t-base`, `--ease`
- Number changes: 400ms count-up, ease-out, tabular figures
- Page transitions: 250ms fade + 8px upward slide
- Never animate `box-shadow` alone on large surfaces (repaint cost); animate
  `transform` and `filter`, and cross-fade a pseudo-element for shadow changes.
- Honour reduced motion:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
}
```

## FORCED COLORS MODE — REQUIRED

Windows High Contrast Mode strips `box-shadow` entirely, which would erase
this entire design language. Add:
```css
@media (forced-colors: active) {
  .nm-card, .nm-button, .nm-input, .nm-tile, .nm-toggle {
    box-shadow: none;
    border: 1px solid CanvasText;
  }
  :where(a, button, input, select, textarea, [tabindex]):focus-visible {
    outline: 2px solid Highlight;
  }
}
```

## ACCESSIBILITY REQUIREMENTS

- WCAG 2.2 AA throughout
- Full keyboard operability; logical tab order; visible focus on every control
- Charts have an accessible name, a description, and a toggle revealing the
  underlying data as a real `<table>`
- Scope identity is always conveyed by a text label, not only by colour
- Live-updating totals sit in an `aria-live="polite"` region, debounced so
  screen readers are not flooded on every keystroke
- Form errors are associated via `aria-describedby` and announced
- Minimum touch target 44×44px

## RESPONSIVENESS

Use container queries (`@container`) for components, not viewport media
queries, so cards reflow correctly wherever they are placed.
- ≥1280px: full three-column workspace with persistent right rail
- 768–1279px: rail collapses to a sticky bottom summary bar
- <768px: single column; data-entry screens show a "continue on desktop"
  prompt with an emailed magic link; landing, results dashboard and report
  download remain fully functional

## DELIVERABLE FOR THIS PROMPT

1. `tokens.css` — all custom properties, in `@layer base`
2. `tailwind.config.js` — tokens mapped to the theme
3. A `/components/ui` folder with: Card, Button, Input, Select, NumberInput,
   UnitSelect, Toggle, SegmentedControl, Badge, ScopeBadge, Table, KPITile,
   ActivityRow, ProgressRing, Accordion, Modal, Toast, Tooltip, EmptyState
4. A single `/showcase` route rendering every component in every state
   (default, hover, focus, active, disabled, error) so I can review the
   system before any screens are built

Do not build application screens yet. Foundation only.
````

---

### ▶ PROMPT 1 — SCOPE HUB (the home screen)

````
Using the design system built previously, create the Scope Hub screen — the
home base of the INVTY GHG Portal.

## PURPOSE
After a user has entered their company details, this screen lets them work on
Scope 1, Scope 2 and Scope 3 in ANY ORDER. It is not a wizard. A user who only
cares about Scope 1 must never be forced through the others.

## LAYOUT — 12-column grid, max-width 1440px, 32px gutters

TOP BAR (72px, sticky, --surface-raised, --nm-raised-sm, bottom border):
- Left: INVTY wordmark
- Centre: breadcrumb "Acme Steel Pvt Ltd · FY 2025–26 · Operational control"
- Right: "Save & exit" ghost button, settings icon, help icon

MAIN AREA (columns 1–8):
- H1 "Your carbon inventory" (34px, --text-heading)
- Sub "Complete any scope in any order. Your report updates as you go."
  (17px, --text-muted)
- Below: three SCOPE CARDS.
  · Scope 1 and Scope 2 sit side by side, half width each
  · Scope 3 is full width beneath them, because it contains 15 sub-categories
    and its visual weight should match its conceptual weight

RIGHT RAIL (columns 9–12, sticky, always visible):
The live inventory summary. This never scrolls out of view.

## SCOPE CARD SPECIFICATION

Card, --nm-raised, 24px padding, min-height 220px. Contents top to bottom:
1. Icon in a 48px circular well (--surface-sunken, --nm-pressed), tinted with
   the scope colour: Scope 1 flame, Scope 2 lightning bolt, Scope 3 link/chain
2. Eyebrow: "SCOPE 1" — 12px, weight 700, letter-spacing 0.08em, scope colour
3. Title: "Direct emissions" — 20px, --text-heading
4. Description: "Fuel burned on site, company vehicles, industrial processes
   and refrigerant leaks." — 15px, --text-muted, max 2 lines
5. STATUS ROW, one of three states:
   · Not started — grey dot + "Not started" + "~8 min" estimate
   · In progress — amber ring showing % + "6 of 12 entries"
   · Complete — green check + the subtotal as a large tabular number
     e.g. "412.4" with "tCO₂e" as a smaller muted unit
6. Progress bar (4px, --surface-sunken track, scope-coloured fill, animated)
7. Primary action button, label changes with state:
   "Start" / "Continue" / "Review"

Scope 3 card additionally shows a horizontal strip of 15 small numbered
squares representing the categories: filled in --scope-3 when complete,
--blue-200 when included but empty, --surface-sunken when excluded. Hovering
a square shows a tooltip with the category name. It carries two buttons:
"Continue" (primary) and "Screen categories" (secondary).

## RIGHT RAIL SPECIFICATION

Card, --nm-raised-lg, 24px padding, sticky at 96px from top:
1. "TOTAL EMISSIONS" — 12px uppercase --text-muted
2. Huge number: 46px JetBrains Mono --text-heading, tabular, animated
   count-up on any change; "tCO₂e" beneath in 15px --text-muted
3. Horizontal stacked bar showing the scope split, segments in scope colours,
   with a text legend below listing each scope, its value and its percentage
   (never colour alone)
4. Divider
5. "DATA QUALITY" — a letter grade in a 40px circular well, coloured by grade,
   with a one-line plain-English explanation beneath
6. "COVERAGE" — "2 of 3 scopes · 3 of 15 Scope 3 categories"
7. Primary button "Generate report" — enabled as soon as ANY scope has data
8. Ghost link "Download data (XLSX)"

## BEHAVIOUR
- Total and scope split animate whenever underlying data changes
- Cards lift on hover (--nm-raised → --nm-raised-lg) over 250ms
- Entering a scope is a 250ms fade + 8px slide
- The rail's total is inside aria-live="polite", debounced 600ms
- Every card is a real <a> or <button>, fully keyboard operable

Populate with realistic sample data for an Indian steel manufacturer:
Scope 1 not started, Scope 2 complete at 412.4 tCO₂e, Scope 3 in progress at
1,204.7 tCO₂e across categories 1, 3 and 6. Total 1,617.1 tCO₂e. Grade C.
````

---

### ▶ PROMPT 2 — SCOPE 1 WORKSPACE (the data-entry pattern)

````
Using the established design system, build the Scope 1 data-entry workspace.
This screen defines the data-entry pattern reused by Scope 2 and Scope 3, so
get it right.

## LAYOUT
- Top bar as before, plus a back link "← All scopes"
- Left: page content, columns 1–8
- Right: the same sticky summary rail, but scoped to Scope 1 — showing the
  Scope 1 subtotal and a donut of its four sub-categories

## PAGE CONTENT
H1 "Scope 1 — Direct emissions" with a --scope-1 coloured eyebrow.
Below it, four ACCORDION SECTIONS, each a Card with --nm-raised:

1. Stationary combustion — "Boilers, furnaces, DG sets, kilns"
2. Mobile combustion — "Owned and leased vehicles, forklifts"
3. Process emissions — "Chemical reactions in production"
4. Fugitive emissions — "Refrigerant leaks, SF₆, fire suppressants"

Each accordion header shows: icon in a small well, title, one-line
description, and on the right a running subtotal (tabular, animated) plus a
chevron. Collapsed sections show only the header. Expanding animates height
over 250ms with --ease.

## INSIDE AN EXPANDED SECTION

A) A three-way segmented control at the top: "Guided entry | Upload CSV |
   Quick estimate"

B) In Guided entry — a list of ACTIVITY ROWS. Each row:

   ┌──────────────────────────────────────────────────────────────────┐
   │ [Facility ▾] [Fuel type ▾] [ 45,000 ] [ L ▾ ]      = 113.0 tCO₂e │
   │ ⓘ DESNZ 2026 · Fuels · 2.5110 kgCO₂e/L · ● Primary data       ⋮ │
   └──────────────────────────────────────────────────────────────────┘

   - Row is a flat surface with --border, radius --r-md, NOT neumorphic
     (rows are dense data — see the two-tier surface rule)
   - Inputs are inset (--nm-inset-input)
   - The result on the right is 17px JetBrains Mono --text-heading, right-
     aligned, and count-up animates on every change
   - The provenance strip below is ALWAYS visible, never hover-only. It is
     the product's core credibility feature: 12px, --text-muted, with the
     data-quality tier as a small coloured dot + label
   - `⋮` opens a menu: Add note · Attach evidence · Change method ·
     Override factor · Duplicate · Delete
   - A validation warning appears inline beneath the row in --warning with an
     icon and plain-English text ("This is 8× the typical diesel use for a
     plant this size — please check the unit"). Warnings never block; they
     never appear as modals.

C) A dashed-border "+ Add another entry" button at the end of the list,
   full width, 44px, --text-link.

D) An empty state when a section has no rows: a centred illustration well,
   a one-line explanation, and two buttons ("Add first entry" / "Upload CSV").

## SPECIAL CASE — FUGITIVE EMISSIONS
Refrigerants need a distinct row layout: [Facility] [Refrigerant ▾]
[kg recharged] with the GWP shown as a read-only chip next to the picker.
Add an amber info callout above the list explaining that R-22 and other
Montreal Protocol gases are reported OUTSIDE the scopes as a separate memo
item and are therefore excluded from the Scope 1 total.

## BOTTOM BAR
Sticky, --surface-raised, --nm-raised-sm: "Scope 1 subtotal" with the animated
figure on the left; "Save & continue to Scope 2" primary button and "Back to
all scopes" ghost button on the right.

Populate with realistic sample data: 3 stationary rows (diesel, natural gas,
LPG), 2 mobile rows, 1 refrigerant row, one row carrying a validation warning.
````

---

### ▶ PROMPT 3 — RESULTS DASHBOARD

````
Using the established design system, build the Results Dashboard — the payoff
screen a user reaches once they have entered data.

## LAYOUT — vertical stack of full-width rows, max-width 1440px

ROW 1 — Four KPI tiles in a 4-column grid:
  · Total emissions — 1,617.1 tCO₂e (46px, animated)
  · Emissions intensity — 4.12 tCO₂e per ₹ crore turnover
  · Data quality — letter grade C in a coloured circular well
  · Coverage — "2 of 3 scopes · 3 of 15 categories"
Each is a Card with --nm-raised, and each has a small "?" affordance opening
a tooltip that explains the metric in one plain sentence.

ROW 2 — two Cards side by side (8 cols / 4 cols):
  · Left: horizontal stacked bar of the scope split, plus a legend table
    listing scope, value, percentage and data-quality grade
  · Right: donut of the top 5 emission sources with a centre label

ROW 3 — full-width Card: SANKEY DIAGRAM
  Flows: individual activities → GHG categories → scopes → total.
  Node fills in scope colours at 70% opacity, links at 35%. Hovering a link
  highlights the full path and dims the rest. This is the signature visual of
  the product — give it room (min-height 420px) and make it beautiful.
  Include a "View as table" toggle for accessibility.

ROW 4 — full-width Card: "Top 20 emission sources"
  A dense table (flat, hairline dividers, NOT neumorphic): rank, source,
  scope badge, category, value, % of total, contribution bar, quality tier.
  Sortable columns, sticky header.

ROW 5 — full-width Card: "Data quality assessment"
  Five horizontal meters — Technological, Temporal, Geographical,
  Completeness, Reliability — each 1–5 with the score as a filled segment bar.
  Beneath each, one specific improvement action in plain language
  ("Replace spend-based Category 1 estimates with supplier data to move from
  Proxy to Primary").

ROW 6 — full-width Card: "What if?" scenario panel
  Neumorphic sliders in sunken tracks:
  · "% of electricity from a renewable PPA" (0–100%)
  · "% reduction in diesel use" (0–50%)
  · "Switch fleet to electric" toggle
  As sliders move, a ghosted comparison bar shows the new total against the
  current one, with the delta in --success. Recalculation is instant and
  the numbers count-animate.

STICKY FOOTER BAR:
"Download report" primary button, plus a format segmented control
(PDF · XLSX · CSV · JSON).

## CHART STYLING RULES
- Scope colours are fixed and identical to the tokens — never let a chart
  library assign its own palette
- Gridlines --text-decorative at 40% opacity; axis labels 12px --text-muted
- No chart junk: no 3D, no drop shadows on data marks, no gradient fills
  except the Sankey links
- Tooltips are Cards with --nm-raised-sm and a 1px border
- Every chart has an accessible name, a description, and a data-table toggle

Populate with realistic sample data for an Indian steel manufacturer.
````

---

### ▶ PROMPT 4 — REPORT PREVIEW & PDF STYLING

````
Using the established design system, build the report preview screen and the
print stylesheet for the downloadable PDF.

## SCREEN
Split view. Left 60%: a paginated A4 preview of the report, pages rendered as
Cards with --nm-raised-lg on the --canvas background, 32px apart.
Right 40%, sticky: a configuration panel —
  · Report type: "Screening estimate" vs "Full inventory" (auto-detected)
  · Framework template: GHG Protocol · BRSR Core · ISO 14064-1
  · Sections to include (checkbox list, with the calculation-log annexe off
    by default)
  · Watermark opacity slider (0.03 – 0.12, default 0.06)
  · "Generate PDF" primary button with a progress state

## PDF PAGE DESIGN
Print colours differ from screen: white page, --text-heading for headings,
--text-body for body, scope colours unchanged so screen and print match.

Every page carries:
- A repeating header (except the cover): small INVTY mark left, report title
  centre, hairline rule beneath
- A repeating footer: "INVTY · <Company> GHG Inventory <Period> · Page X of Y
  · Generated <date> · Report ID <id>"
- The INVTY WATERMARK behind all content:

```css
@page { size: A4; margin: 20mm 18mm 22mm 18mm; }

body::before {
  content: "";
  position: fixed;        /* fixed → repeats on every printed page */
  inset: 0;
  background-image: url("data:image/svg+xml;base64,<INVTY_LOGO_BASE64>");
  background-repeat: no-repeat;
  background-position: center center;
  background-size: 55% auto;
  opacity: 0.06;
  transform: rotate(-30deg);
  z-index: 0;
  pointer-events: none;
}
.page-content { position: relative; z-index: 1; }
```

Requirements for the watermark: the logo must be an inline base64 SVG data
URI (the PDF renderer must never fetch it over the network), opacity between
0.05 and 0.08, and it must sit behind text without reducing legibility.
For "Screening estimate" reports, add a second, more visible diagonal band
reading "SCREENING ESTIMATE" at 0.10 opacity in --warning.

## REPORT STRUCTURE (build all pages as preview components)
Cover · Executive summary · Boundary declaration · Scope 1 detail ·
Scope 2 detail (location-based AND market-based shown side by side) ·
Scope 3 detail · Exclusions table · Intensity metrics · Data quality ·
Methodology (standards, GWP set, every factor source with version and URL) ·
Limitations & disclaimer · Optional calculation-log annexe · Back cover CTA

The methodology page is the page a professional turns to first — make it
complete, specific and well typeset.
````

---

## PART C — SINGLE ALL-IN-ONE PROMPT

If your tool has a large context window and you want one shot, paste **PROMPT 0** followed by this bridging paragraph and then PROMPTS 1–4 back to back:

> "Build all of the following screens using the design system defined above. Maintain absolute consistency of tokens, spacing, shadow treatment and scope colours across every screen. Where a component is reused, reuse the same component — do not create variants. Produce a working, navigable prototype with realistic sample data for an Indian steel manufacturer throughout."

---

## PART D — THINGS TO EXPLICITLY FORBID

Append this block to any prompt if your first output drifts. These are the specific ways AI builders degrade a neumorphic brief:

````
## DO NOT
- Do not use pure #FFFFFF as the page background — the neumorphic effect
  requires the canvas to be darker than the raised surfaces
- Do not use purple, teal, pink or gradient accents. The palette is blue plus
  the three fixed scope colours plus semantic states. Nothing else.
- Do not apply neumorphic shadows to table rows, dropdown options, list items
  or anything under 80px tall
- Do not use box-shadow for focus rings
- Do not remove borders from interactive elements "because the shadow shows it"
- Do not use text lighter than #5A7391 anywhere a user must read words
- Do not use non-tabular figures for any number that updates
- Do not use emoji as icons — use lucide-react
- Do not add a dark mode unless asked; this is a light-theme product
- Do not use glassmorphism, blur, or transparency effects
- Do not centre body text or use decorative fonts
- Do not invent emission factor values — use the placeholders given and mark
  them clearly as sample data
- Do not compress the whitespace. Generous spacing is the point.
````

---

## PART E — QUICK REFERENCE: token cheat sheet

| Purpose | Token | Value |
|---|---|---|
| Page background | `--canvas` | `#EDF1F7` |
| Cards, inputs | `--surface-raised` | `#FFFFFF` |
| Wells, tracks | `--surface-sunken` | `#E4EAF3` |
| Headings | `--text-heading` | `#071B3A` |
| Body text | `--text-body` | `#123C82` |
| Links, actions | `--text-link` | `#1D5BD6` |
| Muted text (lightest allowed) | `--text-muted` | `#5A7391` |
| Borders | `--border` | `#DCE4F0` |
| Dark shadow | `--shadow-dark` | `#C7D4E6` |
| Light shadow | `--shadow-light` | `#FFFFFF` |
| Scope 1 | `--scope-1` | `#D9480F` |
| Scope 2 | `--scope-2` | `#1D5BD6` |
| Scope 3 | `--scope-3` | `#6741D9` |

Raised: `6px 6px 14px #C7D4E6, -6px -6px 14px #FFFFFF`
Pressed: `inset 4px 4px 9px #C7D4E6, inset -4px -4px 9px #FFFFFF`
Input inset: `inset 2px 2px 5px #C7D4E6, inset -2px -2px 5px #FFFFFF`
