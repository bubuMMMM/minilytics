# UI design — 21st.dev inspiration (October 2026)

Minilytics uses **its own React/Tailwind implementation** inspired by the following 21st.dev patterns. No gated component source is copied; all markup, state and analytics bindings are local and auditable.

1. **Analytics Bento** — https://21st.dev/@romanvasnev/components/analytics-bento — asymmetric analytic widgets, multiple information densities, integrated tooltips and data visuals.
2. **Expandable Tabs** — https://21st.dev/@rjcuff2000/components/expandable-tabs — compact, tactile segmented controls; adapted in `StudioUI.tsx` without a motion dependency.
3. **Dashboard components: Stats Bento and statistic tiles** — https://docs.21st.dev/community/components/s/dashboard — metric-first cards, bento analytics hierarchy, modular dashboards.
4. **Bento patterns** — https://docs.21st.dev/blog/react-bento-grid-components — one primary information area, proportional sub-widgets, responsive stacking.
5. **Light card restraint** — https://news.21st.dev/blog/react-spotlight-effect-components — avoids expensive pointer effects on white cards; prioritizes hover borders and keyboard focus.

## Palette

Source of truth: `src/dashboard/styles.css` (RGB triplets so Tailwind can apply alpha). Neutral zinc scale + one blue accent. Dark mode is `.dark` on `<html>`. Legacy aliases (`paper`, `brand`, `visitors`, `visitorsSoft`) have been removed; use `surface`, `accent`, `accent-soft`. Semantic `revenue` / `revenueSoft` still map to `success`.

### Light
| Token | RGB | Hex |
|---|---|---|
| canvas, surface | 255 255 255 | `#FFFFFF` |
| well | 250 250 250 | `#FAFAFA` |
| line | 234 234 236 | `#EAEAEC` |
| line-strong | 212 212 216 | `#D4D4D8` |
| ink | 9 9 11 | `#09090B` |
| ink-2 | 63 63 70 | `#3F3F46` |
| ink-3 | 113 113 122 | `#71717A` |
| ink-4 | 161 161 170 | `#A1A1AA` |
| accent | 37 99 235 | `#2563EB` |
| accent-fg | 255 255 255 | `#FFFFFF` |
| accent-soft | 239 246 255 | `#EFF6FF` |
| success | 22 163 74 | `#16A34A` |
| success-soft | 240 253 244 | `#F0FDF4` |
| danger | 220 38 38 | `#DC2626` |
| danger-soft | 254 242 242 | `#FEF2F2` |
| warning | 202 138 4 | `#CA8A04` |
| warning-soft | 254 252 232 | `#FEFCE8` |

### Dark
| Token | RGB | Hex |
|---|---|---|
| canvas | 10 10 11 | `#0A0A0B` |
| surface | 17 17 19 | `#111113` |
| well | 24 24 27 | `#18181B` |
| line | 39 39 42 | `#27272A` |
| line-strong | 63 63 70 | `#3F3F46` |
| ink | 250 250 250 | `#FAFAFA` |
| ink-2 | 212 212 216 | `#D4D4D8` |
| ink-3 | 161 161 170 | `#A1A1AA` |
| ink-4 | 113 113 122 | `#71717A` |
| accent | 96 165 250 | `#60A5FA` |
| accent-fg | 10 10 11 | `#0A0A0B` |
| accent-soft | 23 37 84 | `#172554` |
| success | 74 222 128 | `#4ADE80` |
| success-soft | 5 46 22 | `#052E16` |
| danger | 248 113 113 | `#F87171` |
| danger-soft | 69 10 10 | `#450A0A` |
| warning | 250 204 21 | `#FACC15` |
| warning-soft | 66 32 6 | `#422006` |

### Product rules
- Data must come from the API; never seed illustrative traffic.
- Public dashboards show only anonymized aggregates; customer dashboards remain behind admin authentication.
- Respect `prefers-reduced-motion`, show real zero states, provide visible focus, and design mobile layouts first.
- Geo markers are approximate country-level values; no GPS or visitor IDs in the public globe.
