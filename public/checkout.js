/*
 * Personalised checkout. Reads the audit either from the URL query string
 * (?business=...&currPins=...) or, for the short printed link, from the saved
 * summary for /audit/<slug>. All values are inserted as text, never as HTML:
 * anyone can edit a query string.
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

  Promise.all([
    fetch('/api/checkout-config').then(function (r) { return r.json(); }),
    slug ? fetch('/api/audit-summary/' + slug).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }) : Promise.resolve(null),
  ]).then(function (res) {
    var cfg = res[0], saved = res[1] || {};
    // Query parameters win: they are what the printed button carried.
    var d = {
      business: q.get('business') || saved.business || '',
      currPins: q.has('currPins') ? intOr(q.get('currPins'), null) : (saved.currPins != null ? saved.currPins : null),
      totalPins: intOr(q.get('total'), saved.totalPins || 25),
      leader: q.get('leader') || saved.leader || '',
      niche: q.get('niche') || saved.niche || cfg.defaultNiche,
      city: q.get('city') || saved.city || '',
    };
    render(cfg, d);
  }).catch(function () {
    $('subhead').textContent = 'This page could not load its details. Please refresh, or email us and we will send your link directly.';
  });

  function render(cfg, d) {
    var offer = cfg.offer, sender = cfg.sender;
    var niche = cfg.niches[d.niche] || cfg.niches[cfg.defaultNiche];

    // ---- Header
    document.title = d.business ? 'Activate the Review Engine for ' + d.business : 'Activate the Review Engine';
    $('title').textContent = d.business ? 'Activate the Review Engine for ' + d.business : 'Activate the Review Engine';
    $('subhead').textContent = d.leader
      ? 'Close the gap against ' + d.leader + ' without learning new software or signing contracts.'
      : 'Close the gap without learning new software or signing contracts.';

    if (d.currPins != null) {
      var total = d.totalPins;
      // The goal is the offer's target, but never one they have already hit.
      var goal = Math.min(total, Math.max(offer.goalPins, d.currPins + 5));
      $('curr').textContent = d.currPins;
      $('total').textContent = total;
      $('total2').textContent = total;
      $('goal').textContent = goal;
      $('tracker').classList.remove('hidden');
    }

    // ---- Offer
    $('offerName').textContent = offer.name;
    var m = String(offer.price).match(/^(\D*[\d,.]+)\s*(?:\/\s*(\w+))?/);
    $('price').textContent = m ? m[1] : offer.price;
    $('per').textContent = m && m[2] ? 'per ' + (m[2] === 'mo' ? 'month' : m[2]) : '';

    var features = [
      ['Automated Post-Job Review SMS Engine', 'Sends review invites to 100% of customers after every ' + niche.transactionEvent + '. FTC compliant, zero gating: every customer gets the same link. A2P 10DLC carrier registration included.'],
      ['Active Owner Review Replies', 'Replies posted within 24 hours, signaling active profile management to searchers and to Google.'],
      ['High-Margin Service Re-Mapping', 'Profile categories and service descriptions re-mapped to capture ' + niche.highTicket + '.'],
      ['Monthly 25-Pin Heatmap Progress Reports', 'A new grid every 30 days, so you can see amber and red pins turning green.'],
      ['Zero Tech Friction', 'Plugs into ' + niche.software + ', or a dedicated private text line.'],
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

    // "60-Day Momentum Guarantee: body..." -> title + body, one source of truth.
    var g = String(offer.guarantee);
    var cut = g.indexOf(':');
    $('guaranteeTitle').textContent = cut > 0 ? g.slice(0, cut) : '60-Day Momentum Guarantee';
    $('guaranteeBody').textContent = cut > 0 ? g.slice(cut + 1).trim() : g;

    // ---- Buy button
    $('buyText').textContent = offer.cta;
    $('checkoutMicro').textContent = offer.checkoutMicrocopy;
    var buy = $('buy');
    if (cfg.stripeCheckoutUrl) {
      var u;
      try { u = new URL(cfg.stripeCheckoutUrl); } catch (e) { u = null; }
      if (u) {
        // Stripe Payment Links carry this through to the payment, so each
        // payment can be matched to the audit that produced it.
        if (slug) u.searchParams.set('client_reference_id', slug);
        buy.href = u.toString();
      }
    } else {
      var subject = 'Start the Review Engine' + (d.business ? ' for ' + d.business : '');
      buy.href = 'mailto:' + sender.email + '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent('Please send me the payment link.' + (slug ? '\n\nAudit: ' + slug : ''));
      $('noStripe').classList.remove('hidden');
    }

    // ---- FAQ
    var faqs = [
      ['Do I have to switch my software?', 'No. It works with your current stack (' + niche.software + '), or simple texts from a dedicated line.'],
      ['Is Manager access safe?', 'Yes. You keep full primary ownership. A Manager can never remove you, lock you out, or transfer the profile, and you can revoke our access in one click.'],
      ['What if I get a bad review?', 'Every customer receives the same review link. We never filter who is asked, which is what keeps this compliant with Google’s rules and FTC guidance. When a low rating comes in, you are alerted immediately with a calm, professional reply drafted and ready for you to approve.'],
      ['Who writes the replies?', 'Custom AI drafts a professional reply to each review. Anything sensitive, such as a complaint, a health detail, or a named employee, is held for a person to review before it posts.'],
      ['Are the texts compliant?', 'Yes. We register your texting with the carriers under A2P 10DLC, include STOP opt-out language in every message, and only text customers who have agreed to receive texts from you.'],
    ];
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
