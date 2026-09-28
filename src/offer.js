/**
 * The offer and sender, with `{price}` and `{goal}` filled in. Everything
 * customer-facing (audit PDF, checkout page, emails) goes through this, so a
 * price change in Settings updates the button, the micro-copy and the
 * checkout together.
 */
import { config } from './config.js';
import { VARIANTS, goalPhrase } from './guarantee.js';

const fill = (s, price, goal) => String(s ?? '')
  .replace(/\{price\}/g, price)
  .replace(/\{goal\}/g, goal);

/**
 * One version of the offer, ready to show.
 * @param {'a'|'b'} variant
 * @param {object|null} goal  version B's Day 90 target, from mapGoal()
 */
export function resolvedOffer(variant = 'a', goal = null, o = config.offer) {
  const key = VARIANTS.includes(variant) ? variant : 'a';
  const v = o.variants[key];
  const g = goalPhrase(goal);
  const guarantee = fill(v.guarantee, o.price, g);
  // "Title: body" -> a bold heading and its sentence, from one setting.
  const cut = guarantee.indexOf(':');
  return {
    name: o.name,
    price: o.price,
    variant: key,
    variantLabel: v.label,
    test: o.test,
    cta: fill(v.cta, o.price, g),
    microcopy: fill(v.microcopy, o.price, g),
    guarantee,
    guaranteeTitle: cut > 0 ? guarantee.slice(0, cut).trim() : '',
    guaranteeBody: cut > 0 ? guarantee.slice(cut + 1).trim() : guarantee,
    terms: fill(v.terms, o.price, g),
    goal: key === 'b' ? goal || null : null,
    deliverablesHeading: o.deliverablesHeading,
    deliverables: (o.deliverables || []).map((d) => ({ title: fill(d.title, o.price, g), text: fill(d.text, o.price, g) })),
  };
}

/** Both versions, unfilled goal, for pages that pick the version themselves. */
export function offerTemplates(o = config.offer) {
  return Object.fromEntries(VARIANTS.map((k) => {
    const r = resolvedOffer(k, null, o);
    // Keep {goal} for the checkout page, which knows the prospect's target.
    return [k, { ...r, guaranteeTemplate: fill(o.variants[k].guarantee, o.price, '{goal}') }];
  }));
}

/** The Stripe link for a version. A has no fallback: its link carries the trial. */
export function stripeUrlFor(variant) {
  return variant === 'a' ? config.stripeCheckoutUrlA || '' : config.stripeCheckoutUrl || '';
}

export function resolvedSender(s = config.sender) {
  return {
    company: s.company,
    name: s.name,
    cityState: s.cityState,
    postalAddress: s.postalAddress,
    email: s.email,
    phone: s.phone,
    /** True once the one CAN-SPAM requirement we cannot default is met. */
    canSpamAddressReady: Boolean(s.postalAddress && /\d/.test(s.postalAddress)),
    /** 555-0100..0199 are reserved for fiction; no call will ever connect. */
    phoneIsFictional: /\b555[-.\s]?01\d\d\b/.test(s.phone || ''),
  };
}

/** Public links for one audit. The short one is the printable fallback. */
export function auditLinks(slug, params = {}) {
  const base = String(config.publicBaseUrl || '').trim().replace(/\/+$/, '');
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  return {
    activate: `${base}/audit/${encodeURIComponent(slug)}/activate${qs.toString() ? `?${qs}` : ''}`,
    short: `${base.replace(/^https?:\/\//, '')}/audit/${slug}`,
  };
}
