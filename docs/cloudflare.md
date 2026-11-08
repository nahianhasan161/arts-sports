# Arts Sports on Cloudflare (Workers + R2)

The storefront runs on **Cloudflare Workers** (built with
[OpenNext](https://opennext.js.org/cloudflare)). Supabase is still the
database and auth provider.

**Images: Tigris now, R2 later.** The app picks the storage provider from the
environment: it uses R2 once `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and
`R2_SECRET_ACCESS_KEY` are all set, and the existing Tigris bucket
(`TIGRIS_STORAGE_*`) until then. No code change is needed to switch.

## Deploy now (with Tigris images)

1. `npx wrangler login` (once per computer).
2. Set the Worker's Tigris secrets:

   ```bash
   npx wrangler secret put TIGRIS_STORAGE_ENDPOINT
   npx wrangler secret put TIGRIS_STORAGE_ACCESS_KEY_ID
   npx wrangler secret put TIGRIS_STORAGE_SECRET_ACCESS_KEY
   npx wrangler secret put TIGRIS_STORAGE_BUCKET
   ```

3. In `.env`, set `NEXT_PUBLIC_SITE_URL` to the Worker address
   (`https://arts-sports.<subdomain>.workers.dev`), then `npm run deploy`.
4. Add that URL to **Supabase → Authentication → URL Configuration** redirect
   URLs so Google sign-in works.

Images keep streaming through `/api/media` from Tigris, exactly as before.

## Later: moving images to R2

The steps below are for when R2 is enabled on the Cloudflare account.

Until the domain is added, the site uses free Cloudflare addresses:

| What | Before launch | After launch |
| --- | --- | --- |
| Website | `https://arts-sports.<subdomain>.workers.dev` | `https://artssports.com` |
| Images | `https://pub-<hash>.r2.dev` | `https://media.artssports.com` |

Switching to the domain later is only an env change plus one script (step 8).

---

## R2 setup

### 1. Cloudflare account and R2

1. Sign in at <https://dash.cloudflare.com> (create an account if needed).
2. Open **R2 Object Storage** and enable it. Cloudflare asks for a payment
   method; the free tier (10 GB storage, no egress fees) covers this shop.

### 2. Log wrangler in (once per computer)

```bash
npx wrangler login
```

This opens your browser to approve access.

### 3. Create the bucket

```bash
npx wrangler r2 bucket create artssports-media
```

### 4. Create an R2 API token

Dashboard → R2 → **Manage API tokens** → **Create API token**:

- Permission: **Object Read & Write**
- Bucket: `artssports-media`

Copy the **Access Key ID**, **Secret Access Key**, and your **Account ID**
(shown on the R2 overview page) into `.env`:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=artssports-media
```

### 5. Turn on the free public URL

Dashboard → R2 → `artssports-media` → **Settings** → **Public Development URL**
→ **Enable**. Put the `https://pub-....r2.dev` address in `.env`:

```env
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

(r2.dev is rate-limited and meant for pre-launch. Use a custom domain for
production. See step 8.)

Check everything:

```bash
node scripts/r2-setup.mjs --delete
```

### 6. Copy the existing images from Tigris

The old Tigris keys are still in `.env`, so:

```bash
node scripts/r2-migrate-from-tigris.mjs
node scripts/r2-migrate-from-tigris.mjs --run
```

The second command copies and then verifies every image the database
references. It must end with **"All media is in R2"**. Re-running it is safe.

Then point the database at R2:

```bash
node scripts/r2-set-media-prefix.mjs
```

Images uploaded earlier for the landing page keep their `/api/media/...` links,
which the app still serves from R2.

### 7. Deploy

Set the Worker's secrets (once, and again whenever one changes):

```bash
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put R2_PUBLIC_URL
```

In `.env`, set `NEXT_PUBLIC_SITE_URL` to the Worker address (it is baked in at
build time), then:

```bash
npm run deploy
```

Finally, in **Supabase → Authentication → URL Configuration**, add the
workers.dev URL (and later the real domain) to the redirect URLs so Google
sign-in works.

Try the production build locally first with `npm run preview`
(<http://localhost:8787>).

---

## 8. Moving to artssports.com later

1. Add `artssports.com` to Cloudflare (change its nameservers to Cloudflare's).
2. Worker → **Settings → Domains & Routes** → add `artssports.com`.
3. R2 bucket → **Settings → Custom Domains** → add `media.artssports.com`.
4. Update `.env` and the Worker secret:
   `R2_PUBLIC_URL=https://media.artssports.com`,
   `NEXT_PUBLIC_SITE_URL=https://artssports.com`.
5. `node scripts/r2-set-media-prefix.mjs` (rewrites image URLs in the database).
6. `npm run deploy`.
7. Add the new domain to Supabase's redirect URLs.

## After the move is verified

- Remove the `TIGRIS_*` lines from `.env`.
- Delete the old Tigris bucket and the Vercel project once nothing points at
  them.
