/*
 * Personalised checkout. Reads the audit either from the URL query string
 * (?biz=...&pins=...&v=b&g=4&m=10&t=11) or, for the short printed link, from
 * the saved summary for /audit/<slug>. All values are inserted as text, never
 * as HTML: anyone can edit a query string.
 *
 * Each audit belongs to one version of the A/B offer test, and this page shows
 * only that version: A (first 30 days free) or B (we work free until the map
 * improves).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var slugMatch = location.pathname.match(/^\/audit\/([a-z0-9-]+)(?:\/activate)?\/?$/);
  var slug = slugMatch ? slugMatch[1] : null;
  var q = new URLSearchParams(location.search);

  function intOr(v, d) {
    var n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : d;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Mirrors goalPhrase() in src/guarantee.js.
  function goalPhrase(g) {
    if (!g || !g.metric || !g.count) return 'in more neighborhoods than your Day 1 map';
    return 'in Google’s ' + (g.metric === 'top10' ? 'top 10' : 'top 3') + ' in at least ' + g.count + ' more neighborhoods';
  }

  function track(event) {
    if (!slug) return;
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, event: event }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) { /* tracking never blocks the page */ }
  }

  Promise.all([
    fetch('/api/checkout-config').then(function (r) { return r.json(); }),
    slug ? fetch('/api/audit-summary/' + slug).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) : Promise.resolve(null),
  ]).then(function (res) {
    var cfg = res[0], saved = res[1] || {};
    // The saved audit wins for the offer version, so editing the link cannot
    // switch it. Query parameters fill in when there is no saved audit.
    // biz/pins/lead are current; business/currPins/leader are from audits
    // printed before the rename and must keep working.
    var pick = function (a, b) { return q.get(a) || q.get(b); };
    var pinsRaw = q.has('pins') ? q.get('pins') : q.has('currPins') ? q.get('currPins') : null;
    var variant = saved.variant || (q.get('v') === 'b' ? 'b' : 'a');
    var goal = saved.goal || null;
    if (!goal && variant === 'b' && q.get('g')) {
      goal = {
        metric: q.get('m') === '3' ? 'top3' : 'top10',
        count: intOr(q.get('g'), null),
        today: intOr(q.get('t'), null),
      };
    }
    var d = {
      business: pick('biz', 'business') || saved.business || '',
      currPins: pinsRaw != null ? intOr(pinsRaw, null) : (saved.currPins != null ? saved.currPins : null),
      totalPins: intOr(q.get('total'), saved.totalPins || 25),
      leader: pick('lead', 'leader') || saved.leader || '',
      niche: q.get('niche') || saved.niche || cfg.defaultNiche,
      city: q.get('city') || saved.city || '',
      variant: variant,
      goal: goal,
    };
    render(cfg, d);
    track('viewed');
  }).catch(function () {
    $('subhead').textContent = 'This page could not load its details. Please refresh, or email us and we will send your link directly.';
  });

  function render(cfg, d) {
    var offer = cfg.offers[d.variant] || cfg.offers.a;
    var sender = cfg.sender;
    var niche = cfg.niches[d.niche] || cfg.niches[cfg.defaultNiche];
    var isA = d.variant === 'a';

    // ---- Header
    var title = 'Start your Local Review Engine' + (d.business ? ' for ' + d.business : '');
    document.title = title;
    $('title').textContent = title;
    $('subhead').textContent = d.leader
      ? 'Close the gap on ' + d.leader + ' without learning new software or signing a contract.'
      : 'Get found in more of the neighborhoods you serve, without learning new software or signing a contract.';

    // Today's map, and for version B the Day 90 target it guarantees.
    var total = d.totalPins;
    var g = d.goal;
    if (!isA && g && g.metric && g.count && g.today != null) {
      var top = g.metric === 'top10' ? 'top 10' : 'top 3';
      $('todayValue').textContent = top + ' in ' + g.today + ' of ' + total + ' neighborhoods';
      $('goalValue').textContent = top + ' in ' + Math.min(total, g.today + g.count) + '+';
      ['goalArrow', 'goalLabel', 'goalValue'].forEach(function (id) { $(id).classList.remove('hidden'); });
      $('tracker').classList.remove('hidden');
    } else if (d.currPins != null) {
      $('todayValue').textContent = 'top 3 in ' + d.currPins + ' of ' + total + ' neighborhoods';
      $('tracker').classList.remove('hidden');
    }

    // ---- Offer
    $('offerName').textContent = offer.name;
    var m = String(offer.price).match(/^(\D*[\d,.]+)\s*(?:\/\s*(\w+))?/);
    var amount = m ? m[1] : offer.price;
    var per = m && m[2] ? (m[2] === 'mo' ? 'month' : m[2]) : '';
    if (isA) {
      $('price').textContent = '$0 today';
      $('per').textContent = 'then ' + amount + (per ? '/' + per : '');
    } else {
      $('price').textContent = amount;
      $('per').textContent = per ? 'per ' + per : '';
    }

    var features = [
      ['A review request after every ' + niche.transactionEvent, 'A friendly text with an email reminder, sent to every customer, not just the happy ones. That keeps it within Google’s rules and FTC guidance. Carrier registration (A2P 10DLC) included.'],
      ['A reply to every review', 'Prompt, professional replies. If a low rating comes in, you hear about it right away, with a calm reply drafted for you to approve.'],
      ['A Google profile that stays current', 'Services, categories and photos kept up to date, with extra attention on the work you want more of: ' + niche.highTicket + '.'],
      ['A neighborhood map every 30 days', 'The same 25-point map as your audit, rechecked every month, so you can see where you gained ground.'],
      ['Nothing new to learn', 'Works with ' + niche.software + '.'],
    ];
    var ul = $('features');
    features.forEach(function (f) {
      var li = el('li', 'flex gap-3');
      var tick = el('span', 'shrink-0 mt-0.5 w-5 h-5 rounded-full bg-emerald-400/15 text-emerald-300 grid place-items-center text-[11px] font-bold', '✓');
      tick.setAttribute('aria-hidden', 'true');
      var p = el('p', 'text-slate-300');
      p.appendChild(el('b', 'text-slate-100', f[0] + '. '));
      p.appendChild(document.createTextNode(f[1]));
      li.appendChild(tick); li.appendChild(p);
      ul.appendChild(li);
    });

    // "Title: body", with version B's {goal} filled from this audit.
    var gText = String(offer.guaranteeTemplate || offer.guarantee).replace(/\{goal\}/g, goalPhrase(d.goal));
    var cut = gText.indexOf(':');
    $('guaranteeTitle').textContent = cut > 0 ? gText.slice(0, cut) : '';
    $('guaranteeBody').textContent = cut > 0 ? gText.slice(cut + 1).trim() : gText;

    // ---- Buy button
    $('buyText').textContent = offer.cta;
    $('checkoutMicro').textContent = offer.microcopy;
    $('terms').textContent = offer.terms;
    var buy = $('buy');
    var stripeUrl = (cfg.stripe || {})[d.variant] || '';
    var u = null;
    if (stripeUrl) { try { u = new URL(stripeUrl); } catch (e) { u = null; } }
    if (u) {
      // Stripe Payment Links carry this through to the payment, so each
      // payment can be matched to its audit and its offer version.
      if (slug) u.searchParams.set('client_reference_id', slug + '_' + d.variant);
      buy.href = u.toString();
    } else {
      var subject = 'Start the Local Review Engine' + (d.business ? ' for ' + d.business : '');
      buy.href = 'mailto:' + sender.email + '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent('Please send me the payment link.' + (slug ? '\n\nAudit: ' + slug + '_' + d.variant : ''));
      $('noStripe').classList.remove('hidden');
    }
    buy.addEventListener('click', function () { track('clicked'); });

    // ---- What happens next
    var steps = [
      ['Manager access', 'a few minutes', 'We walk you through adding us as a manager on your Google profile. You stay the owner and can remove us anytime.'],
      ['Setup', 'usually one business day', 'Review requests, reply handling and profile updates are switched on.'],
      ['Day 30: your first progress map', '', 'We rerun your map and send it with a short note on what changed.'],
    ];
    if (isA) steps.push(['Day 31: first payment', '', 'We email you 3 days before. Cancel before then and you pay nothing.']);
    else steps.push(['Day 90: guarantee check', '', 'We compare your Day 90 map to your audit. If it doesn’t show you ' + goalPhrase(d.goal) + ', you pay nothing more until it does.']);
    var ol = $('steps');
    steps.forEach(function (s, i) {
      var li = el('li', 'flex gap-3');
      li.appendChild(el('span', 'shrink-0 w-7 h-7 rounded-full bg-slate-800 text-emerald-300 grid place-items-center text-xs font-bold', String(i + 1)));
      var p = el('p');
      var b = el('b', 'text-slate-100', s[0]);
      if (s[1]) b.appendChild(el('span', 'font-normal text-slate-400', ' (' + s[1] + ')'));
      b.appendChild(document.createTextNode('. '));
      p.appendChild(b);
      p.appendChild(el('span', 'text-slate-300', s[2]));
      li.appendChild(p);
      ol.appendChild(li);
    });

    // ---- FAQ
    var burned = 'Because you’ve probably been burned by marketing before. We’d rather show you results than ask you to trust a sales pitch.';
    var faqs = isA ? [
      ['When will I be charged?', 'Not today. Your first payment of ' + amount + ' is on Day 31, and we email you 3 days before. Cancel before then and you’re never charged.'],
      ['Why is the first month free?', burned],
    ] : [
      ['How does the guarantee work?', 'On Day 90 we rerun the same map as your audit: same search, same grid, same spacing. If it doesn’t show you ' + goalPhrase(d.goal) + ', you pay nothing more until it does. We keep working the whole time.'],
      ['Why offer that?', burned + ' We only want to be paid while it’s working.'],
    ];
    faqs = faqs.concat([
      ['Do I have to switch my software?', 'No. It works with ' + niche.software + '.'],
      ['Is manager access safe?', 'Yes. You stay the owner of your Google profile. A manager can’t remove you, lock you out or transfer the profile, and you can remove our access in one click. Every review stays yours if you leave.'],
      ['What if I get a bad review?', 'Every customer gets the same review request. We never pick and choose who is asked, which is what keeps this within Google’s rules and FTC guidance. When a low rating comes in, you hear about it right away, with a calm, professional reply drafted for you to approve.'],
      ['Who writes the replies?', 'We draft them with AI set up for your business and services. Anything sensitive, such as a complaint, a health detail or an employee’s name, is held for a person to review before it posts.'],
      ['Are the texts compliant?', 'Yes. Your texting is registered with the carriers (A2P 10DLC), every message includes a way to opt out, and we only text customers who have agreed to hear from you.'],
      ['How do I cancel?', 'Reply to any email from us, or cancel from the billing link in your receipt. No contract and no cancellation fee.'],
    ]);
    var faq = $('faq');
    faqs.forEach(function (f) {
      var det = el('details', 'group py-3');
      var sum = el('summary', 'flex items-center justify-between gap-4 cursor-pointer text-sm font-semibold text-slate-100');
      sum.appendChild(el('span', null, f[0]));
      var plus = el('span', 'faq-plus text-emerald-300 text-lg leading-none transition-transform', '+');
      plus.setAttribute('aria-hidden', 'true');
      sum.appendChild(plus);
      det.appendChild(sum);
      det.appendChild(el('p', 'text-sm text-slate-300 mt-2', f[1]));
      faq.appendChild(det);
    });

    // ---- Sender
    var f = $('footer');
    f.appendChild(el('p', 'font-semibold text-slate-300', [sender.company, sender.name].filter(Boolean).join(' · ')));
    f.appendChild(el('p', null, [sender.postalAddress || sender.cityState, sender.email, sender.phone].filter(Boolean).join(' · ')));
  }
})();
