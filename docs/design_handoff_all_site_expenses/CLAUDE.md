# For Claude Code — read this first

You are being asked to implement a redesigned **All Site Expenses** screen in this codebase.

## Your task

1. **Read `README.md`** in this folder. It has the full spec.
2. **Open `reference/All Site Expenses.html`** in a browser (or have the user open it). The page renders a pan/zoom design canvas with multiple artboards. The desktop and mobile artboards are the source of truth for layout, copy, and interaction.
3. **Inspect the JSX in `reference/`** for exact values when in doubt (colors, sizes, spacing, hover states, conditional logic).
4. **Recreate the design inside this codebase** using its existing framework, component library, and styling system. Do **NOT** import the JSX files from `reference/` as-is — they use Babel-in-the-browser and a custom React-without-JSX-compile setup that won't fit a normal build.

## What to mirror exactly

- **Information architecture** (sections, order, what's on screen).
- **Copy** (page titles, KPI labels, button labels, empty states).
- **Tokens** (colors, type sizes, spacing, radii) — see README §9. If this app already has equivalents, prefer the existing ones and report any mismatches.
- **Behavior** of the expenses table: search, kind pills, three selects, sort, group-by, density toggle, sticky header, filtered footer totals.

## What to use the codebase for

- **Components**: Button, Card, Badge, Input, Select, Table — use whatever exists. Do **not** reimplement primitives.
- **Routing**: wire `Contracts & Payments ↗`, `Add expense`, and trade-click → table-filter using the app's existing router/state.
- **Data**: the spec defines the data shape (README §10). Map it onto the real store/API; do not ship the mock data in `reference/data.js`.

## What to ignore in `reference/`

- `design-canvas.jsx` — that's display chrome for the handoff only.
- `app.jsx` — composes the canvas with the artboards. Not a real route.
- The `window.X = X` exports at the bottom of each JSX file — that's an in-browser-only pattern.

## Open questions before you start

See README §14. Surface them to the user if they're not answerable from the codebase.

## Suggested order

See README §13. Build bottom-up: tokens → primitives → small viz → KPIs → trade strip → expenses table → pages.
