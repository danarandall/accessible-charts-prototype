# Accessible charts prototype — Highcharts + ColorADD

A prototype of accessible bar and donut charts built with [Highcharts](https://www.highcharts.com/) that use the [ColorADD](https://www.coloradd.net/) symbol system so **color is never the only cue**. Built to the [AI A11y Toolkit](https://github.com/danarandall/ai-a11y-toolkit) baseline (WCAG 2.2 AA target).

## What it demonstrates

Every data series is encoded four independent ways:

1. **Color** — a categorical palette where every fill meets 3:1 contrast against the page.
2. **ColorADD symbol** — a triangle, diagonal line, or combination glyph drawn directly on top of each bar and each donut slice.
3. **Direct label** — the value and category name are drawn next to each mark, so a legend is not required to read the chart.
4. **Adjacent data table** — the exact same numbers are available in a `<table>` under a disclosure, with the ColorADD symbol repeated next to each row label.

## Files

```
index.html      Semantic markup, SVG symbol library, chart containers, data tables
styles.css      Design tokens, color palette, focus styles, motion policy
charts.js       Highcharts config + ColorADD glyph renderer overlay
vendor/         Highcharts core, accessibility, pattern-fill, exporting modules (bundled locally)
```

## Run it locally

No build step. Serve the folder over any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just double-click `index.html` — everything is self-contained.

## Accessibility notes

Following the AI A11y Toolkit:

- **Semantic HTML first** — one `h1`, ordered headings, real `figure`/`figcaption`, `table` with `<th scope>`, landmark elements, a skip link, `lang="en"`.
- **Screen reader** — every chart is `role="img"` with `aria-labelledby` and `aria-describedby`. The Highcharts accessibility module adds per-series and per-point announcements.
- **Keyboard** — every chart is reachable via Tab, then arrow keys traverse points. Focus rings are visible at 3:1+ on all interactive elements.
- **Motion** — entrance and update animations are disabled under `prefers-reduced-motion`.
- **Contrast** — text ≥ 4.5:1, chart segments / borders / focus rings ≥ 3:1. Palette tokens live in `:root` in `styles.css` for auditing.
- **No accessibility mode toggle** — the default view is the accessible one.

## What still needs human and screen reader testing

Automated tools find roughly one third of accessibility defects. The following need a person:

- NVDA, JAWS, and VoiceOver announcements for each chart, series, and point.
- Contrast of the ColorADD ink against every underlying series fill (verify ≥ 3:1).
- Real color-vision-deficient user review of the symbol placement and size.
- Content accuracy — data, labels, chart titles.

## About the ColorADD symbols

The glyphs drawn on the charts and in the legend follow the widely documented ColorADD forms ([Wikipedia](https://en.wikipedia.org/wiki/ColorADD), [EIB overview](https://www.eib.org/en/stories/symbols-colour-blind)):

- Blue — upward-right triangle
- Yellow — downward-left triangle
- Red — diagonal line, bottom-left to top-right
- Green = blue + yellow
- Orange = red + yellow
- Purple = red + blue
- Brown = red + green
- Black — filled square
- White — empty square

They are **approximations for prototype purposes**. In production, license the official ColorADD marks from [coloradd.net](https://www.coloradd.net/).

## Credits

- [Highcharts](https://www.highcharts.com/) — charting library. Free for non-commercial use; commercial use requires a license.
- [ColorADD](https://www.coloradd.net/) — color-identification symbol system by Miguel Neiva.
- [AI A11y Toolkit](https://github.com/danarandall/ai-a11y-toolkit) — the WCAG 2.2 AA ruleset this prototype was built against.

## License

MIT — see [LICENSE](./LICENSE).
