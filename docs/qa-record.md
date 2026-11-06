# QA record: redesign sign off (2026-11-06)

Method: automated browser runs against a local copy with demo data, plus a live smoke test. Evidence is in the numbers. "Not tested" means exactly that.

| Check | Result | Evidence |
|---|---|---|
| Layout, no horizontal overflow | PASS | 14 screens at 1440, 1280, 768, 390, 360 and 320 wide: 84 checks, 0 overflowing |
| Text contrast (4.5:1 small, 3:1 large) | PASS | 2,816 text elements in light and dark across 16 screens: 0 below the minimum after fixes (58 found and fixed: sidebar labels, avatar initials, scoring banner small text). Excluded by design: the tagline words while still muted, the gradient hero heading (5.7:1 light, 6.4:1 dark by calculation), hidden states |
| One typeface, sizes on the scale | PASS | Geist and Geist Mono only; sizes 12, 14, 16, 18, 20, 24, 30, 36, 48, 60 |
| Weights 400, 500, 600; no italics | PASS | 1,305 text elements: weights 400 / 500 / 600 only, 0 italic (after fixing default bold and italic) |
| Gradients | PASS | Only the logo mark and the hero heading text |
| No hyphens in visible copy | PASS | 0 hyphenated words across 16 screens ("mid-week" fixed) |
| Spacing tokens | PASS with notes | Remaining off token values are the visually hidden text trick (-1px), computed auto margins, and nothing else. Inline markup spacings snapped (16) |
| Corner radii | PASS | All from the Tailwind set (phone ripple ring snapped to 24) |
| Shadows only on floating things | PASS | Toast, Ask Cairn panel, save bar |
| Keyboard focus | PASS | 59 of 59 tab stops on Home show a visible ring; the app's first stop is the skip link |
| Reduced motion | PASS | 0 endless animations running; tagline words at full strength 22 of 22 |
| Links | PASS | 22 links on Home, 0 dead or empty. Unknown addresses return a branded 404 (server and in-app) |
| Forms | PASS | Empty and invalid sign up blocked; short password and bad email rejected; wrong password and mismatched reset show inline messages; show password button reports its state |
| Console and script errors | PASS | None on Home or on 13 app routes. The one console error is a 400 on Integrations in a local copy only (viaSocket keys are set on the live server) |
| Images | PASS | No images without alt text (the app uses none in markup; avatars are decorative) |
| Structure | PASS | Home: header, nav, main, footer, one h1; lang, title, description, canonical and 9 sharing tags. App: skip link, nav, main, current page marked |
| Touch targets (44px) | PASS | No control under 44px at phone width apart from inline text links and the hidden skip link (both exempt) |
| Cleanup of unused CSS | PASS | 8.6 KB of dead rules removed; 40 before and after screenshots identical under the same capture script (0 differing pixels) |
| Fabricated content | PASS | No testimonials, logos, prices, customer counts or guarantees. Example names are fictional |
| Screen readers | NOT TESTED | Markup has labels and live regions, but no screen reader was used |
| Real phones and Safari / Firefox | NOT TESTED | Chromium only, emulated widths |
| Signed in version of the Home nav | NOT TESTED | Code path exists ("Open my week"), not exercised |
| Sharing previews (Slack, LinkedIn) | NOT TESTED | Only a real post shows them |
| Ask Cairn with live answers after the redesign | NOT TESTED | Panel layout checked, answers not re-run |
| Keka sync and a real Slack and M91 connection | NOT TESTED | Need a real connection |
| Colour blindness simulation, 400% zoom | NOT TESTED | 320px reflow was tested instead |
