# Cairn design decision record

The source of truth for how Cairn looks. Read it before changing any style. Guide: the `landing-page-design` skill (elayadesign/ai-design-skills). Where the owner chose differently from the skill, it is listed at the end.

## Direction
Flat, quiet, confident. Real product visuals carry the story (the ledger, the race, the phone), not decoration. Navy dark theme, white light theme, one accent.

## Files
| File | What it holds |
|---|---|
| `public/system.css` | Tokens (type, spacing, radius, colour, motion), named text styles, buttons, fields, cards, pills. Loaded after `style.css`, wins over it. Never prune it. |
| `public/home.css` | Home: nav, hero, every section, FAQ, closing, footer, 404 |
| `public/app.css` | The app: sidebar, page heads, banners, tiles, touch, contrast fixes |
| `public/style.css` | Older shared rules. Pruned of unused rules; many still apply |
| `public/phosphor.js` | Icons (Phosphor, MIT). `UI.ph('name')`, and `UI.icon(name)` for the app's older names |

## Fonts and type
- Geist for everything, Geist Mono for numbers and code. No italics. Weights 400, 500, 600 only (`b`, `strong`, `th` are 600).
- Sizes come from Tailwind's scale as `--text-xs` to `--text-9xl` with paired `--lh-*`. Named styles exist as classes: `heading-1..6`, `title-1..5`, `body-1..6`, `button-lg/md/sm/xsm`, `caption-1..5`.
- Elements: h1 = Heading 4, h2 = Heading 6, h3 = Title 2, body 14/20, fields 16/24 (stops phone zoom), `small` and `code` 12/16.
- Display sizes (owner preference, calmer than the skill): hero heading 48 desktop / 36 tablet / 30 phone, section headings 36 / 30 / 24, tagline 36 / 30 / 24, big numerals 36 to 60.
- Headings `text-wrap: balance`, body `text-wrap: pretty`. Heading text gradient only on the hero: black to #666666 (light), white to #9B9B9B (dark). No hyphens in copy.

## Colour
| Token | Light | Dark (navy) |
|---|---|---|
| page `--bg` | #FFFFFF | #0B0D17 |
| surface | #F7F7F7 | #131728 |
| raised `--surface-2` | #EFEFEF | #1A1F35 |
| border | #E5E5E5 | #252B45 |
| text | #111111 | #E9ECF8 |
| muted | #5B5B5B | #9BA4C0 |
| accent | #4F46E5 | #8B8CFF |
| on accent | #FFFFFF | #0B0D17 |
Semantic: good #0F7A55 / #4CC99A, warn #8A5200 / #F2B84D, bad #B3261E / #FF7D72, with flat tinted fills. Banners use the accent as a flat fill with `--on-accent` text. The only gradient anywhere is the logo mark.

## Spacing, radius, borders, shadows
- Spacing tokens only: 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 px as `--space-*`. Standard buttons 8 / 12. Hero and closing buttons use Button-lg with 12 / 24.
- Radius: Tailwind values as `--rad-*` (2, 4, 6, 8, 12, 16, 24, full). Buttons and fields 8, cards 16 to 24, pills and avatars full. Nested radius = outer minus gap when above 2.
- Cards have one full border or none. No single sided card borders.
- Shadows only on floating things: Ask Cairn panel, toast, dialogs, the sticky save bar.

## Motion
- One curve `--ease` cubic-bezier(0.22, 1, 0.36, 1); `--ease-loop` for loops. 300ms for colour and opacity, 500ms for movement, nothing under 200ms.
- Transform and opacity only (bars grow with `scaleX`). Reduced motion: no movement, plain opacity, endless animations stop.
- Scroll reveals rise 32px and fade over 700ms, once. Entrances play once; the race and walkthrough replay when scrolled back into view.

## Icons and imagery
Phosphor, inlined. No emoji and no text glyphs as icons. Illustrations are the product itself. Sharing image `public/og.png` (navy, Geist, logo mark, headline).

## Content rules
- Example data is plain and fictional (Riya Shah, Amit, "Ship the new onboarding flow"). No testimonials, customer logos, prices, guarantees or statistics unless real ones are supplied.
- One primary action everywhere: "Create a workspace" (signed in: "Open my week").
- No Privacy or Terms links until real documents exist. No risk reversal line until a real policy exists.
- FAQ answers are existing product facts, and also feed FAQ structured data.

## Rejected
Purple to pink gradient surfaces, aurora and dotted backgrounds, glassmorphism on content, neutral grey dark theme (tried, replaced by navy), colourful per feature icon tiles, "Start free", the four principle cards under the hero, the example selector (removed at the owner's request), a Replay button on the race, animated score rings.

## Deliberate differences from the skill
- Dark theme is navy, not the skill's neutral list (owner choice).
- Footer stays light in light mode (owner dislikes a dark footer on a light page).
- Display sizes are smaller than Heading 1 = 60 (owner found the big text heavy).
- Pale violet banners kept, with dark text in dark mode for contrast (owner choice, contrast verified).
