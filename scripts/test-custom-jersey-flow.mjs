/**
 * End-to-end money test for custom jerseys, run against the live DB but
 * ALWAYS rolled back (the whole scenario is one DO block that ends by raising
 * the report as an exception, so nothing is ever committed).
 *
 *   fabric bought from a vendor (part paid)  -> stock + supplier due
 *   custom order approved, advance in two parts -> queued
 *   production batch (print shop + garments), fabric used + wastage -> cost per jersey
 *   balance paid -> order due 0
 *   supplier dues paid -> 0
 *   probes: using more fabric than in stock, paying more than the order total
 *
 *   drawer: cash taken at the counter counts in the drawer's expected cash
 *   guards: using more fabric than in stock, paying more than the order total,
 *           cash at the counter without an open drawer
 *
 * Usage: node --env-file=.env.local scripts/test-custom-jersey-flow.mjs [--with <migration.sql>]
 *   --with runs that migration first inside the same rolled-back transaction
 *   (to test a migration before applying it).
 */
import { readFileSync } from "fs";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF ?? "khebwqdhucrdfpfadxry";
if (!accessToken) {
  console.error("SUPABASE_ACCESS_TOKEN is not set.");
  process.exit(1);
}

const sql = String.raw`
DO $test$
DECLARE
    r JSONB := '{}'::jsonb;
    v_fab TEXT; v_sup TEXT; v_print TEXT; v_garm TEXT;
    v_order TEXT; v_pay TEXT; v_batch TEXT; v_move TEXT;
    v_res JSONB; v_status TEXT; v_num NUMERIC; v_txt TEXT;
    v_actor UUID; v_session TEXT;
    fails TEXT[] := '{}';
BEGIN
    -- A real user (payments point at auth.users) who has no open drawer right now
    SELECT u.id INTO v_actor FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM pos_sessions s WHERE s.opened_by = u.id AND s.status = 'open') LIMIT 1;
    -- 1. Vendors and a test fabric
    INSERT INTO suppliers (name, phone) VALUES ('TEST fabric vendor', '01700000001') RETURNING id INTO v_sup;
    INSERT INTO suppliers (name) VALUES ('TEST print shop') RETURNING id INTO v_print;
    INSERT INTO suppliers (name) VALUES ('TEST garments') RETURNING id INTO v_garm;
    INSERT INTO custom_fabrics (slug, name_en, price_per_piece, kg_per_piece, is_active)
    VALUES ('zz-test-fabric-' || substr(md5(random()::text), 1, 6), 'TEST fabric', 500, 0.25, false)
    RETURNING id INTO v_fab;

    -- 2. Buy 20 kg @ 600 + 200 transport = 12,200, pay 5,000 now
    PERFORM fabric_purchase(jsonb_build_object('fabric_id', v_fab, 'supplier_id', v_sup,
        'kg', 20, 'cost_per_kg', 600, 'extra_cost', 200, 'paid', 5000, 'method', 'cash'));
    SELECT due INTO v_num FROM supplier_balances WHERE supplier_id = v_sup;
    r := r || jsonb_build_object('2_vendor_due_after_buy', v_num);
    IF v_num <> 7200 THEN fails := fails || ('vendor due ' || v_num || ' <> 7200'); END IF;
    SELECT avg_cost_per_kg INTO v_num FROM fabric_stock WHERE fabric_id = v_fab;
    r := r || jsonb_build_object('2_avg_cost_per_kg', v_num);
    IF v_num <> 610 THEN fails := fails || ('avg cost ' || v_num || ' <> 610'); END IF;

    -- 3. Custom order, approved: 10 pcs, price 5,000, advance 2,000
    INSERT INTO custom_orders (customer_name, customer_phone, channel, source, sport, fabric_id, fabric_name,
        quantity, final_price, advance_amount, delivery_charge, status, approved_at)
    VALUES ('TEST customer', '01700000002', 'shop', 'upload', 'football', v_fab, 'TEST fabric',
        10, 5000, 2000, 0, 'approved', now())
    RETURNING id INTO v_order;

    -- advance in two parts: 1,500 (stays approved), then 500 (goes to queue)
    v_res := custom_order_take_payment(jsonb_build_object('actor', v_actor, 'order_id', v_order, 'amount', 1500, 'method', 'bkash', 'kind', 'advance'));
    SELECT status INTO v_status FROM custom_orders WHERE id = v_order;
    r := r || jsonb_build_object('3_after_1500', v_status);
    IF v_status <> 'approved' THEN fails := fails || ('after 1500 status ' || v_status); END IF;
    v_res := custom_order_take_payment(jsonb_build_object('actor', v_actor, 'order_id', v_order, 'amount', 500, 'method', 'nagad', 'kind', 'advance'));
    v_pay := v_res->>'payment_id';
    SELECT status INTO v_status FROM custom_orders WHERE id = v_order;
    r := r || jsonb_build_object('3_after_2000', v_status, '3_paid', v_res->'paid_total', '3_entered_production', v_res->'entered_production');
    IF v_status <> 'queued' THEN fails := fails || ('after 2000 status ' || v_status); END IF;
    -- settling the same payment twice must not count it twice
    v_res := custom_order_settle_payment(v_pay, 'successful');
    IF (v_res->>'paid_total')::NUMERIC <> 2000 THEN fails := fails || 'double settle counted twice'; END IF;

    -- 4. Production batch: print shop lump 1,000; garments 10 x 80
    v_batch := production_batch_save(jsonb_build_object(
        'title', 'TEST batch', 'print_supplier_id', v_print, 'print_basis', 'lump', 'print_cost', 1000,
        'garments_supplier_id', v_garm,
        'lines', jsonb_build_array(jsonb_build_object('custom_order_id', v_order, 'pieces', 10, 'garment_rate', 80)),
        'costs', jsonb_build_array(jsonb_build_object('kind', 'transport', 'amount', 150))));
    PERFORM production_use(jsonb_build_object('batch_id', v_batch, 'material', 'fabric', 'item_id', v_fab,
        'kind', 'used', 'kg', 3, 'pieces', 10, 'custom_order_id', v_order));
    PERFORM production_use(jsonb_build_object('batch_id', v_batch, 'material', 'fabric', 'item_id', v_fab,
        'kind', 'wastage', 'reason', 'cutting', 'kg', 0.5));
    SELECT to_jsonb(t) INTO v_res FROM production_batch_totals t WHERE batch_id = v_batch;
    r := r || jsonb_build_object('4_batch', v_res);
    -- 800 garments + 1830 used + 305 waste + 1000 print + 150 transport = 4085
    IF (v_res->>'total_cost')::NUMERIC <> 4085 THEN fails := fails || ('batch total ' || (v_res->>'total_cost')); END IF;
    SELECT total_cost INTO v_num FROM production_line_costs WHERE batch_id = v_batch;
    r := r || jsonb_build_object('4_order_cost', v_num, '4_order_profit', 5000 - v_num);
    SELECT on_hand_kg INTO v_num FROM fabric_stock WHERE fabric_id = v_fab;
    r := r || jsonb_build_object('4_fabric_left_kg', v_num);
    IF v_num <> 16.5 THEN fails := fails || ('fabric left ' || v_num); END IF;
    r := r || jsonb_build_object(
        '4_print_due', (SELECT due FROM supplier_balances WHERE supplier_id = v_print),
        '4_garments_due', (SELECT due FROM supplier_balances WHERE supplier_id = v_garm));

    -- 5. Balance 3,000 in cash at the counter: needs an open drawer, then counts in it
    BEGIN
        PERFORM custom_order_take_payment(jsonb_build_object('actor', v_actor, 'order_id', v_order, 'amount', 3000, 'method', 'cash', 'at_counter', true));
        fails := fails || 'counter cash without a drawer was allowed';
    EXCEPTION WHEN OTHERS THEN
        r := r || jsonb_build_object('5_cash_without_drawer', 'blocked: ' || SQLERRM);
    END;
    INSERT INTO pos_sessions (showroom_id, opened_by, opening_float)
    VALUES (COALESCE((SELECT id FROM showrooms LIMIT 1), 'test'), v_actor, 1000) RETURNING id INTO v_session;
    v_res := custom_order_take_payment(jsonb_build_object('actor', v_actor, 'order_id', v_order, 'amount', 3000, 'method', 'cash', 'at_counter', true));
    r := r || jsonb_build_object('5_paid_total', v_res->'paid_total', '5_order_due', 5000 - (v_res->>'paid_total')::NUMERIC);
    IF (v_res->>'paid_total')::NUMERIC <> 5000 THEN fails := fails || 'order not fully paid'; END IF;
    v_res := pos_session_summary(v_session);
    r := r || jsonb_build_object('5_drawer', v_res);
    IF (v_res->>'expected_cash')::NUMERIC <> 4000 THEN fails := fails || ('drawer expected ' || (v_res->>'expected_cash') || ' <> 4000'); END IF;

    -- 6. Pay off all three suppliers
    PERFORM supplier_pay(jsonb_build_object('supplier_id', v_sup, 'amount', 7200, 'method', 'bkash'));
    PERFORM supplier_pay(jsonb_build_object('supplier_id', v_print, 'amount', 1000, 'method', 'cash'));
    PERFORM supplier_pay(jsonb_build_object('supplier_id', v_garm, 'amount', 800, 'method', 'cash'));
    r := r || jsonb_build_object('6_dues_after_pay', (SELECT jsonb_object_agg(s.name, b.due) FROM supplier_balances b JOIN suppliers s ON s.id = b.supplier_id WHERE s.id IN (v_sup, v_print, v_garm)));
    IF EXISTS (SELECT 1 FROM supplier_balances WHERE supplier_id IN (v_sup, v_print, v_garm) AND due <> 0) THEN fails := fails || 'supplier due not 0'; END IF;

    -- 7. Probes (each in its own sub-transaction)
    BEGIN
        PERFORM production_use(jsonb_build_object('batch_id', v_batch, 'material', 'fabric', 'item_id', v_fab, 'kind', 'used', 'kg', 100));
        SELECT on_hand_kg INTO v_num FROM fabric_stock WHERE fabric_id = v_fab;
        r := r || jsonb_build_object('7_use_more_than_stock', 'ALLOWED, stock now ' || v_num || ' kg');
        RAISE EXCEPTION 'undo_probe_allowed';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'undo_probe_allowed' THEN fails := fails || 'used more fabric than in stock';
        ELSE r := r || jsonb_build_object('7_use_more_than_stock', 'blocked: ' || SQLERRM); END IF;
    END;
    BEGIN
        v_res := custom_order_take_payment(jsonb_build_object('actor', v_actor, 'order_id', v_order, 'amount', 100, 'method', 'bkash'));
        r := r || jsonb_build_object('7_overpay', 'ALLOWED, paid ' || (v_res->>'paid_total'));
        RAISE EXCEPTION 'undo_probe_allowed';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'undo_probe_allowed' THEN fails := fails || 'paid more than the order total';
        ELSE r := r || jsonb_build_object('7_overpay', 'blocked: ' || SQLERRM); END IF;
    END;
    BEGIN
        PERFORM production_batch_status(jsonb_build_object('id', v_batch, 'status', 'void', 'reason', 'test'));
        r := r || jsonb_build_object('7_void_batch',
            jsonb_build_object('fabric_kg', (SELECT on_hand_kg FROM fabric_stock WHERE fabric_id = v_fab),
                               'print_due', (SELECT due FROM supplier_balances WHERE supplier_id = v_print),
                               'garments_due', (SELECT due FROM supplier_balances WHERE supplier_id = v_garm)));
        RAISE EXCEPTION 'undo_probe';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM <> 'undo_probe' THEN r := r || jsonb_build_object('7_void_batch', 'error: ' || SQLERRM); END IF;
    END;

    r := r || jsonb_build_object('FAILS', to_jsonb(fails));
    RAISE EXCEPTION 'REPORT:%', r::text;
END
$test$;`;

const withIndex = process.argv.indexOf("--with");
const migration = withIndex === -1 ? "" : readFileSync(process.argv[withIndex + 1], "utf8");
// With a migration: one explicit transaction that the final RAISE aborts, so nothing is kept.
const query = migration ? `BEGIN;\n${migration}\n${sql}` : sql;

const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const text = await resp.text();
let message = text;
try {
  message = JSON.parse(text).message ?? text;
} catch {}
const m = message.match(/REPORT:(\{.*\})/);
if (!m) {
  console.error("Test did not reach the report (nothing was saved):\n", message.slice(0, 1500));
  process.exit(1);
}
const report = JSON.parse(m[1]);
console.log(JSON.stringify(report, null, 2));
console.log(report.FAILS.length ? `\n${report.FAILS.length} check(s) FAILED` : "\nAll checks passed (everything rolled back)");
process.exit(report.FAILS.length ? 1 : 0);
