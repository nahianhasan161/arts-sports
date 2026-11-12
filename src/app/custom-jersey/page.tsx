import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getT, resolveLocale, LOCALE_COOKIE } from "@/i18n";
import { CustomJerseyForm } from "@/components/custom-jersey/CustomJerseyForm";

export const metadata: Metadata = {
  title: "Custom jersey — your own team kit",
  description:
    "Order a custom jersey from 1 piece. Upload your design or pick one of ours, choose the fabric, add names and numbers, and see the estimated price straight away.",
  alternates: { canonical: "/custom-jersey" },
};

export default async function CustomJerseyPage() {
  const t = getT(resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value));
  return (
    <div className="max-w-container-max mx-auto px-space-base py-space-xl">
      <h1 className="font-display text-3xl sm:text-4xl uppercase font-bold text-primary mb-2">{t("customJersey.title")}</h1>
      <p className="text-sm text-text-muted mb-space-lg max-w-2xl">{t("customJersey.subtitle")}</p>
      <CustomJerseyForm />
    </div>
  );
}
