-- Migration: close an unauthenticated read of every order, and add a
-- PII-free lookup so an order confirmation page can exist.
--
-- Both findings came from the launch audit's security review, and the first
-- is a live data exposure, not a theoretical one.
--
--   Finding 1 (critical): the "Users can view own orders" policy read
--
--       ((auth.uid() = user_id) OR (auth.uid() IS NULL))
--
--   The second arm is true for every visitor who is not signed in, so it
--   granted SELECT on the whole orders table to the public anon key — which
--   is, by design, in every browser bundle. Verified directly: a request
--   with only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY returned customer names,
--   phone numbers and street addresses. Any customer who ever checked out
--   had their contact details readable by anyone on the internet.
--
--   The arm was not doing anything useful. Orders are created by the
--   SECURITY DEFINER function create_order_with_reservations(), which
--   ignores RLS entirely, and read back by /api/account/orders, which
--   already requires a session and filters by user_id. So nothing needs the
--   anonymous read and it is removed.
--
--   Finding 2: an order confirmation page needs to show an order after a
--   reload. With RLS tightened there is no anonymous path to read one, and
--   giving one back would reintroduce the exposure. Instead a SECURITY
--   DEFINER function returns a deliberately PII-free projection: the order
--   reference, its state, the money, and what was bought. Name, phone,
--   email, street address and the customer's notes never leave the
--   database, so a confirmation URL that is shared or guessed leaks
--   nothing about the person who placed the order.

-- 1. Revoke the public read.
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;

CREATE POLICY "Users can view own orders"
    ON public.orders
    FOR SELECT
    USING (auth.uid() = user_id);

COMMENT ON POLICY "Users can view own orders" ON public.orders IS
    'Owner-only SELECT. The previous version ORed auth.uid() IS NULL, which made the whole table public to the anon key.';

-- 2. A confirmation lookup that cannot expose personal data.
CREATE OR REPLACE FUNCTION public.get_order_confirmation(p_order_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT jsonb_build_object(
        'order_id',              o.id,
        'status',                o.status,
        'created_at',            o.created_at,
        'payment_method',        o.payment_method,
        'city',                  o.city,
        'subtotal',              o.subtotal,
        'discount_total',        o.discount_total,
        'coupon_code',           o.coupon_code,
        'coupon_discount_total', o.coupon_discount_total,
        'shipping_fee',          o.shipping_fee,
        'total_amount',          o.total_amount,
        'items', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'title',       i.title,
                    'size',        i.size,
                    'color',       i.color,
                    'quantity',    i.quantity,
                    'unit_price',  i.unit_price,
                    'base_price',  i.base_price,
                    'image',       i.image
                )
                ORDER BY i.id
            )
            FROM public.order_items i
            WHERE i.order_id = o.id
        ), '[]'::jsonb)
    )
    FROM public.orders o
    WHERE o.id = p_order_id;
$$;

COMMENT ON FUNCTION public.get_order_confirmation(text) IS
    'PII-free order summary for the public confirmation page. Returns null for an unknown id. Never returns name, phone, email, address or notes.';

-- The function is SECURITY DEFINER, so the anon role must be able to call
-- it directly; without this the confirmation page gets nothing back.
GRANT EXECUTE ON FUNCTION public.get_order_confirmation(text) TO anon, authenticated;
