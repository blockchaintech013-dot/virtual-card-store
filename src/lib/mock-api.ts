/**
 * SIMULATED BACKEND (no network, no database).
 *
 * Each function mirrors the real endpoint you would implement server-side:
 *   fetchCatalog      -> GET  /api/v1/catalog
 *   fetchUserSettings -> GET  /api/v1/user/settings
 *   updateCart        -> POST /api/v1/cart
 *   createCheckout    -> POST /api/v1/checkout        (Telegram Payments invoice)
 *   confirmPurchase   -> POST /api/v1/checkout/:id/confirm
 *   issueCardToken    -> POST /api/v1/cards/issue     (returns tokenized PAN)
 *
 * All responses are versioned: { v: 1, ... }. Nothing sensitive is logged.
 */

export type Card = {
  id: string;
  name: string;
  currency: "USD" | "EUR" | "GBP";
  issuer: string;
  issuerFlag: string;
  price: number;
  fee: number;
  limit: number;
  expiryMonths: number;
  featured?: boolean;
  perks: string[];
};

export type CartLine = {
  cardId: string;
  qty: number;
  limit: number;
  lock: string;
};

export type Purchase = {
  v: 1;
  orderId: string;
  paidAt: string;
  total: number;
  items: { name: string; qty: number; price: number }[];
};

export type IssuedCard = {
  v: 1;
  token: string;
  masked: string;
  pan: string;
  cvv: string;
  expiry: string;
  holder: string;
};

const CATALOG: Card[] = [
  {
    id: "usd-flex",
    name: "Flex USD",
    currency: "USD",
    issuer: "United States",
    issuerFlag: "🇺🇸",
    price: 12,
    fee: 1.5,
    limit: 2000,
    expiryMonths: 36,
    featured: true,
    perks: ["Instant issue", "Works with subscriptions", "3D-Secure"],
  },
  {
    id: "eur-lite",
    name: "Lite EUR",
    currency: "EUR",
    issuer: "Lithuania",
    issuerFlag: "🇱🇹",
    price: 8,
    fee: 1.0,
    limit: 1000,
    expiryMonths: 24,
    perks: ["SEPA friendly", "Low fee"],
  },
  {
    id: "usd-pro",
    name: "Pro USD",
    currency: "USD",
    issuer: "United States",
    issuerFlag: "🇺🇸",
    price: 29,
    fee: 0.9,
    limit: 10000,
    expiryMonths: 48,
    perks: ["High limit", "Priority support", "Multi-merchant"],
  },
  {
    id: "gbp-travel",
    name: "Travel GBP",
    currency: "GBP",
    issuer: "United Kingdom",
    issuerFlag: "🇬🇧",
    price: 17,
    fee: 1.2,
    limit: 5000,
    expiryMonths: 36,
    perks: ["No FX markup", "Travel category unlocked"],
  },
  {
    id: "eur-ads",
    name: "Ads EUR",
    currency: "EUR",
    issuer: "Germany",
    issuerFlag: "🇩🇪",
    price: 21,
    fee: 1.1,
    limit: 7500,
    expiryMonths: 36,
    perks: ["Optimised for ad platforms", "Auto top-up"],
  },
  {
    id: "usd-gift",
    name: "Gift USD",
    currency: "USD",
    issuer: "United States",
    issuerFlag: "🇺🇸",
    price: 5,
    fee: 2.0,
    limit: 250,
    expiryMonths: 12,
    perks: ["Single-use friendly", "Shareable"],
  },
];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchCatalog() {
  await wait(250);
  return { v: 1 as const, items: CATALOG };
}

export async function fetchUserSettings(userId: number) {
  await wait(80);
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(`vcc:prefs:${userId}`) : null;
  return { v: 1 as const, prefs: raw ? (JSON.parse(raw) as Record<string, string>) : {} };
}

export async function saveUserSettings(userId: number, prefs: Record<string, string>) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(`vcc:prefs:${userId}`, JSON.stringify(prefs));
  }
  return { v: 1 as const, ok: true };
}

export async function updateCart(lines: CartLine[]) {
  await wait(60);
  return { v: 1 as const, lines };
}

/** Tiered pricing: 3+ units -> 10% off, 5+ -> 18% off. */
export function tierFactor(qty: number) {
  if (qty >= 5) return 0.82;
  if (qty >= 3) return 0.9;
  return 1;
}

export function lineTotal(card: Card, line: CartLine) {
  return (card.price + card.fee) * line.qty * tierFactor(line.qty);
}

export const PROMOS: Record<string, number> = { TELEGRAM10: 0.1, VCC20: 0.2 };

export async function createCheckout(total: number) {
  await wait(400);
  return { v: 1 as const, checkoutId: `chk_${Math.random().toString(36).slice(2, 10)}`, total };
}

export async function confirmPurchase(
  checkoutId: string,
  total: number,
  items: Purchase["items"],
): Promise<Purchase> {
  await wait(1100);
  return {
    v: 1,
    orderId: checkoutId.replace("chk_", "ord_"),
    paidAt: new Date().toISOString(),
    total,
    items,
  };
}

function digits(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export async function issueCardToken(holder: string, months: number): Promise<IssuedCard> {
  await wait(600);
  const pan = `4${digits(3)} ${digits(4)} ${digits(4)} ${digits(4)}`;
  const exp = new Date();
  exp.setMonth(exp.getMonth() + months);
  return {
    v: 1,
    token: `tok_${Math.random().toString(36).slice(2, 14)}`,
    masked: `•••• •••• •••• ${pan.slice(-4)}`,
    pan,
    cvv: digits(3),
    expiry: `${String(exp.getMonth() + 1).padStart(2, "0")}/${String(exp.getFullYear()).slice(2)}`,
    holder: holder.toUpperCase(),
  };
}

/** Lightweight analytics buffer, export-ready for the bot. */
export type AnalyticsEvent = { name: string; ts: number; props?: Record<string, unknown> | undefined };
const events: AnalyticsEvent[] = [];
export function track(name: string, props?: Record<string, unknown>) {
  events.push({ name, ts: Date.now(), props });
}
export function exportEvents() {
  return { v: 1 as const, events: [...events] };
}
