/**
 * Spendings (table `expenses`, SQL 20261128100000_expenses.sql): what the
 * business spends that is not a supplier purchase. The names are in
 * admin.report.cat.* / admin.report.method.* / admin.report.place.*.
 * Safe for the browser: no server imports.
 */
export const EXPENSE_CATEGORIES = [
  "rent",
  "salary",
  "utilities",
  "marketing",
  "delivery",
  "packaging",
  "transport",
  "food",
  "repair",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_METHODS = ["cash", "bkash", "nagad", "bank", "card", "other"] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

/** Which side of the business a spending belongs to. */
export const EXPENSE_PLACES = ["both", "online", "shop"] as const;
export type ExpensePlace = (typeof EXPENSE_PLACES)[number];

export interface ExpenseRow {
  id: string;
  spent_on: string;
  category: string;
  amount: number;
  method: string;
  place: ExpensePlace;
  showroom_id: string | null;
  note: string | null;
  by: string;
  created_at: string;
}

export const isCategory = (v: unknown): v is ExpenseCategory => typeof v === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(v);
export const isMethod = (v: unknown): v is ExpenseMethod => typeof v === "string" && (EXPENSE_METHODS as readonly string[]).includes(v);
export const isPlace = (v: unknown): v is ExpensePlace => typeof v === "string" && (EXPENSE_PLACES as readonly string[]).includes(v);

/** A Postgres / PostgREST error that means "the table is not there yet". */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "");
}
