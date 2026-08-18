/* =============================================================================
   Accessible charts prototype
   -----------------------------------------------------------------------------
   Highcharts (core + accessibility + pattern-fill + exporting) driven from
   design tokens in styles.css. Every series carries a ColorADD symbol so
   color is never the only cue. Every chart has role="img", an accessible
   name via aria-labelledby, a short takeaway via aria-describedby, and a
   paired data table. Motion honors prefers-reduced-motion.
   ============================================================================ */

(function () {
  'use strict';

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();

  // Every entry maps a chart-fill hex to the correct ColorADD glyph key and
  // the ink color that keeps the glyph visible on that fill (≥ 4.5:1).
  const palette = {
    'light-blue': { fill: token('--c-sky'),        glyph: 'light-blue', ink: '#14181f' },
    'blue':       { fill: token('--c-azure'),      glyph: 'blue',       ink: '#ffffff' },
    'dark-blue':  { fill: token('--c-midnight'),   glyph: 'dark-blue',  ink: '#ffffff' },
    'orange':     { fill: token('--c-orange'),     glyph: 'orange', ink: '#14181f' },
    'red':        { fill: token('--c-vermillion'), glyph: 'red',    ink: '#ffffff' },
    'purple':     { fill: token('--c-plum'),       glyph: 'purple', ink: '#ffffff' }
  };

  // ---------------------------------------------------------------------------
  // ColorADD glyph library
  //
  // Each entry returns an array of primitive shapes to draw on a 24x24 grid.
  // We use this both for CSS masks (legend swatches, data-table inline marks)
  // and for direct Highcharts SVGRenderer drawing (bar tops, donut slices).
  // The "outline" flag on the border rect is separated so it can be omitted
  // on chart overlays where a border would fight the bar edge.
  // ---------------------------------------------------------------------------

  // Geometry is imported verbatim from the ColorADD System Figma file:
  //   https://www.figma.com/design/AOKiwyj3cjePY1iap8R7kw/ColorADD-System
  // Each glyph is one or more SVG paths in its own native viewBox. At draw
  // time the paths are placed centered inside the target tile with a small
  // padding so the shape sits comfortably. Every path is painted in the
  // single ink color of the tile (per official spec — no per-shape colors).
  //
  //   blue   = rounded diagonal shape whose right angle sits bottom-right,
  //            hypotenuse faces upper-left
  //   red    = mirror of blue: right angle sits top-left, hypotenuse faces
  //            lower-right
  //   yellow = rounded diagonal capsule bar, top-right → bottom-left
  //   orange = yellow bar + red shape
  //   purple = blue shape + red shape
  //   green  = yellow bar + blue shape
  const glyphs = {
    // Primary blue and red are wrapped in a larger padded viewBox so they
    // render at roughly half the visual size of the composite shapes on the
    // same tile — matching the ColorADD spec where primaries are smaller
    // than their compounds. Paths are the Figma exports (viewBox origin at
    // 0,0, extent ~55×54). We pad to a ~105×105 canvas so the shape occupies
    // roughly half the tile width.
    blue: {
      viewBox: '-25 -25 105 105',
      paths: [
        'M54.6927 43.0445C54.6528 49.1348 49.6833 54.0396 43.593 53.9997L10.9771 53.7861C1.09539 53.7213 -3.71979 41.6927 3.38764 34.827L36.2126 3.11872C43.2378 -3.66748 54.9658 1.35511 54.9018 11.1225L54.6927 43.0445Z'
      ]
    },
    red: {
      viewBox: '-25 -25 105 105',
      paths: [
        'M2.54394e-05 11.0277C2.86631e-05 4.93728 4.9373 5.36865e-06 11.0277 1.50325e-05L43.6442 5.75229e-05C53.5261 6.88445e-05 58.4199 11.9969 51.3577 18.9089L18.7412 50.8314C11.7606 57.6635 1.22522e-07 52.7178 6.85494e-06 42.9503L2.54394e-05 11.0277Z'
      ]
    },
    yellow: {
      viewBox: '0 0 91 91',
      paths: [
        'M74.7046 2.79587C78.4324 -0.931937 84.4763 -0.931938 88.2041 2.79587C91.9319 6.52367 91.9319 12.5676 88.2041 16.2954L16.2954 88.2041C12.5676 91.932 6.52366 91.932 2.79585 88.2041C-0.931951 84.4763 -0.931951 78.4324 2.79585 74.7046L74.7046 2.79587Z'
      ]
    },
    orange: {
      viewBox: '0 0 95 94',
      paths: [
        'M78.4097 5.66181C82.1431 1.92834 88.1963 1.92834 91.9298 5.66181C95.6632 9.39528 95.6632 15.4484 91.9298 19.1819L19.9118 91.1999C16.1783 94.9334 10.1251 94.9334 6.39167 91.1999C2.6582 87.4664 2.6582 81.4133 6.39167 77.6798L78.4097 5.66181Z',
        'M2.55362e-05 11.0697C2.87721e-05 4.95606 4.95609 5.38908e-06 11.0697 1.50897e-05L43.8102 5.77418e-05C53.7297 6.91064e-05 58.6422 12.0425 51.553 18.9808L18.8124 51.0248C11.8053 57.8828 1.22988e-07 52.9184 6.88102e-06 43.1137L2.55362e-05 11.0697Z'
      ]
    },
    purple: {
      viewBox: '0 0 97 57',
      paths: [
        'M96.7899 45.6183C96.7499 51.7303 91.7627 56.6526 85.6507 56.6125L52.9189 56.3981C43.002 56.3331 38.1697 44.2617 45.3024 37.3717L78.2441 5.55064C85.2943 -1.25969 97.0639 3.78076 96.9997 13.5829L96.7899 45.6183Z',
        'M2.55299e-05 11.0669C2.87651e-05 4.95484 4.95487 5.38776e-06 11.067 1.5086e-05L43.7995 5.77276e-05C53.7166 6.90894e-05 58.6278 12.0396 51.5404 18.9762L18.8078 51.0123C11.8024 57.8686 1.22958e-07 52.9054 6.87933e-06 43.1031L2.55299e-05 11.0669Z'
      ]
    },
    green: {
      viewBox: '0 0 93 96',
      paths: [
        'M92.7908 84.6404C92.751 90.7256 87.7856 95.6263 81.7004 95.5864L49.112 95.3729C39.2386 95.3082 34.4275 83.2897 41.529 76.4299L74.3263 44.7483C81.3456 37.9678 93.0637 42.9861 92.9997 52.7453L92.7908 84.6404Z',
        'M74.472 2.78716C78.1882 -0.929036 84.2133 -0.929037 87.9295 2.78716C91.6457 6.50336 91.6457 12.5285 87.9295 16.2447L16.2447 87.9295C12.5685 91.6457 6.50335 91.6457 2.78715 87.9295C-0.929049 84.2133 -0.929049 78.1882 2.78715 74.472L74.472 2.78716Z'
      ]
    },
    // Light shade: blue wedge inside an outlined bounding box. The box is
    // the official ColorADD light-shade indicator.
    'light-blue': {
      viewBox: '0 0 118 118',
      shapes: [
        { kind: 'rect', x: 4.5, y: 4.5, w: 109, h: 109, rx: 23.5, strokeWidth: 9, stroke: true, fill: false },
        { kind: 'path', d: 'M80.5652 73.3672C80.5362 77.7854 76.9311 81.3436 72.5129 81.3147L40.6108 81.1057C33.4422 81.0587 29.9491 72.3326 35.1051 67.352L67.2117 36.3376C72.3081 31.4146 80.8161 35.0582 80.7697 42.1439L80.5652 73.3672Z' }
      ]
    },
    // Dark shade: blue wedge cut out of a filled rounded rect (even-odd).
    'dark-blue': {
      viewBox: '0 0 118 118',
      shapes: [
        { kind: 'path', d: 'M90 0C105.464 0 118 12.536 118 28V90C118 105.464 105.464 118 90 118H28C12.536 118 0 105.464 0 90V28C0 12.536 12.536 0 28 0H90ZM80.7695 42.1436C80.8157 35.0581 72.3082 31.415 67.2119 36.3379L35.1055 67.3516C29.9495 72.3321 33.442 81.0581 40.6104 81.1055L72.5127 81.3145C76.9309 81.3434 80.5365 77.7854 80.5654 73.3672L80.7695 42.1436Z', fillRule: 'evenodd' }
      ]
    }
  };

  // Normalize any glyph entry to a single `shapes` array of primitives. This
  // lets primaries (paths) and light/dark variants (rect+path with even-odd)
  // share the same rendering code paths.
  function glyphShapes(key) {
    const g = glyphs[key];
    if (!g) return null;
    if (g.shapes) return { viewBox: g.viewBox, shapes: g.shapes };
    return {
      viewBox: g.viewBox,
      shapes: (g.paths || []).map((d) => ({ kind: 'path', d: d }))
    };
  }

  // Serialize one shape primitive to an SVG string, painted in ink. `strokeInk`
  // defaults to `ink` for shapes that stroke.
  function shapeToSvgString(s, ink) {
    if (s.kind === 'rect') {
      const stroke = s.stroke ? ink : 'none';
      const fill = s.fill ? ink : 'none';
      const rx = s.rx != null ? ` rx="${s.rx}"` : '';
      const sw = s.strokeWidth != null ? ` stroke-width="${s.strokeWidth}"` : '';
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${rx} fill="${fill}" stroke="${stroke}"${sw}/>`;
    }
    const fr = s.fillRule ? ` fill-rule="${s.fillRule}"` : '';
    return `<path d="${s.d}" fill="${ink}"${fr}/>`;
  }

  // Serialize one shape into a DOM SVGElement (for injection into a live SVG).
  function shapeToSvgElement(s, ink, svgNs) {
    if (s.kind === 'rect') {
      const el = document.createElementNS(svgNs, 'rect');
      el.setAttribute('x', String(s.x));
      el.setAttribute('y', String(s.y));
      el.setAttribute('width', String(s.w));
      el.setAttribute('height', String(s.h));
      if (s.rx != null) el.setAttribute('rx', String(s.rx));
      el.setAttribute('fill', s.fill ? ink : 'none');
      el.setAttribute('stroke', s.stroke ? ink : 'none');
      if (s.strokeWidth != null) el.setAttribute('stroke-width', String(s.strokeWidth));
      return el;
    }
    const el = document.createElementNS(svgNs, 'path');
    el.setAttribute('d', s.d);
    el.setAttribute('fill', ink);
    if (s.fillRule) el.setAttribute('fill-rule', s.fillRule);
    return el;
  }

  // Build a fully-colored inline SVG for a given glyph key. Painted in `ink`.
  // The `includeOutline` and `outlineColor` args are kept for API stability
  // with earlier renderers but currently ignored — the official ColorADD
  // primaries have no bounding box on their own; the light-shade glyphs
  // include the box natively in their shapes array.
  function glyphToSvg(key /*, includeOutline, ink, outlineColor */) {
    const args = arguments;
    const ink = args[2] || '#000000';
    const g = glyphShapes(key);
    if (!g) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>`;
    const body = g.shapes.map((s) => shapeToSvgString(s, ink)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}">${body}</svg>`;
  }

  // Convert an SVG string into a CSS `url()` value suitable for background-image.
  function svgBgUrl(svgString) {
    return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svgString) + '")';
  }

  // ---------------------------------------------------------------------------
  // Build an HTML swatch for a Highcharts legend item: a colored tile with the
  // ColorADD glyph inked in white on top. Returned as an inline block so it
  // sits next to the legend label. This makes the legend key carry the same
  // second cue (symbol) as the marks in the chart itself.
  // ---------------------------------------------------------------------------
  function legendSwatchHtml(key, fill) {
    const g = glyphShapes(key);
    if (!g) return '';
    const body = g.shapes.map((s) => shapeToSvgString(s, '#ffffff')).join('');
    return (
      '<span aria-hidden="true" class="la-legend-swatch">' +
        '<svg viewBox="' + g.viewBox + '" width="18" height="18" ' +
          'preserveAspectRatio="xMidYMid meet" focusable="false" ' +
          'style="background:' + fill + ';border-radius:3px;padding:2px;">' +
          body +
        '</svg>' +
      '</span>'
    );
  }

  // ---------------------------------------------------------------------------
  // Populate legend swatches: --mask sets the ::after mask that overlays the
  // ColorADD glyph on top of the color fill. Ink color comes from CSS.
  // ---------------------------------------------------------------------------
  // Read the resolved ink color from a computed CSS custom property. For
  // legend swatches the ink is exposed via `color` (declared in styles.css
  // per class), so we can pick it up with getComputedStyle.
  const readInk = (el) => getComputedStyle(el).color || '#ffffff';

  // Key section swatches render the glyph in monochrome (black or white —
  // whichever has more contrast against the tile). This reinforces the
  // ColorADD principle: the shape is the identifier, not the color. The ink
  // is not tied to the palette's series ink; it's picked purely for legibility.
  const rgbLuma = (rgb) => {
    const m = rgb.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const [r, g, b] = m[1].split(',').map((v) => parseFloat(v) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  document.querySelectorAll('.swatch[data-symbol]').forEach((el) => {
    const key = el.getAttribute('data-symbol');
    const bg = getComputedStyle(el).backgroundColor;
    const ink = rgbLuma(bg) > 0.4 ? '#000000' : '#ffffff';
    const svg = glyphToSvg(key, true, ink, ink);
    el.style.setProperty('--glyph', svgBgUrl(svg));
  });

  // ---------------------------------------------------------------------------
  // Populate inline table row-header marks. Smaller, no outline (row already
  // has visual weight from the text label).
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.ca-inline[data-symbol]').forEach((el) => {
    const key = el.getAttribute('data-symbol');
    const ink = getComputedStyle(el).getPropertyValue('--tile-ink').trim() || '#ffffff';
    const svg = glyphToSvg(key, false, ink, ink);
    el.style.setProperty('--glyph', svgBgUrl(svg));
    el.innerHTML = '';
  });

  // ---------------------------------------------------------------------------
  // Helper: draw a ColorADD glyph directly on top of a Highcharts point using
  // the built-in SVGRenderer. We render primitives one-by-one into a <g>
  // group so we control fill/stroke explicitly (no reliance on currentColor).
  // ---------------------------------------------------------------------------
  function drawColorAddGlyph(chart, cx, cy, size, key, ink, tileFill) {
    const renderer = chart.renderer;
    const half = size / 2;
    const group = renderer.g().attr({ zIndex: 6 }).add();

    // Background tile: for bar tops and pie slices, tileFill is null and we
    // draw the glyph directly on the mark's own color — no bounding box. On
    // the line chart we pass the series color so the glyph sits on a colored
    // tile with no outline (the tile itself acts as the marker).
    if (tileFill) {
      renderer
        .rect(cx - half, cy - half, size, size, 4)
        .attr({ fill: tileFill, stroke: 'none' })
        .add(group);
    }

    const g = glyphShapes(key);
    if (g) {
      const svgNs = 'http://www.w3.org/2000/svg';
      const pad = size * 0.12;
      const inner = document.createElementNS(svgNs, 'svg');
      inner.setAttribute('x', String(cx - half + pad));
      inner.setAttribute('y', String(cy - half + pad));
      inner.setAttribute('width', String(size - pad * 2));
      inner.setAttribute('height', String(size - pad * 2));
      inner.setAttribute('viewBox', g.viewBox);
      inner.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      g.shapes.forEach((s) => inner.appendChild(shapeToSvgElement(s, ink, svgNs)));
      group.element.appendChild(inner);
    }

    // Decorative, per WAI-ARIA in SVG guidance for chart overlays.
    group.element.setAttribute('aria-hidden', 'true');
    group.element.setAttribute('focusable', 'false');
    return group;
  }

  // Render marks after every chart render. Also cleans up marks from the
  // previous render pass, so the chart survives resizes and updates.
  function attachColorAddOverlay(chart, opts) {
    const state = { marks: [] };

    const paint = () => {
      state.marks.forEach((m) => m.destroy());
      state.marks = [];

      // Track placed line-chart glyph tiles per index (week) so we can
      // vertically nudge later series whose y overlaps an earlier one.
      const placed = new Map(); // pointIndex -> [{cx, cy, size}]

      chart.series.forEach((s) => {
        if (!s.visible) return;
        s.points.forEach((p, i) => {
          const key = opts.keyForPoint(s, p, i);
          if (!key) return;
          const size = opts.sizeForPoint(s, p, i);
          if (size <= 0) return;

          let cx, cy;
          const isLineFamily = s.type === 'line' || s.type === 'spline' || s.type === 'area';
          if (s.type === 'column' || s.type === 'bar') {
            if (!p.shapeArgs) return;
            const box = p.shapeArgs;
            cx = box.x + box.width / 2 + chart.plotLeft;
            const inset = Math.min(size * 0.75, box.height * 0.35);
            cy = box.y + inset + chart.plotTop;
          } else if (s.type === 'pie') {
            if (!p.shapeArgs) return;
            const shape = p.shapeArgs;
            const midAngle = (shape.start + shape.end) / 2;
            const r = (shape.innerR + shape.r) / 2;
            cx = shape.x + Math.cos(midAngle) * r;
            cy = shape.y + Math.sin(midAngle) * r;
          } else if (isLineFamily) {
            if (p.plotX == null || p.plotY == null || p.isNull) return;
            cx = p.plotX + chart.plotLeft;
            cy = p.plotY + chart.plotTop;

            // Collision avoidance: if another line-family glyph was already
            // placed at the same x-index within one glyph-height, nudge this
            // one up or down until it clears.
            const nudge = size + 4;
            const bucket = placed.get(i) || [];
            const baseCy = cy;
            // Try offsets: 0, -nudge, +nudge, -2*nudge, +2*nudge, -3*nudge.
            const offsets = [0, -nudge, nudge, -2 * nudge, 2 * nudge, -3 * nudge];
            for (const off of offsets) {
              const candidate = baseCy + off;
              const conflict = bucket.find(
                (m) => Math.abs(m.cx - cx) < size && Math.abs(m.cy - candidate) < size
              );
              if (!conflict) {
                cy = candidate;
                break;
              }
            }
            bucket.push({ cx, cy, size });
            placed.set(i, bucket);
          } else {
            return;
          }

          const ink = opts.inkForPoint
            ? opts.inkForPoint(s, p, i)
            : opts.ink;
          const tileFill = isLineFamily ? s.color : null;
          const mark = drawColorAddGlyph(chart, cx, cy, size, key, ink, tileFill);
          state.marks.push(mark);
        });
      });
    };

    Highcharts.addEvent(chart, 'render', paint);
    // Also run once now, in case 'render' already fired.
    paint();
  }

  // ---------------------------------------------------------------------------
  // Draw a ColorADD glyph on top of each Highcharts legend swatch. Runs on
  // every 'render' so it survives resizes, visibility toggles, and updates.
  // The primitives are appended to the legend group inside the chart's own
  // SVG root, which means no HTML sanitizer, no data URIs, no font issues.
  // ---------------------------------------------------------------------------
  function decorateLegendSwatches(chart) {
    const state = { marks: [] };

    const paint = () => {
      state.marks.forEach((m) => m.destroy());
      state.marks = [];

      if (!chart.legend || !chart.legend.group) return;

      chart.series.forEach((s) => {
        const key = s.userOptions && s.userOptions.key;
        if (!key) return;
        // Per-series ink (falls back to white). Set by the series definition.
        const ink = (s.userOptions && s.userOptions.colorAddInk) || '#ffffff';

        // Highcharts v11+ exposes the symbol here; earlier versions used
        // `s.legendSymbol`. Support both.
        const li = s.legendItem || {};
        const symbol = li.symbol || s.legendSymbol;
        if (!symbol || !symbol.element) return;

        // Read the symbol's own x/y/width/height attributes. These are
        // expressed in the coordinate space of the symbol's parent group
        // (which is the per-legend-item <g> that Highcharts has already
        // translated into position). Appending our glyph to that same
        // parent means it inherits the correct transform for free.
        const el = symbol.element;
        const parent = el.parentNode; // per-item <g class="highcharts-legend-item">
        if (!parent) return;
        const sx = parseFloat(el.getAttribute('x')) || 0;
        const sy = parseFloat(el.getAttribute('y')) || 0;
        const sw = parseFloat(el.getAttribute('width')) || 0;
        const sh = parseFloat(el.getAttribute('height')) || 0;
        const size = Math.min(sw, sh);
        if (size <= 0) return;
        const cx = sx + sw / 2;
        const cy = sy + sh / 2;

        const glyph = glyphShapes(key);
        if (!glyph) return;

        // Build a nested <svg> holding the glyph paths in their own native
        // viewBox; inject into the per-item parent group so it inherits the
        // legend's transform.
        const svgNs = 'http://www.w3.org/2000/svg';
        const pad = size * 0.14;
        const inner = document.createElementNS(svgNs, 'svg');
        inner.setAttribute('class', 'la-legend-glyph');
        inner.setAttribute('pointer-events', 'none');
        inner.setAttribute('x', String(cx - size / 2 + pad));
        inner.setAttribute('y', String(cy - size / 2 + pad));
        inner.setAttribute('width', String(size - pad * 2));
        inner.setAttribute('height', String(size - pad * 2));
        inner.setAttribute('viewBox', glyph.viewBox);
        inner.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        glyph.shapes.forEach((s) => inner.appendChild(shapeToSvgElement(s, ink, svgNs)));
        parent.appendChild(inner);

        state.marks.push({
          destroy() {
            if (inner.parentNode) inner.parentNode.removeChild(inner);
          }
        });
      });
    };

    Highcharts.addEvent(chart, 'render', paint);
    // First paint (in case the render event already fired).
    paint();
  }

  // ---------------------------------------------------------------------------
  // Highcharts defaults
  // ---------------------------------------------------------------------------
  Highcharts.setOptions({
    lang: {
      accessibility: {
        chartContainerLabel: 'Interactive chart. Use arrow keys to explore data points.'
      }
    },
    chart: {
      style: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
      },
      backgroundColor: 'transparent',
      animation: prefersReducedMotion ? false : { duration: 250 }
    },
    plotOptions: {
      series: {
        animation: prefersReducedMotion ? false : { duration: 300 }
      }
    },
    credits: { enabled: false },
    accessibility: {
      enabled: true,
      keyboardNavigation: { enabled: true }
    }
  });

  // ---------------------------------------------------------------------------
  // BAR CHART
  // ---------------------------------------------------------------------------
  // Each series records the palette tile it wants; the chart config below
  // pulls the fill and glyph key from that entry, so a new tile can be added
  // to `palette` and used without touching any downstream code.
  const barSeriesDefs = [
    { name: 'Sourdough loaves',   tile: 'blue',       data: [ 98, 112, 129, 142] },
    { name: 'Pastries',           tile: 'orange',     data: [ 62,  68,  74,  81] },
    { name: 'Subscription boxes', tile: 'light-blue', data: [ 41,  46,  52,  58] },
    { name: 'Wholesale',          tile: 'red',        data: [ 30,  34,  41,  47] }
  ];

  const barChart = Highcharts.chart('bar-chart', {
    chart: { type: 'column', height: 460, spacingBottom: 24 },
    title: { text: null },
    xAxis: {
      categories: ['Q1', 'Q2', 'Q3', 'Q4'],
      title: { text: 'Quarter', style: { color: token('--text') } },
      labels: { style: { color: token('--text'), fontSize: '14px' } },
      lineColor: token('--border'),
      tickColor: token('--border')
    },
    yAxis: {
      title: { text: 'Revenue ($ thousands)', style: { color: token('--text') } },
      labels: {
        style: { color: token('--text'), fontSize: '14px' },
        formatter: function () { return '$' + Highcharts.numberFormat(this.value, 0, '.', ','); }
      },
      gridLineColor: token('--border-soft')
    },
    legend: {
      enabled: true,
      itemStyle: { color: token('--text'), fontWeight: '600', fontSize: '14px' },
      itemHoverStyle: { color: token('--focus') },
      itemMarginTop: 6,
      itemMarginBottom: 6,
      // Highcharts draws its native symbol (a square) in the series color; the
      // ColorADD glyph is layered on top later by decorateLegendSwatches() so
      // the legend key carries the same second cue (symbol) as each bar.
      squareSymbol: true,
      symbolHeight: 16,
      symbolWidth: 16,
      symbolRadius: 3
    },
    tooltip: {
      shared: false,
      backgroundColor: '#ffffff',
      borderColor: token('--border'),
      style: { color: token('--text'), fontSize: '14px' },
      formatter: function () {
        return `<strong>${this.series.name}</strong><br/>${this.x}: <strong>$${Highcharts.numberFormat(this.y, 0, '.', ',')}k</strong>`;
      }
    },
    plotOptions: {
      column: {
        borderRadius: 4,
        borderColor: token('--text'),
        borderWidth: 1,
        groupPadding: 0.14,
        pointPadding: 0.05,
        dataLabels: {
          enabled: true,
          formatter: function () { return '$' + this.y; },
          y: -4,
          style: {
            color: token('--text'),
            fontWeight: '600',
            fontSize: '12px',
            textOutline: '2px #ffffff'
          }
        }
      }
    },
    series: barSeriesDefs.map((s) => {
      const p = palette[s.tile];
      return {
        type: 'column',
        name: s.name,
        key: p.glyph,
        colorAddInk: p.ink,
        color: p.fill,
        data: s.data,
        accessibility: {
          description: `${s.name}. Values in dollars thousands across quarters one through four.`
        }
      };
    }),
    accessibility: {
      description:
        'Grouped column chart. Four bakery product lines compared across Q1 through Q4 2026. ' +
        'Sourdough loaves lead every quarter, growing from $98k to $142k.',
      point: {
        valueDescriptionFormat: '{index}. {xDescription}, {series.name}: ${value} thousand.'
      }
    }
  });

  attachColorAddOverlay(barChart, {
    keyForPoint: (series) => series.userOptions.key,
    inkForPoint: (series) => series.userOptions.colorAddInk,
    sizeForPoint: () => 26
  });

  decorateLegendSwatches(barChart);

  // ---------------------------------------------------------------------------
  // DONUT CHART
  // ---------------------------------------------------------------------------
  const donutSeries = [
    { name: 'Farmers market',     tile: 'red',        y: 32 },
    { name: 'Wholesale accounts', tile: 'orange',     y: 22 },
    { name: 'Subscription boxes', tile: 'purple',     y: 18 },
    { name: 'Pop-ups',            tile: 'light-blue', y: 16 },
    { name: 'Online store',       tile: 'blue',       y: 12 }
  ];

  const donutChart = Highcharts.chart('donut-chart', {
    chart: { type: 'pie', height: 480, spacingBottom: 24 },
    title: { text: null },
    tooltip: {
      backgroundColor: '#ffffff',
      borderColor: token('--border'),
      style: { color: token('--text'), fontSize: '14px' },
      pointFormat: '<b>{point.percentage:.0f}%</b> of budget'
    },
    plotOptions: {
      pie: {
        innerSize: '58%',
        borderColor: '#ffffff',
        borderWidth: 3,
        dataLabels: {
          enabled: true,
          distance: 22,
          connectorColor: token('--text'),
          connectorWidth: 1.5,
          style: {
            color: token('--text'),
            fontSize: '14px',
            fontWeight: '600',
            textOutline: 'none'
          },
          formatter: function () {
            return `${this.point.name}: ${Highcharts.numberFormat(this.percentage, 0)}%`;
          }
        }
      }
    },
    series: [{
      type: 'pie',
      name: 'Budget share',
      data: donutSeries.map((d) => {
        const p = palette[d.tile];
        return {
          name: d.name,
          y: d.y,
          color: p.fill,
          key: p.glyph,
          colorAddInk: p.ink,
          accessibility: { description: `${d.name}, ${d.y} percent of 2026 bakery revenue.` }
        };
      })
    }],
    accessibility: {
      description:
        'Donut chart of 2026 bakery revenue mix. Five channels total 100 percent. ' +
        'Farmers market is the largest slice at 32 percent, followed by wholesale accounts, subscription boxes, pop-ups, and the online store.',
      point: {
        valueDescriptionFormat: '{point.name}: {point.percentage:.0f} percent.'
      }
    }
  });

  attachColorAddOverlay(donutChart, {
    keyForPoint: (series, point) => point.options.key,
    inkForPoint: (series, point) => point.options.colorAddInk,
    sizeForPoint: () => 34
  });

  // ---------------------------------------------------------------------------
  // LINE CHART
  // ---------------------------------------------------------------------------
  const weeks = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12'];
  const lineSeriesDefs = [
    { name: 'Sourdough loaves',   tile: 'blue',
      data: [210, 224, 232, 241, 248, 256, 262, 270, 278, 285, 294, 302] },
    { name: 'Pastries',           tile: 'orange',
      data: [168, 174, 182, 179, 186, 190, 196, 202, 207, 211, 216, 222] },
    { name: 'Subscription boxes', tile: 'purple',
      data: [ 88,  92,  95,  99, 103, 108, 112, 117, 121, 126, 130, 135] },
    { name: 'Wholesale',          tile: 'red',
      data: [ 62,  65,  68,  70,  72,  78,  96, 108, 118, 126, 132, 140] }
  ];

  const lineChart = Highcharts.chart('line-chart', {
    chart: { type: 'line', height: 460, spacingBottom: 24, marginRight: 220 },
    title: { text: null },
    xAxis: {
      categories: weeks,
      title: { text: 'Week', style: { color: token('--text') } },
      labels: { style: { color: token('--text'), fontSize: '14px' } },
      lineColor: token('--border'),
      tickColor: token('--border')
    },
    yAxis: {
      title: { text: 'Units sold per week', style: { color: token('--text') } },
      labels: {
        style: { color: token('--text'), fontSize: '14px' },
        formatter: function () { return Highcharts.numberFormat(this.value, 0, '.', ','); }
      },
      gridLineColor: token('--border-soft')
    },
    legend: {
      enabled: true,
      itemStyle: { color: token('--text'), fontWeight: '600', fontSize: '14px' },
      itemHoverStyle: { color: token('--focus') },
      itemMarginTop: 6,
      itemMarginBottom: 6,
      squareSymbol: true,
      symbolHeight: 16,
      symbolWidth: 16,
      symbolRadius: 3
    },
    tooltip: {
      shared: true,
      backgroundColor: '#ffffff',
      borderColor: token('--border'),
      style: { color: token('--text'), fontSize: '14px' },
      formatter: function () {
        const rows = this.points
          .map((p) => `<div><strong>${p.series.name}</strong>: ${Highcharts.numberFormat(p.y, 0, '.', ',')}</div>`)
          .join('');
        return `<div><strong>${this.x}</strong></div>${rows}`;
      }
    },
    plotOptions: {
      line: {
        lineWidth: 3,
        marker: {
          // Suppress default circle markers on interior points; the ColorADD
          // overlay draws a labelled glyph tile at a handful of anchor points
          // (see sizeForPoint below), which is stronger than dashed strokes
          // for non-color-based series identification.
          enabled: false,
          radius: 4,
          lineWidth: 2,
          lineColor: '#ffffff',
          symbol: 'circle',
          states: {
            hover: { enabled: true, radius: 7 }
          }
        },
        dataLabels: {
          enabled: true,
          // Label only the last point of each series so the chart stays
          // scannable but every line has a direct endpoint label.
          formatter: function () {
            if (this.point.index !== this.series.points.length - 1) return null;
            return this.series.name;
          },
          align: 'left',
          verticalAlign: 'middle',
          x: 40,
          allowOverlap: false,
          style: {
            color: token('--text'),
            fontWeight: '600',
            fontSize: '12px',
            textOutline: '2px #ffffff'
          }
        }
      }
    },
    series: lineSeriesDefs.map((s) => {
      const p = palette[s.tile];
      return {
        type: 'line',
        name: s.name,
        key: p.glyph,
        colorAddInk: p.ink,
        color: p.fill,
        data: s.data,
        marker: { fillColor: p.fill },
        accessibility: {
          description: `${s.name} weekly units across weeks 1 through 12.`
        }
      };
    }),
    accessibility: {
      description:
        'Line chart with 12 weeks on the x-axis and units sold on the y-axis. ' +
        'Four series: sourdough loaves, pastries, subscription boxes, and wholesale. ' +
        'Sourdough loaves grows from 210 to 302; wholesale jumps from 78 in week 6 to 140 by week 12.',
      point: {
        valueDescriptionFormat: '{index}. {xDescription}, {series.name}: {value} units.'
      }
    }
  });

  attachColorAddOverlay(lineChart, {
    keyForPoint: (series) => series.userOptions.key,
    inkForPoint: (series) => series.userOptions.colorAddInk,
    // Only anchor a glyph at four evenly-spaced points per line: weeks 1, 5,
    // 9, and 12. Twelve tiles per line would crowd the chart; four gives every
    // line a distinct symbol cue at both endpoints and along its length.
    sizeForPoint: (series, point, i) => {
      const last = series.points.length - 1;
      return i === 0 || i === 4 || i === 8 || i === last ? 36 : 0;
    }
  });

  decorateLegendSwatches(lineChart);
})();
