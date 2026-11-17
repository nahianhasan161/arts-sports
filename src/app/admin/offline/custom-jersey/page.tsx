import { CustomRegister } from "@/components/admin/pos/register/CustomRegister";

/** Custom jersey at the counter, in the register's layout: tiles, order slip, number pad, payment. */
export default function ShopCustomJerseyPage() {
  return (
    <div className="max-w-7xl mx-auto h-[calc(100dvh-12rem)] min-h-[600px] flex flex-col rounded-lg border border-border-light overflow-hidden">
      <CustomRegister />
    </div>
  );
}
