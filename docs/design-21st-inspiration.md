# UI design — 21st.dev inspiration (October 2026)

Minilytics uses **its own React/Tailwind implementation** inspired by the following 21st.dev patterns. No gated component source is copied; all markup, state and analytics bindings are local and auditable.

1. **Analytics Bento** — https://21st.dev/@romanvasnev/components/analytics-bento — asymmetric analytic widgets, multiple information densities, integrated tooltips and data visuals.
2. **Expandable Tabs** — https://21st.dev/@rjcuff2000/components/expandable-tabs — compact, tactile segmented controls; adapted in `StudioUI.tsx` without a motion dependency.
3. **Dashboard components: Stats Bento and statistic tiles** — https://docs.21st.dev/community/components/s/dashboard — metric-first cards, bento analytics hierarchy, modular dashboards.
4. **Bento patterns** — https://docs.21st.dev/blog/react-bento-grid-components — one primary information area, proportional sub-widgets, responsive stacking.
5. **Light card restraint** — https://news.21st.dev/blog/react-spotlight-effect-components — avoids expensive pointer effects on white cards; prioritizes hover borders and keyboard focus.

## Palette
- Canvas: `#FFFFFF`
- Ink: `#101828`
- Primary cobalt: `#4F62EF`
- Primary light: `#EEF1FF`
- Live: `#1DBB88`
- Border: `#E8EDF5`
- Muted: `#7A889E`

### Product rules
- Data must come from the API; never seed illustrative traffic.
- Public dashboards show only anonymized aggregates; customer dashboards remain behind admin authentication.
- Respect `prefers-reduced-motion`, show real zero states, provide visible focus, and design mobile layouts first.
- Geo markers are approximate country-level values; no GPS or visitor IDs in the public globe.
