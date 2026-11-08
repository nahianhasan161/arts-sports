/**
 * Checks the R2 bucket and reports what still has to be done by hand.
 *
 *   node scripts/r2-setup.mjs            verify (creates the bucket if the token may)
 *   node scripts/r2-setup.mjs --delete   also remove the probe object
 *
 * Idempotent: running it twice creates nothing the second time.
 */

import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { r2Client, r2Missing, R2_BUCKET, R2_ENDPOINT, R2_PUBLIC_URL } from "./r2-helpers.mjs";

const missing = r2Missing();
if (missing.length > 0) {
  console.error(`Missing ${missing.join(", ")}. Add them to .env (see .env.example).`);
  process.exit(1);
}

const s3 = r2Client();
const PROBE_KEY = "_r2-setup/probe.txt";
const say = (label, value) => console.log(`  ${label.padEnd(30)} ${value}`);
const fail = (label, e) => console.log(`  ${label.padEnd(30)} FAILED  ${e?.name ?? ""}: ${e?.message ?? e}`);

console.log(`\nR2 setup`);
say("endpoint", R2_ENDPOINT);
say("bucket", R2_BUCKET);
say("public url", R2_PUBLIC_URL || "(not set: images go through /api/media)");
console.log();

let exists = true;
try {
  await s3.send(new HeadBucketCommand({ Bucket: R2_BUCKET }));
  say("bucket", "exists");
} catch {
  exists = false;
}

if (!exists) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: R2_BUCKET }));
    say("bucket", "created");
    exists = true;
  } catch (e) {
    fail("bucket create", e);
    console.log(
      `\n  Create "${R2_BUCKET}" in the Cloudflare dashboard (R2 > Create bucket) or with\n` +
        `      npx wrangler r2 bucket create ${R2_BUCKET}\n` +
        `  An object-level API token cannot create buckets; that is expected.\n`,
    );
  }
}
if (!exists) process.exit(1);

try {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: PROBE_KEY, Body: "ok", ContentType: "text/plain" }));
  say("write probe object", "ok");
  await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: PROBE_KEY }));
  say("read probe object", "ok");
} catch (e) {
  fail("write/read probe", e);
  console.log(`\n  The token needs "Object Read & Write" on ${R2_BUCKET}.\n`);
  process.exit(1);
}

if (R2_PUBLIC_URL) {
  const status = (await fetch(`${R2_PUBLIC_URL}/${PROBE_KEY}`).catch(() => ({ status: 0 }))).status;
  if (status === 200) {
    say("public read", "200  bucket is public at R2_PUBLIC_URL");
  } else {
    say("public read", `${status}  not reachable`);
    console.log(
      `\n  Turn on public access in Cloudflare: R2 > ${R2_BUCKET} > Settings >\n` +
        `  Public Development URL (r2.dev) > Enable, or connect a custom domain,\n` +
        `  then put that URL in R2_PUBLIC_URL.\n`,
    );
  }
}

if (process.argv.includes("--delete")) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: PROBE_KEY }));
    say("probe object removed", "ok");
  } catch (e) {
    fail("remove probe", e);
  }
} else {
  say("probe object", `left at ${PROBE_KEY} (--delete to remove)`);
}

console.log(`\nDone. Next: node scripts/r2-migrate-from-tigris.mjs\n`);
