-- Spendings (expenses): money the business spends that is not a supplier purchase:
-- rent, salaries, electricity, ads, courier charges, packaging, transport, tea...
-- The business report (/admin/{online,offline}/reports) takes them off the profit.
--
-- Supplier purchases stay in stock_receipts / fabric_moves / accessory_moves and
-- production batches; they are stock, not spendings, and must not be added here.
--
-- A wrong row is never deleted: it is voided with a reason (same rule as purchase corrections).
-- Needs nothing new; showroom ids are the `showrooms` table. Safe to run again.

CREATE TABLE IF NOT EXISTS public.expenses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    -- The Bangladesh day the money was spent.
    spent_on DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::DATE),
    -- Key from lib/admin/expenses.ts (rent, salary, utilities, marketing, delivery,
    -- packaging, transport, food, repair, other). Checked in the API, so the list can grow.
    category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 40),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    method TEXT NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'bkash', 'nagad', 'bank', 'card', 'other')),
    -- Which side of the business it belongs to: the website, the shop, or both.
    place TEXT NOT NULL DEFAULT 'both' CHECK (place IN ('online', 'shop', 'both')),
    showroom_id TEXT,
    note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at TIMESTAMPTZ,
    voided_by UUID,
    void_reason TEXT,
    CONSTRAINT expenses_void_reason CHECK (voided_at IS NULL OR char_length(btrim(COALESCE(void_reason, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS expenses_spent_on_idx ON public.expenses (spent_on DESC) WHERE voided_at IS NULL;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expenses FROM anon, authenticated;
GRANT ALL ON public.expenses TO service_role;

-- Who added / voided a row shows in the audit log like every other money table.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
        DROP TRIGGER IF EXISTS audit_expenses ON public.expenses;
        CREATE TRIGGER audit_expenses
            AFTER INSERT OR UPDATE OR DELETE ON public.expenses
            FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
    END IF;
END $$;
