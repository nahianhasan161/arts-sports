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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btn} sp-shuttle`}
          onClick={() => {
            if (navigator.share) void navigator.share({ title, url: url() }).catch(() => {});
            else open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`);
          }}
        >
          <Share2 className="w-3.5 h-3.5" /> {t("store.share.share")}
        </button>
        <button type="button" className="sp-ico sp-lg sp-volley" onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`)} aria-label={t("store.share.facebook")}>
          <span className="font-black text-[13px] leading-none">f</span>
        </button>
        <button
          type="button"
          className="sp-ico sp-lg sp-basket"
          aria-label={t("store.share.messenger")}
          onClick={() => {
            const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
            open(mobile ? `fb-messenger://share/?link=${encodeURIComponent(url())}` : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`);
          }}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="sp-ico sp-lg sp-tennis" onClick={() => open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url()}`)}`)} aria-label={t("store.share.whatsapp")}>
          <MessageCircle className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className="sp-ico sp-lg sp-leather"
          aria-label={t(copied ? "store.share.copied" : "store.share.copy")}
          onClick={() => {
            void navigator.clipboard?.writeText(url()).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
        </button>
      </div>
      {(ask || MESSENGER_PAGE) && (
        <div className="flex flex-wrap gap-2">
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
        </div>
      )}
    </div>
  );
}
