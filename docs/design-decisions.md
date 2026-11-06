# Cairn design decision record

Source of truth for visual decisions. Read this before changing any style.
Guide: the `landing-page-design` skill (elayadesign/ai-design-skills). Where this file and the skill differ, the difference is listed under "Deliberate deviations".

## Approved (2026-11-06)
| Area | Decision |
|---|---|
| Direction | Flat, quiet, confident. Real product visuals carry the story, not decoration. |
| Gradients | Only the logo mark, and the hero heading text (left to right: white to #9B9B9B in dark, black to #666666 in light). Nothing else. |
| Dark theme | Neutral only: page #181818, surface #1F1F1F, raised #272727, border #313131, deepest #000000. |
| Copy | Allowed: one consistent primary action ("Create a workspace"), a tagline reveal and a Home FAQ reusing existing wording. Nothing else is rewritten. |
| Legal pages | Privacy and Terms are omitted until real documents exist. No dead links. |
| Scope | Home plus every app screen. |

## Fonts and type
- Geist for everything, Geist Mono only for numbers and code. No italics. Weights 400, 500, 600 only.
- Sizes from Tailwind's scale, resolved as `--text-xs` ... `--text-9xl` with paired `--lh-*`.
- Named styles exist as classes: `heading-1..6`, `title-1..5`, `body-1..6`, `button-lg/md/sm/xsm`, `caption-1..5`.
- Elements: h1 = Heading 4 (page titles), h2 = Heading 6, h3 = Title 2, body = Body 6 (14/20), fields 16/24 (stops phone zoom).
- Headings `text-wrap: balance`, body `text-wrap: pretty`.

## Colour (light / dark)
| Token | Light | Dark |
|---|---|---|
| page `--bg` | #FFFFFF | #181818 |
| surface | #F7F7F7 | #1F1F1F |
| raised `--surface-2` | #EFEFEF | #272727 |
| border | #E5E5E5 | #313131 |
| text | #111111 | #F2F2F2 |
| muted | #5B5B5B | #A1A1A1 |
| accent | #4F46E5 | #8B8CFF |
| on accent | #FFFFFF | #111111 |
All text pairs measured at 4.5:1 or better (see the QA record).
Semantic: good #0F7A55 / #4CC99A, warn #8A5200 / #F2B84D, bad #B3261E / #FF7D72. Light tints for pills; dark pills are outlined on #272727.

## Spacing, radius, borders
- Spacing tokens only: 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 px as `--space-*`.
- Main buttons: 8px vertical, 12px horizontal padding.
- Radius: Tailwind values only (`--rad-sm` 2, base 4, md 6, lg 8, xl 12, 2xl 16, 3xl 24, full). Buttons and fields lg, cards 2xl, pills and avatars full.
- Nested radius = outer radius minus gap, only when the result is above 2. Cards use 24px padding, so inner controls keep their own radius.
- Borders go all the way round or not at all on cards. Dividers inside tables are not cards.
- Shadows: none, except things that float (Ask Cairn panel, toast, dialogs, the sticky save bar).

## Motion
- One curve: `--ease` = cubic-bezier(0.22, 1, 0.36, 1). Loops use `--ease-loop`. Never the browser defaults.
- 300ms for colour and opacity, 500ms for position changes. Nothing under 200ms.
- Animate transform and opacity only. Reduced motion: no movement, plain opacity.
- Scroll reveals: rise 32px and fade, 600 to 800ms, once, via IntersectionObserver.

## Icons
Phosphor, inlined as SVG (no runtime download). No emoji or text glyphs as icons.

## Rejected
- Purple to pink gradient surfaces, aurora backgrounds, dotted page backgrounds, glassmorphism on content.
- Navy-tinted dark theme (#0b0d17 and friends).
- Colourful per-feature tile icons (teal, pink). One accent plus semantic colours.
- "Start free" (implies pricing that does not exist).

## Deliberate deviations from the skill
- Footer stays light in the light theme (the skill's table suggested #111111). You rejected a dark footer on a light page earlier.
- Semantic pills in dark mode are outlined on #272727 so status stays visible without adding backgrounds outside the approved list.
