-- Shop search: one function the storefront calls (lib/services/search.ts).
-- Matches the product's own text in English and Bangla, its category and
-- sub-category names, its teams/brands and tags. `terms` are the shopper's
-- words plus the same words in the other language (built in lib/search.ts).
-- Latin words also match with a small typo ("jursey", "batminton") through
-- pg_trgm word similarity. Bangla is matched as text only: trigram splitting
-- treats Bangla vowel signs as word breaks, so similarity there is noise.
-- Safe to run again.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP FUNCTION IF EXISTS public.search_product_ids(TEXT, TEXT[], INTEGER);

CREATE FUNCTION public.search_product_ids(q TEXT, terms TEXT[], max_results INTEGER DEFAULT 200)
RETURNS TABLE (id TEXT, score REAL)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH input AS (
        SELECT lower(trim(q)) AS q,
               ARRAY(SELECT '%' || lower(t) || '%' FROM unnest(terms) AS t WHERE length(trim(t)) > 0) AS pats,
               lower(trim(q)) ~ '^[a-z0-9 \-]+$' AS latin
    ),
    docs AS (
        SELECT p.id,
               lower(concat_ws(' ', p.title, p.title_bn, p.short_description, p.short_description_bn, p.slug,
                               p.category, p.sub_category, c.name, c.name_bn, sc.name, sc.name_bn,
                               array_to_string(p.tags, ' '),
                               (SELECT string_agg(concat_ws(' ', ct.name_en, ct.name_bn), ' ')
                                  FROM product_terms pt JOIN catalog_terms ct ON ct.id = pt.term_id
                                 WHERE pt.product_id = p.id AND ct.is_active))) AS doc,
               lower(coalesce(p.title, '')) AS title,
               lower(coalesce(p.title_bn, '')) AS title_bn,
               p.published_at
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN categories sc ON sc.id = p.sub_category_id
         WHERE p.deleted_at IS NULL AND p.status = 'published'
    ),
    scored AS (
        SELECT d.id,
               (CASE WHEN d.title LIKE '%' || i.q || '%' OR d.title_bn LIKE '%' || i.q || '%' THEN 3 ELSE 0 END
                + CASE WHEN d.doc LIKE ANY (i.pats) THEN 2 ELSE 0 END
                + CASE WHEN i.latin THEN word_similarity(i.q, d.doc) ELSE 0 END)::REAL AS score,
               d.published_at
          FROM docs d CROSS JOIN input i
         WHERE d.doc LIKE ANY (i.pats)
            OR (i.latin AND length(i.q) >= 3 AND word_similarity(i.q, d.doc) > 0.45)
    )
    SELECT s.id, s.score
      FROM scored s
     ORDER BY s.score DESC, s.published_at DESC NULLS LAST
     LIMIT greatest(1, least(coalesce(max_results, 200), 500));
$$;

GRANT EXECUTE ON FUNCTION public.search_product_ids(TEXT, TEXT[], INTEGER) TO anon, authenticated;
