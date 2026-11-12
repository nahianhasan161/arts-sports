import type { CustomOrderStatus } from "@/lib/custom-jersey/types";

/** Staff-facing names. The customer's wording is in the i18n messages. */
export const STATUS_LABEL: Record<CustomOrderStatus, string> = {
  submitted: "New",
  in_review: "In review",
  changes_needed: "Waiting for customer",
  mockup_sent: "Mockup sent",
  revision_requested: "Revision asked",
  approved: "Waiting for advance",
  queued: "Queue",
  cutting: "Cutting",
  printing: "Printing",
  sewing: "Sewing",
  qc: "QC",
  ready: "Ready",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Board columns, left to right. A column can hold more than one status. */
export const BOARD_COLUMNS: { title: string; statuses: CustomOrderStatus[]; next?: CustomOrderStatus }[] = [
  { title: "New", statuses: ["submitted"] },
  { title: "Review", statuses: ["in_review", "changes_needed"] },
  { title: "Mockup", statuses: ["mockup_sent", "revision_requested"] },
  { title: "Waiting for advance", statuses: ["approved"] },
  { title: "Queue", statuses: ["queued"], next: "cutting" },
  { title: "Cutting", statuses: ["cutting"], next: "printing" },
  { title: "Printing", statuses: ["printing"], next: "sewing" },
  { title: "Sewing", statuses: ["sewing"], next: "qc" },
  { title: "QC", statuses: ["qc"], next: "ready" },
  { title: "Ready", statuses: ["ready"] },
];

export const taka = (n: number) => `৳${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(n) || 0)}`;
