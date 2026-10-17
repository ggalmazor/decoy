// Reference mosaic renderer used by the mockups.
// Every <canvas class="mosaic" data-text data-w data-h data-cell data-ink data-paper>
// is painted with the *real* pixelation of its decoy phrase.
// The production app should port buildMosaic() to TypeScript as its single source of truth.
(function () {
  function hex(s, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim());
    var v = m ? parseInt(m[1], 16) : f;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  // Returns { cols, rows, cells: [[r,g,b], ...] } for a w×h box.
  function buildMosaic(text, w, h, cell, ink, paper) {
    var cols = Math.max(1, Math.round(w / cell));
    var rows = Math.max(1, Math.round(h / cell));
    var dark = new Array(cols * rows).fill(0);

    // 1. Rasterise the decoy phrase (never the real text) in the document font.
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    var fam = '"Courier Prime", "Courier New", Courier, monospace';
    var size = Math.round(h * 0.82);
    g.font = '700 ' + size + 'px ' + fam;
    var tw = g.measureText(text).width;
    if (tw > w - 4) { size = Math.max(6, size * (w - 4) / tw); g.font = '700 ' + size + 'px ' + fam; }
    g.fillStyle = '#000'; g.textBaseline = 'middle';
    g.fillText(text, 2, h / 2 + 1);

    // 2. Average darkness per block.
    var d = g.getImageData(0, 0, w, h).data;
    for (var y = 0; y < h; y++) {
      var r = Math.min(rows - 1, Math.floor(y * rows / h));
      for (var x = 0; x < w; x++) {
        var c = Math.min(cols - 1, Math.floor(x * cols / w));
        dark[r * cols + c] += 1 - d[(y * w + x) * 4] / 255;
      }
    }

    // 3. Normalise, add a little seeded jitter, map darkness to paper→ink.
    var seed = 7;
    for (var i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var area = (w / cols) * (h / rows);
    var max = 0;
    for (var k = 0; k < dark.length; k++) { dark[k] /= area; if (dark[k] > max) max = dark[k]; }
    var a = hex(ink, 0x17140f), b = hex(paper, 0xf6f1e6);
    var cells = dark.map(function (v) {
      var t = max > 0 ? Math.min(1, (v / max) * 0.9) : 0;
      t = Math.max(0, Math.min(1, t + (rnd() - 0.5) * 0.06));
      return [0, 1, 2].map(function (j) { return Math.round(b[j] + (a[j] - b[j]) * t); });
    });
    return { cols: cols, rows: rows, cells: cells };
  }

  function paint(el) {
    var w = +el.dataset.w, h = +el.dataset.h, cell = +el.dataset.cell || 8;
    var m = buildMosaic(el.dataset.text || '', w, h, cell, el.dataset.ink || '#17140F', el.dataset.paper || '#F6F1E6');
    var dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    el.width = w * dpr; el.height = h * dpr;
    var g = el.getContext('2d');
    for (var r = 0; r < m.rows; r++) {
      for (var c = 0; c < m.cols; c++) {
        var x0 = Math.round(c * w / m.cols) * dpr, x1 = Math.round((c + 1) * w / m.cols) * dpr;
        var y0 = Math.round(r * h / m.rows) * dpr, y1 = Math.round((r + 1) * h / m.rows) * dpr;
        var col = m.cells[r * m.cols + c];
        g.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
  }

  function run() { document.querySelectorAll('canvas.mosaic').forEach(paint); }
  window.DECOY_buildMosaic = buildMosaic;
  var ready = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('700 20px "Courier Prime"'), document.fonts.ready])
    : Promise.resolve();
  ready.then(run, run);
})();
