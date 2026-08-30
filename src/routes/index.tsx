import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  ShoppingCart,
  Share2,
  Eye,
  FileText,
  Check,
  Loader2,
  ArrowLeft,
  Lock,
  Contrast,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type Card as CardType,
  type CartLine,
  type IssuedCard,
  type Purchase,
  PROMOS,
  confirmPurchase,
  createCheckout,
  exportEvents,
  fetchCatalog,
  fetchUserSettings,
  issueCardToken,
  lineTotal,
  saveUserSettings,
  tierFactor,
  track,
  updateCart,
} from "@/lib/mock-api";
import { LANGS, type Lang, detectLang, t } from "@/lib/i18n";
import { closeApp, getTelegram, haptic, initTelegram, sendToBot, type TgUser } from "@/lib/telegram";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VaultCard — Virtual Cards Telegram Mini App" },
      {
        name: "description",
        content:
          "Buy virtual USD, EUR and GBP cards inside Telegram. Instant issue, spending limits and simulated secure checkout.",
      },
      { property: "og:title", content: "VaultCard — Virtual Cards Telegram Mini App" },
      {
        property: "og:description",
        content: "Instant virtual credit cards, bought and issued without leaving Telegram.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MiniApp,
});

const money = (n: number, c = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);

function MiniApp() {
  const [user, setUser] = useState<TgUser | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [highContrast, setHighContrast] = useState(false);
  const [catalog, setCatalog] = useState<CardType[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [currency, setCurrency] = useState("all");
  const [issuer, setIssuer] = useState("all");
  const [maxPrice, setMaxPrice] = useState(40);
  const [preview, setPreview] = useState<CardType | null>(null);
  const [termsOf, setTermsOf] = useState<CardType | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [promo, setPromo] = useState("");
  const [discount, setDiscount] = useState(0);
  const [stage, setStage] = useState<"store" | "paying" | "done">("store");
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [issued, setIssued] = useState<IssuedCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [showTour, setShowTour] = useState(false);

  const L = (k: Parameters<typeof t>[1]) => t(lang, k);

  // --- Telegram bootstrap + prefill from saved preferences -------------------
  useEffect(() => {
    const u = initTelegram();
    setUser(u);
    setLang(detectLang(u.language_code));
    track("app_open", { mock: u.mock });
    fetchCatalog().then((r) => setCatalog(r.items));
    fetchUserSettings(u.id).then((r) => {
      if (r.prefs.lang) setLang(r.prefs.lang as Lang);
      if (r.prefs.contrast === "1") setHighContrast(true);
      if (!r.prefs.seenTour) setShowTour(true);
    });
    if (u.mock) toast.info(t(detectLang(u.language_code), "offline"));
  }, []);

  useEffect(() => {
    if (!user) return;
    saveUserSettings(user.id, { lang, contrast: highContrast ? "1" : "0", seenTour: "1" });
  }, [lang, highContrast, user]);

  useEffect(() => {
    document.documentElement.classList.toggle("contrast-high", highContrast);
  }, [highContrast]);

  // --- Telegram MainButton mirrors the checkout CTA -------------------------
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  useEffect(() => {
    const mb = getTelegram()?.MainButton;
    if (!mb) return;
    if (cartCount > 0 && stage === "store") {
      mb.setText(`${L("checkout")} · ${cartCount}`);
      mb.show();
    } else mb.hide();
    const cb = () => setCartOpen(true);
    mb.onClick(cb);
    return () => mb.offClick(cb);
  }, [cartCount, stage, lang]);

  const issuers = useMemo(() => Array.from(new Set(catalog.map((c) => c.issuer))), [catalog]);
  const featured = catalog.find((c) => c.featured);
  const filtered = catalog.filter(
    (c) =>
      (currency === "all" || c.currency === currency) &&
      (issuer === "all" || c.issuer === issuer) &&
      c.price <= maxPrice,
  );

  const subtotal = cart.reduce((s, l) => {
    const card = catalog.find((c) => c.id === l.cardId);
    return card ? s + lineTotal(card, l) : s;
  }, 0);
  const total = Math.max(0, subtotal * (1 - discount));

  function addToCart(card: CardType) {
    haptic();
    track("add_to_cart", { cardId: card.id });
    setCart((prev) => {
      const next = prev.some((l) => l.cardId === card.id)
        ? prev.map((l) => (l.cardId === card.id ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, { cardId: card.id, qty: 1, limit: card.limit, lock: "none" }];
      updateCart(next);
      return next;
    });
    toast.success(`${card.name} → ${L("cart")}`);
  }

  function setLine(cardId: string, patch: Partial<CartLine>) {
    setCart((prev) => {
      const next = prev
        .map((l) => (l.cardId === cardId ? { ...l, ...patch } : l))
        .filter((l) => l.qty > 0);
      updateCart(next);
      return next;
    });
  }

  function applyPromo() {
    const d = PROMOS[promo.trim().toUpperCase()];
    if (d) {
      setDiscount(d);
      toast.success(`${L("promoOk")} · -${Math.round(d * 100)}%`);
    } else {
      setDiscount(0);
      toast.error(L("promoBad"));
    }
  }

  async function pay() {
    if (!consent) {
      toast.error(L("consentError"));
      return;
    }
    setStage("paying");
    track("checkout_start", { total });
    const chk = await createCheckout(total);
    const items = cart.map((l) => {
      const c = catalog.find((x) => x.id === l.cardId)!;
      return { name: c.name, qty: l.qty, price: lineTotal(c, l) };
    });
    const p = await confirmPurchase(chk.checkoutId, total, items);
    const cards: IssuedCard[] = [];
    for (const l of cart) {
      const c = catalog.find((x) => x.id === l.cardId)!;
      for (let i = 0; i < l.qty; i++) cards.push(await issueCardToken(user?.first_name ?? "USER", c.expiryMonths));
    }
    setPurchase(p);
    setIssued(cards);
    setStage("done");
    setCartOpen(false);
    track("purchase_success", { orderId: p.orderId, total });
    // INTEGRATION POINT: bot receives web_app_data with the order summary only.
    sendToBot({ type: "purchase", orderId: p.orderId, total: p.total, cards: cards.length });
  }

  function reset() {
    setCart([]);
    setPurchase(null);
    setIssued([]);
    setRevealed(false);
    setDiscount(0);
    setPromo("");
    setConsent(false);
    setStage("store");
  }

  if (stage === "done" && purchase) {
    return (
      <Receipt
        L={L}
        purchase={purchase}
        issued={issued}
        revealed={revealed}
        toggleReveal={() => setRevealed((r) => !r)}
        onBack={reset}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background pb-28">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="bg-hero px-4 pb-8 pt-6 shadow-soft">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <CreditCard className="size-6 text-primary" aria-hidden />
              {L("store")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{L("subtitle")}</p>
            {user && (
              <p className="mt-2 text-xs text-muted-foreground">
                @{user.username} · ID {user.id}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Toggle high contrast"
              onClick={() => setHighContrast((v) => !v)}
            >
              <Contrast className="size-4" />
            </Button>
            <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <SelectTrigger className="w-[92px]" aria-label="Language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {showTour && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm"
          >
            <span aria-hidden>💡</span>
            <p className="flex-1 text-muted-foreground">{L("tour")}</p>
            <button className="text-xs text-primary underline" onClick={() => setShowTour(false)}>
              ✕
            </button>
          </div>
        )}

        {/* Featured */}
        {featured && (
          <section aria-labelledby="featured-h" className="space-y-3">
            <h2 id="featured-h" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {L("featured")}
            </h2>
            <div className="bg-card-gradient shadow-glow relative overflow-hidden rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-foreground/80">
                  {featured.currency} · {featured.issuerFlag} {featured.issuer}
                </span>
                <CreditCard className="size-5 opacity-80" aria-hidden />
              </div>
              <p className="mt-8 font-mono text-lg tracking-[0.25em]">•••• •••• •••• 4242</p>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-xl font-bold">{featured.name}</p>
                  <p className="text-xs text-foreground/80">
                    {L("limitLabel")} {money(featured.limit, featured.currency)} · {L("expiry")}{" "}
                    {featured.expiryMonths}m
                  </p>
                </div>
                <Button size="sm" onClick={() => addToCart(featured)}>
                  {money(featured.price)} · {L("add")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Filters */}
        <section aria-labelledby="filters-h" className="rounded-xl border border-border bg-card p-4">
          <h2 id="filters-h" className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {L("filters")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-cur">{L("type")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="f-cur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L("all")}</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-iss">{L("issuer")}</Label>
              <Select value={issuer} onValueChange={setIssuer}>
                <SelectTrigger id="f-iss">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{L("all")}</SelectItem>
                  {issuers.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="f-price">
                {L("price")}: {money(maxPrice)}
              </Label>
              <Slider
                id="f-price"
                min={5}
                max={40}
                step={1}
                value={[maxPrice]}
                onValueChange={([v]) => setMaxPrice(v)}
              />
            </div>
          </div>
        </section>

        {/* Catalog */}
        <section aria-labelledby="catalog-h" className="space-y-3">
          <h2 id="catalog-h" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {L("catalog")} ({filtered.length})
          </h2>
          <ul className="grid gap-3">
            {filtered.map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {c.name} <Badge variant="secondary">{c.currency}</Badge>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.issuerFlag} {c.issuer} · {L("limitLabel")} {money(c.limit, c.currency)} ·{" "}
                      {L("expiry")} {c.expiryMonths}m · {L("fee")} {money(c.fee)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.perks.join(" • ")}</p>
                  </div>
                  <p className="shrink-0 text-lg font-bold text-primary">{money(c.price)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => addToCart(c)}>
                    <ShoppingCart className="size-4" /> {L("add")}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setPreview(c)}>
                    <Eye className="size-4" /> {L("preview")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTermsOf(c)}>
                    <FileText className="size-4" /> {L("terms")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard?.writeText(`${c.name} — ${money(c.price)}`);
                      toast.success(L("share"));
                      track("share", { cardId: c.id });
                    }}
                  >
                    <Share2 className="size-4" /> {L("share")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          <a href="#terms" className="underline">
            Terms of Service
          </a>{" "}
          ·{" "}
          <a href="#privacy" className="underline">
            Privacy Policy
          </a>{" "}
          · {exportEvents().events.length} analytics events buffered
        </p>
      </div>

      {/* Sticky cart bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex-1 text-sm">
            <p className="text-muted-foreground">
              {L("cart")}: {cartCount}
            </p>
            <p className="font-semibold">{money(total)}</p>
          </div>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button disabled={cartCount === 0}>
                <ShoppingCart className="size-4" /> {L("checkout")}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>{L("cart")}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                {cart.length === 0 && <p className="text-sm text-muted-foreground">{L("empty")}</p>}
                {cart.map((l) => {
                  const c = catalog.find((x) => x.id === l.cardId)!;
                  return (
                    <div key={l.cardId} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">
                          {c.name} <span className="text-xs text-muted-foreground">{c.currency}</span>
                        </p>
                        <p className="font-semibold">{money(lineTotal(c, l))}</p>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Label className="text-xs">{L("qty")}</Label>
                        <Button
                          size="icon"
                          variant="secondary"
                          aria-label="decrease"
                          onClick={() => setLine(l.cardId, { qty: l.qty - 1 })}
                        >
                          −
                        </Button>
                        <span className="w-6 text-center">{l.qty}</span>
                        <Button
                          size="icon"
                          variant="secondary"
                          aria-label="increase"
                          onClick={() => setLine(l.cardId, { qty: l.qty + 1 })}
                        >
                          +
                        </Button>
                        {tierFactor(l.qty) < 1 && (
                          <Badge>-{Math.round((1 - tierFactor(l.qty)) * 100)}%</Badge>
                        )}
                      </div>
                      <div className="mt-3 space-y-2">
                        <Label className="text-xs">
                          {L("limit")}: {money(l.limit, c.currency)}
                        </Label>
                        <Slider
                          min={50}
                          max={c.limit}
                          step={50}
                          value={[l.limit]}
                          onValueChange={([v]) => setLine(l.cardId, { limit: v })}
                        />
                        {l.limit > c.limit && (
                          <p className="text-xs text-destructive">Limit exceeds plan maximum.</p>
                        )}
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <Label className="text-xs">{L("lock")}</Label>
                        <Select value={l.lock} onValueChange={(v) => setLine(l.cardId, { lock: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No lock</SelectItem>
                            <SelectItem value="subscriptions">Subscriptions only</SelectItem>
                            <SelectItem value="ads">Ad platforms only</SelectItem>
                            <SelectItem value="travel">Travel only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}

                {cart.length > 0 && (
                  <>
                    <div className="flex gap-2">
                      <Input
                        value={promo}
                        maxLength={20}
                        onChange={(e) => setPromo(e.target.value)}
                        placeholder={L("promo")}
                        aria-label={L("promo")}
                      />
                      <Button variant="secondary" onClick={applyPromo}>
                        {L("apply")}
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-lg font-bold">
                      <span>{L("total")}</span>
                      <span className="text-primary">{money(total)}</span>
                    </div>
                    <label className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Checkbox
                        checked={consent}
                        onCheckedChange={(v) => setConsent(Boolean(v))}
                        aria-label={L("consent")}
                      />
                      <span>{L("consent")}</span>
                    </label>
                    <Button className="w-full" disabled={stage === "paying"} onClick={pay}>
                      {stage === "paying" ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> {L("processing")}
                        </>
                      ) : (
                        <>
                          <Lock className="size-4" /> {L("payNow")} · {money(total)}
                        </>
                      )}
                    </Button>
                    <p className="text-center text-[11px] text-muted-foreground">
                      Simulated Telegram Payments invoice — no real charge, no card data stored.
                    </p>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="bg-card-gradient rounded-2xl p-5 shadow-glow">
                <p className="text-xs uppercase tracking-widest">{preview.currency}</p>
                <p className="mt-6 font-mono tracking-[0.25em]">•••• •••• •••• ••••</p>
                <p className="mt-3 text-xs">
                  {preview.issuerFlag} {preview.issuer}
                </p>
              </div>
              <ul className="list-inside list-disc text-sm text-muted-foreground">
                {preview.perks.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <Button className="w-full" onClick={() => (addToCart(preview), setPreview(null))}>
                {L("add")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Terms dialog */}
      <Dialog open={!!termsOf} onOpenChange={() => setTermsOf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{L("terms")} — {termsOf?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Prototype terms: cards are simulated and cannot be used for real transactions. Issuing
            fee {termsOf && money(termsOf.fee)} applies per card. Limits are enforced by the issuer;
            refunds are available within 24h of issuance.
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Receipt({
  L,
  purchase,
  issued,
  revealed,
  toggleReveal,
  onBack,
}: {
  L: (k: Parameters<typeof t>[1]) => string;
  purchase: Purchase;
  issued: IssuedCard[];
  revealed: boolean;
  toggleReveal: () => void;
  onBack: () => void;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <Toaster position="top-center" />
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Check className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold">{L("paid")}</h1>
            <p className="text-xs text-muted-foreground">
              {L("receipt")} {purchase.orderId} · {new Date(purchase.paidAt).toLocaleString()}
            </p>
          </div>
        </div>

        <section className="rounded-xl border border-border bg-card p-4">
          {purchase.items.map((i) => (
            <div key={i.name} className="flex justify-between py-1 text-sm">
              <span>
                {i.name} × {i.qty}
              </span>
              <span>{money(i.price)}</span>
            </div>
          ))}
          <Separator className="my-2" />
          <div className="flex justify-between font-bold">
            <span>{L("total")}</span>
            <span className="text-primary">{money(purchase.total)}</span>
          </div>
        </section>

        <section className="space-y-3">
          {issued.map((c) => (
            <div key={c.token} className="bg-card-gradient rounded-2xl p-5 shadow-glow">
              <p className="text-xs uppercase tracking-widest">VaultCard</p>
              <p className="mt-6 font-mono text-lg tracking-[0.2em]">
                {revealed ? c.pan : c.masked}
              </p>
              <div className="mt-4 flex items-end justify-between text-xs">
                <span>{c.holder}</span>
                <span>
                  {L("expiry")} {revealed ? c.expiry : "••/••"} · CVV {revealed ? c.cvv : "•••"}
                </span>
              </div>
              <p className="mt-2 text-[10px] opacity-70">token {c.token}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={toggleReveal}>
              <Eye className="size-4" /> {revealed ? L("hide") : L("reveal")}
            </Button>
            {revealed && (
              <Button
                variant="ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(issued[0]?.pan ?? "");
                  toast.success("Copied");
                }}
              >
                <Copy className="size-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{L("nextSteps")}</p>
        </section>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={closeApp}>
            {L("backToChat")}
          </Button>
          <Button variant="secondary" onClick={onBack}>
            <ArrowLeft className="size-4" /> {L("store")}
          </Button>
        </div>
      </div>
    </main>
  );
}
