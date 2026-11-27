"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { Check, Link2, MessageCircle, Send, Share2 } from "lucide-react";

const STORE_WHATSAPP = (process.env.NEXT_PUBLIC_STORE_WHATSAPP ?? "").replace(/\D/g, "");
const MESSENGER_PAGE = process.env.NEXT_PUBLIC_MESSENGER_PAGE ?? ""; // page username, e.g. artssportsbd

function storeWa(text: string) {
  const n = STORE_WHATSAPP.startsWith("880") ? STORE_WHATSAPP : STORE_WHATSAPP.startsWith("01") ? `88${STORE_WHATSAPP}` : "";
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/**
 * Share to Facebook, Messenger, WhatsApp or copy the link; the phone's own
 * share menu where there is one. Plus "ask us" buttons that open a chat with
 * the store with the product link already written.
 */
export function ShareButtons({ title, path }: { title: string; path: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const url = () => `${window.location.origin}${path}`;
  const open = (href: string) => window.open(href, "_blank", "noopener,noreferrer");
  const btn = "sp-btn inline-flex items-center justify-center gap-1.5 h-11 text-xs font-bold tracking-wider";

  const ask = storeWa(t("store.share.askText", { title }));

  const [menu, setMenu] = useState(false);
  const fb = () => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`);
  const item = "flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-on-surface hover:bg-surface-container text-left";

  // One quiet "Share" (the phone's own share sheet where there is one, a small
  // menu otherwise) instead of a row of five coloured buttons; the store chat
  // buttons, which sell, keep their place.
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ask && (
        <button type="button" className={`${btn} sp-tennis sp-wa`} onClick={() => open(`${ask}${url()}`)}>
          <MessageCircle className="w-3.5 h-3.5" /> {t("store.share.askWhatsapp")}
        </button>
      )}
      {MESSENGER_PAGE && (
        <button
          type="button"
          className={`${btn} sp-armband`}
          onClick={() => open(`https://m.me/${encodeURIComponent(MESSENGER_PAGE)}?text=${encodeURIComponent(`${title} ${url()}`)}`)}
        >
          <Send className="w-3.5 h-3.5" /> {t("store.share.askMessenger")}
        </button>
      )}
      <div className="relative">
        <button
          type="button"
          aria-expanded={menu}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border-light bg-surface-card px-4 text-xs font-bold text-on-surface hover:bg-surface-container"
          onClick={() => {
            if (navigator.share) void navigator.share({ title, url: url() }).catch(() => {});
            else setMenu((m) => !m);
          }}
        >
          <Share2 className="w-3.5 h-3.5" /> {t("store.share.share")}
        </button>
        {menu && (
          <div
            role="menu"
            className="absolute left-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border-light bg-surface-card py-1 shadow-xl"
            onMouseLeave={() => setMenu(false)}
          >
            <button type="button" role="menuitem" className={item} onClick={() => { fb(); setMenu(false); }}>
              <span className="w-4 text-center font-black text-[#1877f2]">f</span> {t("store.share.facebook")}
            </button>
            <button type="button" role="menuitem" className={item} onClick={() => { fb(); setMenu(false); }}>
              <Send className="w-4 h-4 text-[#0084ff]" /> {t("store.share.messenger")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => { open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url()}`)}`); setMenu(false); }}
            >
              <MessageCircle className="w-4 h-4 text-[#25d366]" /> {t("store.share.whatsapp")}
            </button>
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                void navigator.clipboard?.writeText(url()).then(() => {
                  setCopied(true);
                  setTimeout(() => { setCopied(false); setMenu(false); }, 1200);
                });
              }}
            >
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Link2 className="w-4 h-4" />}
              {t(copied ? "store.share.copied" : "store.share.copy")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
