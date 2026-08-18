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
    'light-blue': { fill: token('--c-sky'),        glyph: 'blue',   ink: '#14181f' },
    'blue':       { fill: token('--c-azure'),      glyph: 'blue',   ink: '#ffffff' },
    'dark-blue':  { fill: token('--c-midnight'),   glyph: 'blue',   ink: '#ffffff' },
    'orange':     { fill: token('--c-orange'),     glyph: 'orange', ink: '#14181f' },
    'red':        { fill: token('--c-vermillion'), glyph: 'red',    ink: '#ffffff' },
    'violet':     { fill: token('--c-plum'),       glyph: 'violet', ink: '#ffffff' }
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

  // Geometry follows the official ColorADD glyphs documented at
  // https://www.coloradd.net and https://fakoo.de/en/coloradd.html:
  //   Red    = right triangle in the top-left corner
  //            (hypotenuse from top-right down to bottom-left).
  //   Yellow = thick diagonal stripe along that same top-right → bottom-left
  //            axis, centered on the tile.
  //   Blue   = right triangle in the bottom-right corner
  //            (hypotenuse also from top-right down to bottom-left).
  // Secondaries are exactly the union of their two primaries (color addition).
  // Violet is red+blue → both triangles → fills the whole tile except the
  // thin diagonal seam; we mimic that with two adjacent right triangles.
  const glyphs = {
    blue:   [{ type: 'polygon', points: '23,1 23,23 1,23' }],
    red:    [{ type: 'polygon', points: '1,1 23,1 1,23' }],
    yellow: [
      // Thick stripe along the top-right → bottom-left diagonal.
      { type: 'polygon', points: '4,1 23,20 20,23 1,4' }
    ],
    green: [
      // Blue corner triangle + yellow stripe
      { type: 'polygon', points: '23,1 23,23 1,23' },
      { type: 'polygon', points: '4,1 23,20 20,23 1,4' }
    ],
    orange: [
      // Red corner triangle + yellow stripe
      { type: 'polygon', points: '1,1 23,1 1,23' },
      { type: 'polygon', points: '4,1 23,20 20,23 1,4' }
    ],
    violet: [
      // Compound glyph = red + blue triangles filling the whole tile. To keep
      // the compound color reading legible we paint the two triangles in
      // their component colors instead of the series ink, and separate them
      // with a hairline seam of tile fill. Result: top-left red triangle,
      // bottom-right blue triangle, meeting at a visible diagonal.
      { type: 'polygon', points: '1,1 22,1 1,22', fill: '#EB0A0A' },
      { type: 'polygon', points: '23,2 23,23 2,23', fill: '#1F2DF5' }
    ],
    brown: [
      // Red + green = red + (blue + yellow) = all three primaries drawn in
      // their component colors.
      { type: 'polygon', points: '1,1 22,1 1,22', fill: '#EB0A0A' },
      { type: 'polygon', points: '23,2 23,23 2,23', fill: '#1F2DF5' },
      { type: 'polygon', points: '4,1 23,20 20,23 1,4', fill: '#FFD400' }
    ],
    black: [{ type: 'rect', x: 1, y: 1, width: 22, height: 22, fill: true }],
    white: [] // just the outline
  };

  // Build a standalone SVG string for a given glyph, used as a CSS mask.
  // Inside a mask, `currentColor` cannot be resolved (no color context), so we
  // use solid black — the mask reads alpha, then CSS `background-color:
  // currentColor` on the element paints the visible color underneath.
  const outlineRect =
    '<rect x="1" y="1" width="22" height="22" fill="none" stroke="#000" stroke-width="2"/>';

  // Build a fully-colored inline SVG for a glyph. Shapes with an explicit
  // string `fill` (e.g. violet's two component-color triangles) are painted in
  // that color; all other shapes are painted in `ink`. Returned SVG can be
  // used as a CSS `background-image` (full color) rather than a monochrome
  // mask, which is what preserves the compound-color reading on violet/brown.
  function glyphToSvg(key, includeOutline, ink, outlineColor) {
    const parts = [];
    const paint = (s) => (typeof s.fill === 'string' ? s.fill : ink);
    if (includeOutline) {
      parts.push(
        `<rect x="1" y="1" width="22" height="22" fill="none" stroke="${outlineColor || ink}" stroke-width="2"/>`
      );
    }
    (glyphs[key] || []).forEach((shape) => {
      if (shape.type === 'polygon') {
        parts.push(
          `<polygon points="${shape.points}" fill="${paint(shape)}" opacity="${shape.opacity ?? 1}"/>`
        );
      } else if (shape.type === 'line') {
        parts.push(
          `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="${paint(shape)}" stroke-width="${shape.strokeWidth ?? 2}" stroke-linecap="square"/>`
        );
      } else if (shape.type === 'rect' && shape.fill) {
        parts.push(
          `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="${paint(shape)}"/>`
        );
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${parts.join('')}</svg>`;
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
    // Build the glyph primitives inline as SVG children so nothing routes
    // through a data URI (which Highcharts' attribute validator rejects).
    const parts = [];
    (glyphs[key] || []).forEach((shape) => {
      if (shape.type === 'polygon') {
        parts.push(
          '<polygon points="' + shape.points + '" fill="#ffffff" opacity="' +
          (shape.opacity != null ? shape.opacity : 1) + '"/>'
        );
      } else if (shape.type === 'line') {
        parts.push(
          '<line x1="' + shape.x1 + '" y1="' + shape.y1 +
          '" x2="' + shape.x2 + '" y2="' + shape.y2 +
          '" stroke="#ffffff" stroke-width="' +
          (shape.strokeWidth != null ? shape.strokeWidth : 2) +
          '" stroke-linecap="square"/>'
        );
      } else if (shape.type === 'rect' && shape.fill) {
        parts.push(
          '<rect x="' + shape.x + '" y="' + shape.y +
          '" width="' + shape.width + '" height="' + shape.height +
          '" fill="#ffffff"/>'
        );
      }
    });
    return (
      '<span aria-hidden="true" class="la-legend-swatch">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" focusable="false" ' +
          'style="background:' + fill + ';border-radius:3px;">' +
          parts.join('') +
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

  document.querySelectorAll('.swatch[data-symbol]').forEach((el) => {
    const key = el.getAttribute('data-symbol');
    const ink = readInk(el);
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
    // Group everything so we can position/transform once.
    const group = renderer.g().attr({ zIndex: 6 }).add();

    // Background tile: when we are drawing over a colored plot mark (bar top,
    // pie slice) we pass tileFill = null and rely on the mark's own color; the
    // subtle white overlay just softens the glyph's edges. When we are drawing
    // in empty plot area (line chart), we pass the series color so the glyph
    // sits on its own colored tile.
    renderer
      .rect(cx - half, cy - half, size, size, 3)
      .attr({
        fill: tileFill || 'rgba(255,255,255,0.15)',
        stroke: ink,
        'stroke-width': 1.5
      })
      .add(group);

    const scale = size / 24;
    // Convert glyph coords (0-24) to absolute chart coords.
    const px = (u) => cx - half + u * scale;
    const py = (u) => cy - half + u * scale;

    // If a shape declares an explicit fill string (e.g. compound glyphs like
    // violet drawn in their component colors), honor it; otherwise paint in
    // the series ink.
    const paintColor = (shape) =>
      typeof shape.fill === 'string' ? shape.fill : ink;

    (glyphs[key] || []).forEach((shape) => {
      if (shape.type === 'polygon') {
        const pts = shape.points
          .split(/\s+/)
          .map((pair) => {
            const [a, b] = pair.split(',').map(Number);
            return `${px(a)},${py(b)}`;
          })
          .join(' ');
        renderer
          .createElement('polygon')
          .attr({ points: pts, fill: paintColor(shape), opacity: shape.opacity ?? 1 })
          .add(group);
      } else if (shape.type === 'line') {
        renderer
          .createElement('line')
          .attr({
            x1: px(shape.x1),
            y1: py(shape.y1),
            x2: px(shape.x2),
            y2: py(shape.y2),
            stroke: paintColor(shape),
            'stroke-width': (shape.strokeWidth ?? 2) * scale,
            'stroke-linecap': 'square'
          })
          .add(group);
      } else if (shape.type === 'rect' && shape.fill) {
        renderer
          .rect(px(shape.x), py(shape.y), shape.width * scale, shape.height * scale)
          .attr({ fill: paintColor(shape) })
          .add(group);
      }
    });

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

      chart.series.forEach((s) => {
        if (!s.visible) return;
        s.points.forEach((p, i) => {
          const key = opts.keyForPoint(s, p, i);
          if (!key) return;
          const size = opts.sizeForPoint(s, p, i);
          if (size <= 0) return;

          let cx, cy;
          if (s.type === 'column' || s.type === 'bar') {
            if (!p.shapeArgs) return;
            const box = p.shapeArgs;
            cx = box.x + box.width / 2 + chart.plotLeft;
            // Anchor just below the top edge of the bar; if the bar is too
            // short we skip (size 0).
            const inset = Math.min(size * 0.75, box.height * 0.35);
            cy = box.y + inset + chart.plotTop;
          } else if (s.type === 'pie') {
            if (!p.shapeArgs) return;
            const shape = p.shapeArgs;
            const midAngle = (shape.start + shape.end) / 2;
            const r = (shape.innerR + shape.r) / 2;
            cx = shape.x + Math.cos(midAngle) * r;
            cy = shape.y + Math.sin(midAngle) * r;
          } else if (s.type === 'line' || s.type === 'spline' || s.type === 'area') {
            // Line points have plotX / plotY in plot-relative coordinates.
            if (p.plotX == null || p.plotY == null || p.isNull) return;
            cx = p.plotX + chart.plotLeft;
            cy = p.plotY + chart.plotTop;
          } else {
            return;
          }

          const ink = opts.inkForPoint
            ? opts.inkForPoint(s, p, i)
            : opts.ink;
          // For line-family series, give the glyph its own colored tile using
          // the series color; otherwise let it sit transparently over the bar
          // or pie fill.
          const tileFill =
            (s.type === 'line' || s.type === 'spline' || s.type === 'area')
              ? s.color
              : null;
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

        const scale = size / 24;
        const px = (u) => cx - size / 2 + u * scale;
        const py = (u) => cy - size / 2 + u * scale;

        // Build the glyph group and inject it into the per-item parent
        // group directly (not through Highcharts wrapper .add() with a
        // wrapper reference, since parent is a raw DOM node).
        const svgNs = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(svgNs, 'g');
        g.setAttribute('class', 'la-legend-glyph');
        g.setAttribute('pointer-events', 'none');
        parent.appendChild(g);

        const paint = (shape) =>
          typeof shape.fill === 'string' ? shape.fill : ink;

        (glyphs[key] || []).forEach((shape) => {
          if (shape.type === 'polygon') {
            const pts = shape.points
              .split(/\s+/)
              .map((pair) => {
                const [a, b] = pair.split(',').map(Number);
                return `${px(a)},${py(b)}`;
              })
              .join(' ');
            const el = document.createElementNS(svgNs, 'polygon');
            el.setAttribute('points', pts);
            el.setAttribute('fill', paint(shape));
            el.setAttribute('opacity', String(shape.opacity != null ? shape.opacity : 1));
            g.appendChild(el);
          } else if (shape.type === 'line') {
            const el = document.createElementNS(svgNs, 'line');
            el.setAttribute('x1', String(px(shape.x1)));
            el.setAttribute('y1', String(py(shape.y1)));
            el.setAttribute('x2', String(px(shape.x2)));
            el.setAttribute('y2', String(py(shape.y2)));
            el.setAttribute('stroke', paint(shape));
            el.setAttribute(
              'stroke-width',
              String(Math.max(1, (shape.strokeWidth != null ? shape.strokeWidth : 2) * scale))
            );
            el.setAttribute('stroke-linecap', 'square');
            g.appendChild(el);
          } else if (shape.type === 'rect' && shape.fill) {
            const el = document.createElementNS(svgNs, 'rect');
            el.setAttribute('x', String(px(shape.x)));
            el.setAttribute('y', String(py(shape.y)));
            el.setAttribute('width', String(shape.width * scale));
            el.setAttribute('height', String(shape.height * scale));
            el.setAttribute('fill', paint(shape));
            g.appendChild(el);
          }
        });

        // Store the raw DOM node with a destroy() shim so the state array
        // teardown path stays uniform.
        state.marks.push({
          destroy() {
            if (g.parentNode) g.parentNode.removeChild(g);
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
    sizeForPoint: () => 18
  });

  decorateLegendSwatches(barChart);

  // ---------------------------------------------------------------------------
  // DONUT CHART
  // ---------------------------------------------------------------------------
  const donutSeries = [
    { name: 'Farmers market',     tile: 'red',        y: 32 },
    { name: 'Wholesale accounts', tile: 'orange',     y: 22 },
    { name: 'Subscription boxes', tile: 'violet',     y: 18 },
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
    sizeForPoint: () => 24
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
    { name: 'Subscription boxes', tile: 'violet',
      data: [ 88,  92,  95,  99, 103, 108, 112, 117, 121, 126, 130, 135] },
    { name: 'Wholesale',          tile: 'red',
      data: [ 62,  65,  68,  70,  72,  78,  96, 108, 118, 126, 132, 140] }
  ];

  const lineChart = Highcharts.chart('line-chart', {
    chart: { type: 'line', height: 460, spacingBottom: 24, marginRight: 140 },
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
          x: 10,
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
      return i === 0 || i === 4 || i === 8 || i === last ? 20 : 0;
    }
  });

  decorateLegendSwatches(lineChart);
})();
