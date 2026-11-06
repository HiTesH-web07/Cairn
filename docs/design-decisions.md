# Cairn design decision record

Source of truth for visual decisions. Read this before changing any style.
Guide: the `landing-page-design` skill (elayadesign/ai-design-skills). Where this file and the skill differ, the difference is listed under "Deliberate deviations".

## Approved (2026-11-06)
| Area | Decision |
|---|---|
| Direction | Flat, quiet, confident. Real product visuals carry the story, not decoration. |
| Gradients | Only the logo mark, and the hero heading text (left to right: white to #9B9B9B in dark, black to #666666 in light). Nothing else. |
| Dark theme | Navy, chosen by the owner after seeing both (2026-11-06). Page #0B0D17, surface #131728, raised #1A1F35, border #252B45, footer #0C0E22. Overrides the skill's neutral list. |
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
| page `--bg` | #FFFFFF | #0B0D17 |
| surface | #F7F7F7 | #131728 |
| raised `--surface-2` | #EFEFEF | #1A1F35 |
| border | #E5E5E5 | #252B45 |
| text | #111111 | #E9ECF8 |
| muted | #5B5B5B | #9BA4C0 |
| accent | #4F46E5 | #8B8CFF |
| on accent | #FFFFFF | #0B0D17 |
All text pairs measured at 4.5:1 or better (see the QA record).
Semantic: good #0F7A55 / #4CC99A, warn #8A5200 / #F2B84D, bad #B3261E / #FF7D72. Tinted fills for pills in both themes (dark: #143327, #36290F, #3B1C1A). Banners in dark use the light accent with dark text.

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
- Neutral grey dark theme (#181818 family). Tried, then replaced by navy at the owner's request.
- Colourful per-feature tile icons (teal, pink). One accent plus semantic colours.
- "Start free" (implies pricing that does not exist).

## Deliberate deviations from the skill
- Footer stays light in the light theme (the skill's table suggested #111111). You rejected a dark footer on a light page earlier.
- Dark theme is navy, not the skill's neutral list, by the owner's choice.

## Home: navigation and hero (step 2)
- Nav: compact bar, centred, sized to its content, floating 12px off the top edge. Translucent surface over a 16px blur, 1px border, radius 16 with 8px padding, so inner controls are radius 8 (nested radius rule). Firmer surface once the page has scrolled.
- Current section is marked with `aria-current` (scroll spy, IntersectionObserver). No scroll listener.
- Menu toggle: three lines that turn into a cross (transform and opacity, 500ms on the base curve).
- Mobile menu (860px and below): full height panel, base surface at 94% with a 24px blur, page scroll locked, focus moves in and returns to the toggle, Escape closes. Links rise 24px and fade, 60ms apart, finished by 400ms.
- Hero: Heading 1. 60/60 from 1024px, 48/48 from 640px, 36/40 below. Heading and sub copy capped at 680px. Heading text gradient only (black to #666666 light, white to #9B9B9B dark). Phrases are kept whole (`nowrap`) except below 370px.
- Hero CTA uses Button-lg with 12px / 24px padding (tokens). The 8px / 12px rule stays for standard buttons. One primary action ("Create a workspace" or "Open my week" when signed in), one quiet secondary.
- One proof line, using existing product facts. No invented logos, counts or quotes.
- Hero visual: the product as a ledger. Weight bars share one track so widths compare honestly. Numbers in Geist Mono. One entrance (rows rise and fade, bars grow from the left, score counts up), then it rests. No floating chips, no looping motion.
- Icons: Phosphor regular, inlined from `public/phosphor.js` (MIT, licence in `public/fonts/LICENSE-phosphor.txt`). `UI.ph('name')` returns the SVG.
- CTA wording is now the same everywhere: "Create a workspace".

## Home sections (step 3)
- Section heading: kicker (Caption 3, uppercase, accent), Heading 2 at 48/48 from 1024px, 36/40 from 640px, 30/36 below. Heading and sub copy capped at 680px.
- Score walkthrough: flat ledger like the hero. Mono numbers, 8px bars that grow with transform, one accent. No decorative circles, no gradient panel. One loop is about 12 seconds (was 24). Ratings and points start at 3.8s.
- Four steps: the same scenes, flat. Emoji and text glyphs replaced by Phosphor icons. Scene card class renamed `sc-card` (it clashed with the "Where you work" `wk` class). On phones the tabs are a 2 by 2 grid and the step text shows below.
- Why it's different: two flat cards, the winner outlined once in the accent. Numbers in mono, 25 muted and 88 in the accent.
- Fairness: one featured statement with its bars, and a quiet hairline list. Replaces four identical cards.
- The four principle cards under the hero are gone. The hero proof line and the Fairness section already say it.
- Progress bars everywhere use `transform: scaleX`. Scroll reveals rise 32px over 700ms, once.

## Home, lower half (step 4)
- Tagline reveal sits after "Why it's different". Copy recombines existing phrases: "Measure what mattered, not how busy anyone looked. One fair score for every team, rated by the people who used the work." Words rise from 30% to full opacity one by one as they cross a line 30% above the bottom of the screen (IntersectionObserver, 40ms apart, capped at 400ms). Reduced motion: all words at full strength at once.
- FAQ: nine questions, every answer is an existing product fact. Same text feeds FAQ structured data (JSON-LD) added on the Home page only. No risk reversal line (trial, guarantee) because none exists. Add one only when a real policy exists.
- Closing call to action: flat accent panel, same label as the hero button. No decoration, no overlap with the footer.
- Footer: light surface in light mode, navy in dark. Check icons, not glyphs. No Privacy or Terms links until real documents exist.
- Phone alerts: handset corners 24px (radius snap bug fixed), icon list instead of rules down the side.
- 404: branded page for unknown addresses (server) and unknown routes (in the app). Titles reset when you leave it.
- Sharing: Open Graph and Twitter tags, a 1200 by 630 image (`public/og.png`, navy, Geist, logo mark, headline only). Theme colour follows light and dark.

## Why it's different, rebuilt (follow-up to step 3)
- Two static boxes became a short race that plays once on scroll, with a Replay button. Busy week: dots fill from 0 to 24 to 50 and the counter follows, while the score stops at 25 ("Still 25. More tasks, same score."). Focused week: three priorities land, the score counts to 88.
- About 6 seconds end to end. Bars grow with transform, dots and slabs with transform and opacity. Reduced motion shows the final state.
- Numbers in Geist Mono. The winning week is outlined once in the accent. All figures match the walkthrough (25 and 88).
