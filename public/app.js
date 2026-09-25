/* Local Visibility Audit — four-step composer and one-page executive audit. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { cfg: null, scan: null, chosen: [], result: null, step: 1, nicheTouched: false };
  var STEPS = ['Business', 'Rivals', 'Generate', 'Report'];

  /* ------------------------------ helpers ------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var nf = function (n) { return n == null ? '—' : Number(n).toLocaleString('en-US'); };

  function renderStepper() {
    $('stepper').innerHTML = STEPS.map(function (label, i) {
      var n = i + 1, done = state.step > n, active = state.step === n;
      var dot = done ? 'bg-emerald-500 text-white' : active ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500';
      var text = active ? 'text-slate-900' : done ? 'text-emerald-600' : 'text-slate-400';
      return '<li class="flex items-center gap-1.5 ' + (i ? 'flex-1' : '') + '">' +
        (i ? '<span class="flex-1 h-px ' + (done || active ? 'bg-slate-300' : 'bg-slate-200') + '"></span>' : '') +
        '<span class="w-5 h-5 rounded-full grid place-items-center ' + dot + '">' + (done ? '✓' : n) + '</span>' +
        '<span class="' + text + '">' + label + '</span></li>';
    }).join('');
  }
  function setStep(n) { state.step = n; renderStepper(); }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('opacity-0', 'translate-y-2');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add('opacity-0', 'translate-y-2'); }, 2600);
  }

  function copy(text, okMsg) {
    var done = function () { toast(okMsg); };
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy automatically'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
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

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Request failed'); return d; }); });
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
    $('niche').innerHTML = Object.keys(cfg.niches).map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === cfg.defaultNiche ? ' selected' : '') + '>' + esc(cfg.niches[k].label) + '</option>';
    }).join('');
  }).catch(function () {});

  // Suggest the industry from the keyword, until the user picks one themselves.
  $('niche').addEventListener('change', function () { state.nicheTouched = true; });
  $('keyword').addEventListener('input', function () {
    if (state.nicheTouched || !state.cfg) return;
    var kw = $('keyword').value, pick = null;
    Object.keys(state.cfg.niches).forEach(function (k) {
      var p = state.cfg.niches[k].pattern;
      if (!pick && p && new RegExp(p, 'i').test(kw)) pick = k;
    });
    $('niche').value = pick || state.cfg.defaultNiche;
  });

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
      niche: $('niche').value,
      ownerName: $('ownerName').value || undefined,
      mock: $('mock').checked,
      coordinates: $('coordinates').value || undefined
    };
    $('btnScan').disabled = true;
    $('btnScan').textContent = 'Scanning 25 points…';
    busy(true, 'Scanning 25 points around the business…');
    $('card2').classList.add('hidden');
    $('card3').classList.add('hidden');

    post('/api/candidates', body)
      .then(onScan)
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
    var warn = (data.outreachEmail && data.outreachEmail.warnings) || [];
    $('canSpamWarn').textContent = warn.join(' ');
    $('canSpamWarn').classList.toggle('hidden', !warn.length);
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
    var html = recs.map(function (r, i) {
      var chosen = state.chosen[i];
      var overridden = chosen && !chosen.autoSelected;
      return '<div class="rounded-xl border p-3">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<span class="text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ' + (ARCH_STYLE[r.archetypeKey] || '') + '">' + esc(r.archetype) + '</span>' +
          '<button type="button" class="text-xs text-slate-500 hover:text-slate-900 underline" data-edit="' + i + '">' + (overridden ? 'reset' : 'change') + '</button>' +
        '</div>' +
        '<p class="font-semibold text-sm mt-2 leading-snug">' + esc(chosen ? chosen.name : r.name) + '</p>' +
        (overridden
          ? '<p class="text-xs text-slate-500 mt-1">Typed by you. Ranks are read from the same scan.</p>'
          : '<p class="text-xs text-slate-600 mt-1">' +
              (r.reviews != null ? '<span class="font-semibold">' + nf(r.reviews) + '</span> reviews' : 'review count unavailable') +
              (r.rating != null ? ' · ' + r.rating + '★' : '') + '</p>' +
            '<p class="text-xs text-slate-500 mt-1">' + esc(r.reason) + '</p>') +
        '<div class="hidden mt-2" data-editor="' + i + '">' +
          '<input class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="Competitor name" data-input="' + i + '" value="' + esc(chosen ? chosen.name : '') + '" />' +
          '<div class="flex gap-2 mt-2">' +
            '<button type="button" class="text-xs font-semibold rounded-lg bg-slate-900 text-white px-3 py-1.5" data-save="' + i + '">Use this name</button>' +
            '<button type="button" class="text-xs rounded-lg border px-3 py-1.5" data-cancel="' + i + '">Cancel</button>' +
          '</div></div>' +
      '</div>';
    }).join('');
    if (state.scan.weakPeer) {
      html += '<p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">' +
        'No second rival out-ranks this business, so the report shows the market dominator only.</p>';
    }
    if (!recs.length) html = '<p class="text-sm text-slate-500">No competitors appeared in the results, so the report will cover this business alone.</p>';
    $('recs').innerHTML = html;

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

  $('btnOutreach').addEventListener('click', function () {
    if (!state.scan) return;
    var e = state.scan.outreachEmail;
    copy(e.text, e.warnings && e.warnings.length ? 'Copied — add your postal address before sending' : 'Outreach email copied');
  });

  /* ------------------------ step 3: generate ------------------------ */
  $('btnGenerate').addEventListener('click', function () {
    clearError();
    setStep(3);
    $('btnGenerate').disabled = true;
    busy(true, 'Reading review signals and drawing the maps…');
    post('/api/generate', {
      scanId: state.scan.scanId,
      competitors: state.chosen.filter(Boolean),
      niche: $('niche').value,
      ownerName: $('ownerName').value || undefined
    }).then(function (d) {
      state.result = d;
      renderExecutive(d);
      setStep(4);
    }).catch(function (err) { showError(err.message); $('empty').classList.remove('hidden'); })
      .finally(function () { busy(false); $('btnGenerate').disabled = false; });
  });

  /* --------------------- step 4: the deliverable --------------------- */
  var ROLE_TAG = ['Your Business', 'Competitor A: Market Dominator', 'Competitor B: Nearby Peer'];

  function renderExecutive(d) {
    var rep = d.report, ex = d.executive, b = rep.businesses.slice(0, 3);

    $('xHeadline').textContent = ex.headline.text;
    $('xContext').textContent = ex.headline.context;

    // Maps: the prospect first, anchored with an emerald border and badge.
    $('xPanels').className = 'print-gap grid gap-3 ' + (b.length >= 3 ? 'grid-cols-3' : b.length === 2 ? 'grid-cols-2' : 'grid-cols-1');
    $('xPanels').innerHTML = b.map(function (p, i) {
      var m = p.metrics, you = i === 0;
      return '<figure class="print-panel rounded-xl overflow-hidden bg-white ' + (you ? 'border-2 border-emerald-500 ring-2 ring-emerald-500/15' : 'border border-slate-200') + '">' +
        '<figcaption class="px-2.5 py-1.5 border-b ' + (you ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50') + '">' +
          '<span class="print-eyebrow inline-block text-[9px] font-bold uppercase tracking-wide ' +
            (you ? 'bg-emerald-600 text-white rounded px-1.5 py-0.5' : 'text-slate-500') + '">' + ROLE_TAG[i] + '</span>' +
          '<span class="print-panel-name block text-xs font-semibold text-slate-900 truncate mt-0.5">' + esc(p.name) + '</span>' +
        '</figcaption>' +
        '<img src="' + d.panelUrls[i] + '" alt="Ranking grid for ' + esc(p.name) + '" class="w-full block" />' +
        '<div class="print-small px-2.5 py-1 text-[11px] flex items-center justify-between border-t">' +
          '<span class="text-slate-600"><b class="text-slate-900">' + m.top3Count + '</b>/' + rep.points.length + ' in top 3</span>' +
          '<span class="font-bold ' + (you ? 'text-red-600' : 'text-slate-900') + '">' + Math.round(m.top3Share * 100) + '%</span>' +
        '</div></figure>';
    }).join('');

    var dot = function (color, label) {
      return '<span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full" style="background:' + color + '"></span>' + label + '</span>';
    };
    $('xLegend').innerHTML =
      dot('#22c55e', '1–3 Visible (Green)') + dot('#f59e0b', '4–10 Weak (Amber)') + dot('#ef4444', '11+ Invisible (Red)') +
      '<span class="text-slate-300">|</span>' +
      '<span class="inline-flex items-center gap-1"><span class="w-3 h-3 rounded-full border-2 border-slate-900"></span>Circled pin = Your Address</span>' +
      '<span class="text-slate-300">|</span><span>' + esc(rep.spacingMi) + ' mi grid spacing</span>';

    var sig = ex.signals;
    $('xSignals').innerHTML = [sig.reviews, sig.velocity, sig.reply].map(function (c) {
      return '<div class="print-card rounded-lg border border-slate-200 bg-white px-3 py-2">' +
        '<p class="print-eyebrow text-[10px] font-bold uppercase tracking-wide text-slate-500">' + esc(c.label) + '</p>' +
        '<p class="print-card-value text-lg font-extrabold leading-tight mt-0.5 ' + (c.measured ? 'text-slate-900' : 'text-slate-400') + '">' + esc(c.prospect) +
          '<span class="font-semibold text-slate-400"> vs </span><span class="text-slate-700">' + esc(c.benchmark) + '</span></p>' +
        '<p class="print-small text-[11px] text-slate-500 mt-0.5">' + esc(c.verdict) + '</p>' +
      '</div>';
    }).join('');

    var item = function (accent) {
      return function (x) {
        return '<li class="text-[13px] leading-snug text-slate-700 pl-3 border-l-2 ' + accent + '">' +
          '<b class="text-slate-900">' + esc(x.title) + '.</b> ' + esc(x.text) + '</li>';
      };
    };
    $('xDiagnosis').innerHTML = ex.narrative.diagnosis.map(item('border-red-300')).join('');
    $('xPlan').innerHTML = ex.narrative.plan.map(item('border-emerald-400')).join('');

    var offer = ex.offer;
    $('xOfferName').textContent = offer.name;
    $('xMicro').textContent = offer.microcopy;
    $('xGuarantee').textContent = offer.guarantee;
    $('xCta').textContent = offer.cta + ' →';
    $('xCta').href = ex.links.activate;
    $('xShort').textContent = ex.links.short;

    var s = ex.sender;
    $('xSender').textContent = [s.company, s.name, s.postalAddress || s.cityState, s.email, s.phone].filter(Boolean).join(' · ');

    // "Save as PDF" uses the page title as the file name.
    document.title = rep.business.name + ' — Local Visibility Audit';
    $('empty').classList.add('hidden');
    $('exec').classList.remove('hidden');
    $('utility').classList.remove('hidden');
    $('exec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* --------------------------- utility bar --------------------------- */
  $('btnPrint').addEventListener('click', function () { window.print(); });
  $('btnCopy').addEventListener('click', function () {
    if (state.result) copy(state.result.executive.reportEmail, 'Report email copied');
  });
  $('btnOutreach2').addEventListener('click', function () {
    if (!state.result) return;
    var e = state.result.executive.outreachEmail;
    copy(e.text, e.warnings && e.warnings.length ? 'Copied — add your postal address before sending' : 'Outreach email copied');
  });

  renderStepper();
})();
