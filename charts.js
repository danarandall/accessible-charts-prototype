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

  const palette = {
    blue:   token('--c-blue'),
    yellow: token('--c-yellow'),
    red:    token('--c-red'),
    green:  token('--c-green'),
    orange: token('--c-orange'),
    purple: token('--c-purple'),
    brown:  token('--c-brown')
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

  const glyphs = {
    blue:   [{ type: 'polygon', points: '23,1 23,23 1,23' }],
    yellow: [{ type: 'polygon', points: '1,1 23,1 1,23' }],
    red:    [{ type: 'line', x1: 1, y1: 23, x2: 23, y2: 1, strokeWidth: 3.5 }],
    green: [
      { type: 'polygon', points: '23,1 23,23 1,23' },
      { type: 'polygon', points: '1,1 23,1 1,23', opacity: 0.55 }
    ],
    orange: [
      { type: 'polygon', points: '1,1 23,1 1,23', opacity: 0.55 },
      { type: 'line', x1: 1, y1: 23, x2: 23, y2: 1, strokeWidth: 3.5 }
    ],
    purple: [
      { type: 'polygon', points: '23,1 23,23 1,23', opacity: 0.85 },
      { type: 'line', x1: 1, y1: 23, x2: 23, y2: 1, strokeWidth: 3.5 }
    ],
    brown: [
      { type: 'polygon', points: '23,1 23,23 1,23', opacity: 0.8 },
      { type: 'polygon', points: '1,1 23,1 1,23', opacity: 0.5 },
      { type: 'line', x1: 1, y1: 23, x2: 23, y2: 1, strokeWidth: 3.5 }
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

  function glyphToSvg(key, includeOutline) {
    const parts = [];
    if (includeOutline) parts.push(outlineRect);
    (glyphs[key] || []).forEach((shape) => {
      if (shape.type === 'polygon') {
        parts.push(
          `<polygon points="${shape.points}" fill="#000" opacity="${shape.opacity ?? 1}"/>`
        );
      } else if (shape.type === 'line') {
        parts.push(
          `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" stroke="#000" stroke-width="${shape.strokeWidth ?? 2}" stroke-linecap="square"/>`
        );
      } else if (shape.type === 'rect' && shape.fill) {
        parts.push(
          `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" fill="#000"/>`
        );
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${parts.join('')}</svg>`;
  }

  // Convert an SVG string into a CSS mask URL that can be assigned to a
  // custom property. Because we use mask-image, the alpha of every drawn
  // pixel becomes the mask; a rect stroke will therefore paint through.
  function svgMaskUrl(svgString) {
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
  document.querySelectorAll('.swatch[data-symbol]').forEach((el) => {
    const key = el.getAttribute('data-symbol');
    // For light-tone swatches (white) we want the outline visible.
    // For all others, we still include the outline because it's a defining
    // feature of every ColorADD tile.
    const svg = glyphToSvg(key, true);
    el.style.setProperty('--mask', svgMaskUrl(svg));
  });

  // ---------------------------------------------------------------------------
  // Populate inline table row-header marks. Smaller, no outline (row already
  // has visual weight from the text label).
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.ca-inline[data-symbol]').forEach((el) => {
    const key = el.getAttribute('data-symbol');
    const svg = glyphToSvg(key, false);
    el.style.setProperty('--mask', svgMaskUrl(svg));
    el.innerHTML = '';
  });

  // ---------------------------------------------------------------------------
  // Helper: draw a ColorADD glyph directly on top of a Highcharts point using
  // the built-in SVGRenderer. We render primitives one-by-one into a <g>
  // group so we control fill/stroke explicitly (no reliance on currentColor).
  // ---------------------------------------------------------------------------
  function drawColorAddGlyph(chart, cx, cy, size, key, ink) {
    const renderer = chart.renderer;
    const half = size / 2;
    // Group everything so we can position/transform once.
    const group = renderer.g().attr({ zIndex: 6 }).add();

    // Outline (helps contrast against the fill color).
    renderer
      .rect(cx - half, cy - half, size, size, 3)
      .attr({ fill: 'rgba(255,255,255,0.15)', stroke: ink, 'stroke-width': 1.5 })
      .add(group);

    const scale = size / 24;
    // Convert glyph coords (0-24) to absolute chart coords.
    const px = (u) => cx - half + u * scale;
    const py = (u) => cy - half + u * scale;

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
          .attr({ points: pts, fill: ink, opacity: shape.opacity ?? 1 })
          .add(group);
      } else if (shape.type === 'line') {
        renderer
          .createElement('line')
          .attr({
            x1: px(shape.x1),
            y1: py(shape.y1),
            x2: px(shape.x2),
            y2: py(shape.y2),
            stroke: ink,
            'stroke-width': (shape.strokeWidth ?? 2) * scale,
            'stroke-linecap': 'square'
          })
          .add(group);
      } else if (shape.type === 'rect' && shape.fill) {
        renderer
          .rect(px(shape.x), py(shape.y), shape.width * scale, shape.height * scale)
          .attr({ fill: ink })
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
          if (!key || !p.shapeArgs) return;
          const size = opts.sizeForPoint(s, p, i);
          if (size <= 0) return;

          let cx, cy;
          if (s.type === 'column' || s.type === 'bar') {
            const box = p.shapeArgs;
            cx = box.x + box.width / 2 + chart.plotLeft;
            // Anchor just below the top edge of the bar; if the bar is too
            // short we skip (size 0).
            const inset = Math.min(size * 0.75, box.height * 0.35);
            cy = box.y + inset + chart.plotTop;
          } else if (s.type === 'pie') {
            const shape = p.shapeArgs;
            const midAngle = (shape.start + shape.end) / 2;
            const r = (shape.innerR + shape.r) / 2;
            cx = shape.x + Math.cos(midAngle) * r;
            cy = shape.y + Math.sin(midAngle) * r;
          } else {
            return;
          }

          const mark = drawColorAddGlyph(chart, cx, cy, size, key, opts.ink);
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
            el.setAttribute('fill', '#ffffff');
            el.setAttribute('opacity', String(shape.opacity != null ? shape.opacity : 1));
            g.appendChild(el);
          } else if (shape.type === 'line') {
            const el = document.createElementNS(svgNs, 'line');
            el.setAttribute('x1', String(px(shape.x1)));
            el.setAttribute('y1', String(py(shape.y1)));
            el.setAttribute('x2', String(px(shape.x2)));
            el.setAttribute('y2', String(py(shape.y2)));
            el.setAttribute('stroke', '#ffffff');
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
            el.setAttribute('fill', '#ffffff');
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
  const barSeriesDefs = [
    { name: 'Sourdough loaves',   key: 'blue',   color: palette.blue,   data: [ 98, 112, 129, 142] },
    { name: 'Pastries',           key: 'yellow', color: palette.yellow, data: [ 62,  68,  74,  81] },
    { name: 'Subscription boxes', key: 'green',  color: palette.green,  data: [ 41,  46,  52,  58] },
    { name: 'Wholesale',          key: 'red',    color: palette.red,    data: [ 30,  34,  41,  47] }
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
    series: barSeriesDefs.map((s) => ({
      type: 'column',
      name: s.name,
      key: s.key,
      color: s.color,
      data: s.data,
      accessibility: {
        description: `${s.name}. Values in dollars thousands across quarters one through four.`
      }
    })),
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
    sizeForPoint: () => 18,
    ink: '#ffffff'
  });

  decorateLegendSwatches(barChart);

  // ---------------------------------------------------------------------------
  // DONUT CHART
  // ---------------------------------------------------------------------------
  const donutSeries = [
    { name: 'Farmers market',     key: 'red',    color: palette.red,    y: 32 },
    { name: 'Wholesale accounts', key: 'orange', color: palette.orange, y: 22 },
    { name: 'Subscription boxes', key: 'yellow', color: palette.yellow, y: 18 },
    { name: 'Pop-ups',            key: 'green',  color: palette.green,  y: 16 },
    { name: 'Online store',       key: 'blue',   color: palette.blue,   y: 12 }
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
      data: donutSeries.map((d) => ({
        name: d.name,
        y: d.y,
        color: d.color,
        key: d.key,
        accessibility: { description: `${d.name}, ${d.y} percent of 2026 bakery revenue.` }
      }))
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
    sizeForPoint: () => 24,
    ink: '#ffffff'
  });
})();
