/**
 * Where an admin address from before the online/offline split lives now, or
 * null when it is already a current one. Old bookmarks and printed receipt
 * QR codes (/admin/pos?receipt=…) keep working through this.
 * Used by the middleware, so it must not import anything heavy.
 */
export function legacyAdminPath(pathname: string): string | null {
  if (!pathname.startsWith("/admin/")) return null;
  const rest = pathname.slice("/admin/".length).replace(/\/+$/, "");
  const first = rest.split("/")[0];
  if (!first || first === "online" || first === "offline") return null;
  if (rest === "pos") return "/admin/offline/orders"; // only ever linked with ?receipt=
  if (first === "pos") return `/admin/offline/${rest}`;
  if (rest === "store") return "/admin/offline";
  if (first === "store") return `/admin/offline/${rest.slice("store/".length)}`;
  return `/admin/online/${rest}`;
}
