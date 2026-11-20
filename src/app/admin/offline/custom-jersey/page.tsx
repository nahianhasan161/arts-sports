import { redirect } from "next/navigation";

/** Custom jersey orders are taken in the register's custom-jersey mode; one panel only. */
export default function ShopCustomJerseyPage() {
  redirect("/admin/offline/pos?type=custom-jersey");
}
