import { GUIDE } from "@/components/admin/help/guide";
import { HelpList } from "@/components/admin/help/HelpList";

/** Step-by-step guides for every job in the panel. Open to all staff. */
export default function HelpPage() {
  return <HelpList topics={GUIDE} first="panel" />;
}
