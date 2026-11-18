/* eslint-disable @next/next/no-img-element */
import { config } from "@/lib/config";
import type { ReceiptSettings } from "@/lib/pos/receipt-settings";

/** Shop block at the top of a printed receipt: logo, name, address, contacts. */
export function ReceiptShop({ s, branch, small, children }: { s: ReceiptSettings; branch?: { name?: string | null; address?: string | null } | null; small?: boolean; children?: React.ReactNode }) {
  const address = branch?.address || s.address;
  const contacts = [s.phone || config.business.phone, s.email, s.website].filter(Boolean).join(" · ");
  return (
    <div className="flex items-start gap-2">
      {s.show_logo && s.logo_url && <img src={s.logo_url} alt="" className={`${small ? "h-10 max-w-[28mm]" : "h-14 max-w-[40mm]"} object-contain`} />}
      <div>
        <p className={`font-bold ${small ? "text-base" : "text-xl"}`}>{s.shop_name || config.app.name}</p>
        {(branch?.name || address) && <p>{[branch?.name, address].filter(Boolean).join(", ")}</p>}
        {contacts && <p>{contacts}</p>}
        {children}
      </div>
    </div>
  );
}

/** Multi-line text (terms) as it was typed. */
export const Lines = ({ text, className }: { text: string; className?: string }) => <p className={`whitespace-pre-line ${className ?? ""}`}>{text}</p>;
