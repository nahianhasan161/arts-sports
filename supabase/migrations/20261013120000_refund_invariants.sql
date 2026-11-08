-- Migration: enforce the refund invariants in the database.
--
-- The refunds aggregate is only worth having if its numbers cannot lie, so the
-- arithmetic and the quantity limits are checked by triggers rather than by the
-- application -- the application is what allowed three code paths to write
-- refunds with no shared check.
--
-- What the triggers enforce:
--
--   * line_total is always unit_refund × quantity
--   * a refund's item_total, deductions_total and refund_total are always the
--     sums of its own rows, never whatever a caller supplied
--   * the quantity taken back cannot exceed what was ordered and not already
--     being returned elsewhere
--
-- The refundable-balance limit is deliberately NOT a trigger. It is checked in
-- execute_refund(), where it can raise an error that names the shortfall and
-- where it is covered by a test. It was first written here as a DEFERRABLE
-- constraint trigger, but that form only fires at commit, so a failed refund
-- reports its error after the whole statement has run and the caller cannot
-- tell which refund in a batch broke. A check in the RPC fails on the refund
-- that broke, inside the transaction that is rolled back with it.

-- ---------- line_total is always unit × quantity ----------
CREATE OR REPLACE FUNCTION public.fix_refund_item_line_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.line_total := ROUND(NEW.unit_refund * NEW.quantity, 2);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refund_items_fix_line_total ON public.refund_items;
CREATE TRIGGER refund_items_fix_line_total
    BEFORE INSERT OR UPDATE ON public.refund_items
    FOR EACH ROW EXECUTE FUNCTION public.fix_refund_item_line_total();

-- ---------- the returned-quantity guard ----------
-- One refund line cannot take back more units than were ordered and are not
-- already on their way back. Checked per order_item, so two returns against the
-- same line are caught, and excluding cancelled refunds means a cancelled
-- return frees the quantity again.
CREATE OR REPLACE FUNCTION public.enforce_refund_item_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_ordered   INTEGER;
    v_returned  INTEGER;
    v_available INTEGER;
BEGIN
    SELECT COALESCE(oi.quantity, 0)
    INTO v_ordered
    FROM public.order_items oi
    WHERE oi.id = NEW.order_item_id;

    IF v_ordered IS NULL THEN
        RAISE EXCEPTION 'refund_item_not_found: order item % does not exist', NEW.order_item_id
            USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(SUM(ri.quantity), 0)
    INTO v_returned
    FROM public.refund_items ri
    JOIN public.refunds r ON r.id = ri.refund_id
    WHERE ri.order_item_id = NEW.order_item_id
      -- Exclude the row being written, by its own id once it has one.
      AND ri.id IS DISTINCT FROM NEW.id
      AND r.status NOT IN ('cancelled', 'failed');

    v_available := v_ordered - v_returned;

    IF NEW.quantity > v_available THEN
        RAISE EXCEPTION 'refund_quantity_exceeds_ordered: ordered %, already returning %, requesting %',
            v_ordered, v_returned, NEW.quantity
            USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refund_items_quantity_guard ON public.refund_items;
CREATE TRIGGER refund_items_quantity_guard
    BEFORE INSERT OR UPDATE ON public.refund_items
    FOR EACH ROW EXECUTE FUNCTION public.enforce_refund_item_quantity();

-- ---------- derive the aggregate's totals from its own rows ----------
-- Called after any write to either child table, so item_total and
-- deductions_total are always the sums, and refund_total is always the
-- difference. A caller that supplies inconsistent figures is corrected rather
-- than trusted: the money paid out must equal what the rows describe.
CREATE OR REPLACE FUNCTION public.refresh_refund_totals(p_refund_id TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_items      NUMERIC;
    v_deductions NUMERIC;
BEGIN
    SELECT
        COALESCE((SELECT SUM(ri.line_total) FROM public.refund_items ri WHERE ri.refund_id = p_refund_id), 0),
        COALESCE((SELECT SUM(rd.amount) FROM public.refund_deductions rd WHERE rd.refund_id = p_refund_id), 0)
    INTO v_items, v_deductions;

    UPDATE public.refunds r
    SET
        item_total       = ROUND(v_items, 2),
        deductions_total = ROUND(v_deductions, 2),
        refund_total     = ROUND(GREATEST(v_items - v_deductions, 0), 2)
    WHERE r.id = p_refund_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_refund_totals_from_rows()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- NEW is null on a delete, OLD on a delete only; coalesce so both work.
    PERFORM public.refresh_refund_totals(COALESCE(NEW.refund_id, OLD.refund_id));
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS refund_items_refresh_totals ON public.refund_items;
CREATE TRIGGER refund_items_refresh_totals
    AFTER INSERT OR UPDATE OR DELETE ON public.refund_items
    FOR EACH ROW EXECUTE FUNCTION public.refresh_refund_totals_from_rows();

DROP TRIGGER IF EXISTS refund_deductions_refresh_totals ON public.refund_deductions;
CREATE TRIGGER refund_deductions_refresh_totals
    AFTER INSERT OR UPDATE OR DELETE ON public.refund_deductions
    FOR EACH ROW EXECUTE FUNCTION public.refresh_refund_totals_from_rows();

-- ---------- updated_at on any child write ----------
CREATE OR REPLACE FUNCTION public.touch_refund_parent_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.refunds SET updated_at = now()
    WHERE id = COALESCE(NEW.refund_id, OLD.refund_id);
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS refund_items_touch_parent ON public.refund_items;
CREATE TRIGGER refund_items_touch_parent
    AFTER INSERT OR UPDATE OR DELETE ON public.refund_items
    FOR EACH ROW EXECUTE FUNCTION public.touch_refund_parent_updated_at();
