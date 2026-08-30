# VaultCard — Telegram Mini App (prototype)

A dark/blue Telegram Mini App prototype for selling virtual credit cards. **Everything is simulated** — no backend, no database, no real payments or card issuance.

## Files

| File | Purpose |
| --- | --- |
| `src/routes/index.tsx` | The whole Mini App UI (catalog, filters, cart, checkout, receipt) |
| `src/lib/telegram.ts` | Telegram Web Apps SDK bridge (`ready`, `expand`, `MainButton`, `sendData`, `close`) |
| `src/lib/mock-api.ts` | Simulated API: `fetchCatalog`, `fetchUserSettings`, `updateCart`, `createCheckout`, `confirmPurchase`, `issueCardToken` + analytics buffer |
| `src/lib/i18n.ts` | EN / ES / RU strings, auto-detected from `language_code` |
| `src/styles.css` | Dark navy design tokens, blue accents, high-contrast variant |

All simulated responses are versioned (`{ v: 1, ... }`).

## Deployment

1. Publish this project — you get an HTTPS URL (Telegram requires HTTPS).
2. BotFather → `/newapp` → select your bot → set the Mini App URL to that URL.
3. Optionally `/setmenubutton` → label **Open Store** → same URL.

## Bot side (launch flow)

```js
bot.sendMessage(chatId, "Buy a virtual card:", {
  reply_markup: {
    inline_keyboard: [[{ text: "Open Store", web_app: { url: MINI_APP_URL } }]],
  },
});

// After checkout the Mini App calls tg.sendData(...) and the bot receives:
bot.on("message", (msg) => {
  if (!msg.web_app_data) return;
  const { orderId, total, cards } = JSON.parse(msg.web_app_data.data);
  bot.sendMessage(msg.chat.id, `Order ${orderId} paid: ${total} for ${cards} card(s).`);
});
```

## Testing

- **In browser:** open the app directly. `window.Telegram` is absent, so a mock user (`@demo_user`) is used and a notice toast appears. Full flow works.
- **In Telegram:** open via the bot button. Real `user_id`, `username` and `language_code` are read from `initDataUnsafe`, the native MainButton mirrors the checkout CTA, and "Return to chat" closes the app.
- Promo codes to try: `TELEGRAM10` (-10%), `VCC20` (-20%). Tiered pricing kicks in at qty 3 (-10%) and 5 (-18%).

## Security considerations (for the real build)

- `initData` must be verified server-side with HMAC-SHA256 against the bot token — client identity is never trusted.
- Card PAN/CVV must come from the issuer over TLS, be shown once in a reveal panel, and never be persisted client-side or logged. This prototype generates random digits locally for demo purposes only.
- Real checkout should use the Telegram Payments API (`sendInvoice` + `pre_checkout_query`) with the provider token stored server-side.
- Only order metadata (never card secrets) is passed to the bot via `sendData`.
- Validate all inputs server-side; the client-side validation here is UX-only.

## Accessibility

Keyboard navigable with visible focus rings, labelled controls, ARIA landmarks/headings, and a high-contrast toggle in the header.
