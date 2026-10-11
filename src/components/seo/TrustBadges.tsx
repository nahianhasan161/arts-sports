import { Truck, Shield, RotateCcw, MapPin } from "lucide-react";

interface TrustBadgeProps {
  icon: React.ReactNode;
  label: string;
  detail: string;
}

function TrustBadge({ icon, label, detail }: TrustBadgeProps) {
  return (
    <div className="flex items-start gap-3 group">
      <div className="w-9 h-9 rounded-lg bg-surface-subtle flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-200 shrink-0">
        {icon}
      </div>
      <div>
        <p className="font-display text-sm font-bold text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

export function TrustBadges() {
  const badges = [
    {
      icon: <Truck className="w-4.5 h-4.5" />,
      label: "Free Delivery",
      detail: "Orders over ৳1,500",
    },
    {
      icon: <RotateCcw className="w-4.5 h-4.5" />,
      label: "14-Day Returns",
      detail: "Easy & hassle-free",
    },
    {
      icon: <Shield className="w-4.5 h-4.5" />,
      label: "Secure Checkout",
      detail: "256-bit SSL encrypted",
    },
    {
      icon: <MapPin className="w-4.5 h-4.5" />,
      label: "Cash on Delivery",
      detail: "Pay on delivery",
    },
  ];

  return (
    <section
      aria-label="Our guarantees"
      className="w-full bg-surface-card border-y border-border-light py-5 mt-space-2xl"
    >
      <div className="max-w-container-max mx-auto px-space-base">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {badges.map((b) => (
            <TrustBadge key={b.label} icon={b.icon} label={b.label} detail={b.detail} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function StickyMobileCTA() {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 md:hidden bg-primary text-white z-[90] shadow-lg border-t border-primary-container"
      role="status"
      aria-label="Mobile call to action"
    >
      <div className="max-w-container-max mx-auto px-3 py-2.5 flex items-center justify-between">
        <span className="font-display text-xs uppercase font-bold tracking-wider">
          Shop the collection
        </span>
        <a
          href="/shop"
          className="inline-flex items-center justify-center gap-1 px-4 py-2 bg-accent-gold text-primary font-display text-xs uppercase tracking-wider font-bold rounded hover:bg-secondary transition-colors"
        >
          Shop Now
        </a>
      </div>
    </div>
  );
}