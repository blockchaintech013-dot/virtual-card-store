/**
 * Telegram Web Apps SDK bridge.
 *
 * INTEGRATION POINT (bot side):
 *   1. In BotFather: /newapp -> point the Mini App URL at this deployment.
 *   2. In the bot, send a button:
 *        reply_markup: { inline_keyboard: [[{ text: "Open Store",
 *          web_app: { url: "https://<your-app>/" } }]] }
 *   3. The bot receives `web_app_data` when we call tg.sendData(...) on checkout.
 *
 * TESTING: outside Telegram, window.Telegram is undefined and we fall back to a
 * mock user so the prototype stays fully usable in a normal browser.
 */

export type TgUser = {
  id: number;
  username: string;
  first_name: string;
  language_code: string;
  mock: boolean;
};

type TelegramWebApp = {
  initDataUnsafe?: { user?: Partial<TgUser> };
  ready: () => void;
  expand: () => void;
  close: () => void;
  sendData: (data: string) => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  HapticFeedback?: { impactOccurred: (s: string) => void };
  MainButton?: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
};

export function getTelegram(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp ?? null;
}

export function initTelegram(): TgUser {
  const tg = getTelegram();
  if (!tg) {
    return {
      id: 1000001,
      username: "demo_user",
      first_name: "Demo",
      language_code: typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en",
      mock: true,
    };
  }
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.("#0b1220");
  tg.setBackgroundColor?.("#0b1220");
  const u = tg.initDataUnsafe?.user;
  return {
    id: u?.id ?? 0,
    username: u?.username ?? "telegram_user",
    first_name: u?.first_name ?? "Friend",
    language_code: u?.language_code ?? "en",
    mock: false,
  };
}

export function haptic() {
  getTelegram()?.HapticFeedback?.impactOccurred("light");
}

/** Sends the purchase summary back to the bot chat (never card secrets). */
export function sendToBot(payload: Record<string, unknown>) {
  getTelegram()?.sendData(JSON.stringify({ v: 1, ...payload }));
}

export function closeApp() {
  const tg = getTelegram();
  if (tg) tg.close();
}
