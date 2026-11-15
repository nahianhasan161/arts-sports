import { GUIDE } from "@/components/admin/help/guide";
import { HelpList } from "@/components/admin/help/HelpList";

/** The shop guide: the register step by step, then stock, branches and customers. Open to all shop staff. */
export default function ShopHelpPage() {
  return <HelpList topics={GUIDE.filter((g) => g.area === "store" || g.area === "both")} first="pos-open" />;
}
