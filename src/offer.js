/**
 * The offer and sender, with `{price}` filled in. Everything customer-facing
 * (audit PDF, checkout page, emails) goes through this, so a price change in
 * Settings updates the button text, the micro-copy and the checkout together.
 */
import { config } from './config.js';

const fill = (s, price) => String(s ?? '').replace(/\{price\}/g, price);

export function resolvedOffer(o = config.offer) {
  return {
    name: o.name,
    price: o.price,
    cta: fill(o.cta, o.price),
    microcopy: fill(o.microcopy, o.price),
    checkoutMicrocopy: fill(o.checkoutMicrocopy, o.price),
    guarantee: fill(o.guarantee, o.price),
    goalPins: Number.isFinite(o.goalPins) && o.goalPins > 0 ? o.goalPins : 15,
    deliverablesHeading: o.deliverablesHeading,
    deliverables: (o.deliverables || []).map((d) => ({ title: fill(d.title, o.price), text: fill(d.text, o.price) })),
  };
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
