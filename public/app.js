/* Local Visibility Audit — four-step composer and executive report. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { cfg: null, scan: null, chosen: [null, null], result: null, step: 1 };

  var STEPS = ['Business', 'Rivals', 'Generate', 'Report'];

  function renderStepper() {
    $('stepper').innerHTML = STEPS.map(function (label, i) {
      var n = i + 1;
      var done = state.step > n;
      var active = state.step === n;
      var dot = done ? 'bg-emerald-500 text-white' : active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500';
      var text = active ? 'text-slate-900' : done ? 'text-emerald-600' : 'text-slate-400';
      return '<li class="flex items-center gap-1.5 ' + (i ? 'flex-1' : '') + '">' +
        (i ? '<span class="flex-1 h-px ' + (done || active ? 'bg-slate-300' : 'bg-slate-200') + '"></span>' : '') +
        '<span class="w-5 h-5 rounded-full grid place-items-center ' + dot + '">' + (done ? '✓' : n) + '</span>' +
        '<span class="' + text + '">' + label + '</span>' +
      '</li>';
    }).join('');
  }

  function setStep(n) { state.step = n; renderStepper(); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var nf = function (n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); };

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('opacity-0', 'translate-y-2');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add('opacity-0', 'translate-y-2'); }, 2200);
  }

  function showError(message) {
    var lookup = /could not find|geocode|lookup service/i.test(message);
    $('errorTitle').textContent = lookup ? 'We could not find that location' : 'That did not work';
    $('errorBody').textContent = message;
    $('error').classList.remove('hidden');
    if (lookup) {
      var adv = $('coordinates').closest('details');
      if (adv) adv.open = true;
      $('coordinates').focus();
    }
  }
  function clearError() { $('error').classList.add('hidden'); }

  function busy(on, text) {
    $('loading').classList.toggle('hidden', !on);
    if (on) {
      $('empty').classList.add('hidden');
      $('exec').classList.add('hidden');
      $('utility').classList.add('hidden');
      $('loadingText').textContent = text || 'Working…';
    }
  }

  /* ------------------------------ config ------------------------------ */
  fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
    state.cfg = cfg;
    var live = cfg.liveReady ? cfg.rankProvider + ' ready'
      : (cfg.rankProvider === 'mock' ? 'no live provider configured' : cfg.rankProvider + ' (missing credentials)');
    $('providerBadge').textContent = 'Ranks: ' + live + ' · Map: ' + cfg.mapProvider + (cfg.placesReady ? ' · Places ✓' : '');
    if (!cfg.liveReady) {
      $('mock').checked = true;
      $('mock').disabled = true;
      $('mockHelp').innerHTML = 'No ranking service configured, so this uses sample data. Add credentials in <a class="underline" href="/settings.html">Settings</a>.';
    } else {
      $('mockHelp').textContent = 'Uncheck to run 25 real lookups via ' + cfg.rankProvider + '.';
    }
  }).catch(function () {});

  /* --------------------------- step 1: scan --------------------------- */
  $('head1').addEventListener('click', function () {
    var open = !$('body1').classList.contains('hidden');
    $('body1').classList.toggle('hidden', open);
    $('chev1').textContent = open ? '▸' : '▾';
  });

  $('form1').addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();
    var body = {
      business: $('business').value,
      location: $('location').value,
      address: $('address').value || undefined,
      keyword: $('keyword').value,
      spacingMi: Number($('spacing').value),
      mock: $('mock').checked,
      coordinates: $('coordinates').value || undefined
    };
    $('btnScan').disabled = true;
    $('btnScan').textContent = 'Scanning 25 points…';
    busy(true, 'Scanning 25 points around the business…');
    $('card2').classList.add('hidden');
    $('card3').classList.add('hidden');

    fetch('/api/candidates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Scan failed');
        onScan(res.d);
      })
      .catch(function (err) { showError(err.message); $('empty').classList.remove('hidden'); })
      .finally(function () {
        busy(false);
        $('btnScan').disabled = false;
        $('btnScan').textContent = 'Scan market & find competitors';
      });
  });

  function onScan(data) {
    state.scan = data;
    state.chosen = data.recommendations.map(function (r) {
      return { name: r.name, placeId: r.placeId, cid: r.cid, archetype: r.archetypeKey, autoSelected: true };
    });
    $('sum1').textContent = data.business.name + ' · "' + data.keyword + '"';
    $('body1').classList.add('hidden');
    $('chev1').textContent = '▸';
    renderRecs();
    $('card2').classList.remove('hidden');
    $('card3').classList.remove('hidden');
    $('empty').classList.remove('hidden');
    setStep(2);
  }

  /* ------------------- step 2: recommendation cards ------------------- */
  var ARCH_STYLE = {
    dominator: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    peer: 'bg-amber-50 text-amber-800 border-amber-200'
  };

  function renderRecs() {
    var recs = state.scan.recommendations;
    if (!recs.length) {
      $('recs').innerHTML = '<p class="text-sm text-slate-500">No competitors appeared in the results, so the report will cover this business alone.</p>';
      return;
    }
    $('recs').innerHTML = recs.map(function (r, i) {
      var chosen = state.chosen[i];
      var overridden = chosen && !chosen.autoSelected;
      return '<div class="rounded-xl border p-3" data-slot="' + i + '">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<span class="text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ' + (ARCH_STYLE[r.archetypeKey] || '') + '">' + esc(r.archetype) + '</span>' +
          '<button type="button" class="text-xs text-slate-500 hover:text-slate-900 underline" data-edit="' + i + '">' + (overridden ? 'reset' : 'change') + '</button>' +
        '</div>' +
        '<p class="font-semibold text-sm mt-2 leading-snug">' + esc(chosen ? chosen.name : r.name) + '</p>' +
        (overridden
          ? '<p class="text-xs text-slate-500 mt-1">Typed by you. Ranks are read from the same scan.</p>'
          : '<p class="text-xs text-slate-600 mt-1">' +
              (r.reviews != null ? '<span class="font-semibold">' + nf(r.reviews) + '</span> reviews' : 'review count unavailable') +
              (r.rating != null ? ' · ' + r.rating + '★' : '') +
            '</p>' +
            '<p class="text-xs text-slate-500 mt-1">' + esc(r.reason) + '</p>' +
            (r.warning ? '<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-2">' + esc(r.warning) + '</p>' : '')) +
        '<div class="hidden mt-2" data-editor="' + i + '">' +
          '<input class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="Competitor name" data-input="' + i + '" value="' + esc(chosen ? chosen.name : '') + '" />' +
          '<div class="flex gap-2 mt-2">' +
            '<button type="button" class="text-xs font-semibold rounded-lg bg-slate-900 text-white px-3 py-1.5" data-save="' + i + '">Use this name</button>' +
            '<button type="button" class="text-xs rounded-lg border px-3 py-1.5" data-cancel="' + i + '">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    $('recs').querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = Number(b.dataset.edit);
        if (b.textContent === 'reset') {
          var r = state.scan.recommendations[i];
          state.chosen[i] = { name: r.name, placeId: r.placeId, cid: r.cid, archetype: r.archetypeKey, autoSelected: true };
          renderRecs();
        } else {
          $('recs').querySelector('[data-editor="' + i + '"]').classList.remove('hidden');
          $('recs').querySelector('[data-input="' + i + '"]').focus();
        }
      });
    });
    $('recs').querySelectorAll('[data-save]').forEach(function (b) {
      b.addEventListener('click', function () {
        var i = Number(b.dataset.save);
        var name = $('recs').querySelector('[data-input="' + i + '"]').value.trim();
        if (!name) return;
        state.chosen[i] = { name: name, placeId: null, cid: null, archetype: state.scan.recommendations[i].archetypeKey, autoSelected: false };
        renderRecs();
      });
    });
    $('recs').querySelectorAll('[data-cancel]').forEach(function (b) {
      b.addEventListener('click', function () {
        $('recs').querySelector('[data-editor="' + b.dataset.cancel + '"]').classList.add('hidden');
      });
    });
  }

  /* ------------------------ step 3: generate ------------------------ */
  $('btnGenerate').addEventListener('click', function () {
    clearError();
    setStep(3);
    $('btnGenerate').disabled = true;
    busy(true, 'Reading review signals and drawing the maps…');
    fetch('/api/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanId: state.scan.scanId, competitors: state.chosen.filter(Boolean) })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.d.error || 'Generation failed');
        state.result = res.d;
        renderExecutive(res.d);
        setStep(4);
      })
      .catch(function (err) { showError(err.message); $('empty').classList.remove('hidden'); })
      .finally(function () { busy(false); $('btnGenerate').disabled = false; });
  });

  /* --------------------- step 4: the deliverable --------------------- */
  var TONE = { good: 'text-emerald-600', warn: 'text-amber-500', bad: 'text-red-500' };
  var ROLE_ACCENT = ['border-emerald-500', 'border-slate-300', 'border-slate-300'];
  var ROLE_TAG = ['Your facility', 'Market dominator', 'Nearby direct peer'];

  function renderExecutive(d) {
    var rep = d.report, ex = d.executive, b = rep.businesses;

    $('xName').textContent = rep.business.name;
    $('xMeta').textContent = '“' + rep.keyword + '”  ·  ' + (rep.business.address || rep.location) +
      '  ·  ' + new Date(rep.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    $('xShare').textContent = ex.visibility.label;
    $('xShare').className = 'print-badge text-5xl font-extrabold leading-none mt-1 ' + (TONE[ex.visibility.tone] || '');
    $('xShareSub').textContent = ex.visibility.top3Count + ' of ' + ex.visibility.points + ' searches put you in the top 3';

    $('xPanels').innerHTML = b.slice(0, 3).map(function (p, i) {
      var m = p.metrics;
      return '<figure class="print-panel rounded-xl border-2 ' + ROLE_ACCENT[i] + ' overflow-hidden bg-white">' +
        '<figcaption class="px-2.5 py-1.5 ' + (i === 0 ? 'bg-emerald-50' : 'bg-slate-50') + ' border-b">' +
          '<span class="print-label block text-[9px] font-bold uppercase tracking-wide ' + (i === 0 ? 'text-emerald-700' : 'text-slate-500') + '">' + ROLE_TAG[i] + '</span>' +
          '<span class="print-panel-name block text-xs font-semibold truncate">' + esc(p.name) + '</span>' +
        '</figcaption>' +
        '<img src="' + d.panelUrls[i] + '" alt="Ranking grid for ' + esc(p.name) + '" class="w-full block" />' +
        '<div class="print-label px-2.5 py-1.5 text-[11px] flex items-center justify-between border-t">' +
          '<span><b>' + m.top3Count + '</b>/' + rep.points.length + ' top-3</span>' +
          '<span class="font-bold ' + (i === 0 ? (TONE[ex.visibility.tone] || '') : 'text-slate-700') + '">' + Math.round(m.top3Share * 100) + '%</span>' +
        '</div>' +
      '</figure>';
    }).join('');

    var bm = rep.basemap || {};
    $('xAttrib').textContent = [bm.attribution, d.agency && d.agency.name ? 'Prepared by ' + d.agency.name : '']
      .filter(Boolean).join('  ·  ');

    var sig = ex.signals;
    $('xSignals').innerHTML = [sig.reviews, sig.velocity, sig.reply].map(function (c) {
      return '<div class="print-pad rounded-xl border bg-slate-50 p-3">' +
        '<p class="print-label text-[10px] font-bold uppercase tracking-wide text-slate-500">' + esc(c.label) + '</p>' +
        '<p class="print-card-value text-xl font-extrabold mt-1 ' + (c.measured ? '' : 'text-slate-400') + '">' + esc(c.prospect) + '</p>' +
        '<p class="print-label text-[11px] text-slate-500">vs ' + esc(c.benchmark) + '</p>' +
        '<p class="print-sentence text-[11px] mt-1.5 ' + (c.measured ? 'text-slate-700' : 'text-amber-700') + '">' + esc(c.verdict) + '</p>' +
      '</div>';
    }).join('');

    $('xSummary').innerHTML = ex.summary.map(function (s) {
      return '<li class="print-sentence text-sm leading-snug">' +
        '<b>' + s.n + '. ' + esc(s.title) + '.</b> ' + esc(s.text) +
      '</li>';
    }).join('');

    var offer = ex.offer;
    $('xOffer').innerHTML =
      '<div class="min-w-0">' +
        '<p class="print-tight font-bold text-sm">' + esc(offer.name) + '</p>' +
        '<p class="print-label text-xs text-white/70">' + esc(offer.price) + ' ' + esc(offer.terms) + '</p>' +
      '</div>' +
      (offer.ctaUrl
        ? '<a href="' + esc(offer.ctaUrl) + '" class="rounded-xl bg-emerald-500 text-white text-sm font-bold px-5 py-2.5 whitespace-nowrap">' + esc(offer.cta) + '</a>'
        : '<span class="rounded-xl bg-emerald-500 text-white text-sm font-bold px-5 py-2.5 whitespace-nowrap">' + esc(offer.cta) + '</span>');

    renderRaw(d);
    $('btnJson').href = d.jsonUrl;
    $('empty').classList.add('hidden');
    $('exec').classList.remove('hidden');
    $('utility').classList.remove('hidden');
    $('exec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderRaw(d) {
    var rep = d.report;
    var names = rep.businesses.map(function (b) { return esc(b.name); });
    var rows = rep.points.map(function (p) {
      return '<tr class="border-b last:border-0">' +
        '<td class="py-1 pr-3">' + (p.row + 1) + ',' + (p.col + 1) + '</td>' +
        '<td class="py-1 pr-3 tabular-nums">' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + '</td>' +
        '<td class="py-1 pr-3">' + p.bearing + '</td>' +
        '<td class="py-1 pr-3 tabular-nums">' + p.distanceMi.toFixed(2) + '</td>' +
        p.ranks.map(function (r) {
          return '<td class="py-1 pr-3 font-semibold tabular-nums">' + (r == null ? '20+' : r) + '</td>';
        }).join('') +
      '</tr>';
    }).join('');

    var kw = d.executive.keywordCoverage;
    var sigNotes = d.signals.map(function (s, i) {
      return '<li><b>' + names[i] + ':</b> ' + esc(s.source ? s.source + ' — ' + s.note : s.note) + '</li>';
    }).join('');

    $('xRawBody').innerHTML =
      '<div class="grid sm:grid-cols-2 gap-4">' +
        '<div><p class="font-semibold mb-1">Category / keyword match</p>' +
          '<p class="text-slate-600">' + (kw.checked
            ? (kw.matched
              ? 'The listing name or category carries every search term.'
              : 'Missing from the listing name and category: <b>' + esc(kw.missing.join(', ')) + '</b>')
            : 'Not checked.') + '</p></div>' +
        '<div><p class="font-semibold mb-1">Review signal sources</p><ul class="text-slate-600 list-disc pl-4 space-y-0.5">' + sigNotes + '</ul></div>' +
      '</div>' +
      '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-left border-b">' +
        '<th class="py-1 pr-3">Cell</th><th class="py-1 pr-3">Lat, Lng</th><th class="py-1 pr-3">Bearing</th><th class="py-1 pr-3">Miles</th>' +
        names.map(function (n) { return '<th class="py-1 pr-3">' + n + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="text-xs text-slate-500">Full machine-readable output, including every local pack we saw: ' +
        '<a class="underline" href="' + d.jsonUrl + '" download>download the JSON</a>.</p>';
  }

  /* --------------------------- utility bar --------------------------- */
  $('btnPrint').addEventListener('click', function () { window.print(); });

  $('btnCopy').addEventListener('click', function () {
    if (!state.result) return;
    var text = state.result.executive.email;
    var done = function () { toast('Email copied to clipboard'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy automatically'); }
      document.body.removeChild(ta);
    }
  });

  renderStepper();
})();
