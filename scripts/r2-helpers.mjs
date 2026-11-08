/**
 * Cloudflare R2 access for the maintenance and test scripts.
 *
 * Reads the same variables the app does (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL) from .env.local and .env,
 * so a bucket that works here is a bucket the app can use. Values already in
 * the environment win, which is how CI would pass them.
 */

import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  const p = join(root, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export const R2_BUCKET = process.env.R2_BUCKET || "artssports-media";
export const R2_ENDPOINT = `https://${(process.env.R2_ACCOUNT_ID || "").trim()}.r2.cloudflarestorage.com`;
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").trim().replace(/\/+$/, "");

export const R2_REQUIRED = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];

export function r2Missing() {
  return R2_REQUIRED.filter((k) => !process.env[k]?.trim());
}

export function r2Ready() {
  return r2Missing().length === 0;
}

let cached;
export function r2Client() {
  if (cached) return cached;
  if (!r2Ready()) throw new Error(`R2 credentials are missing: ${r2Missing().join(", ")}`);
  cached = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

/** Every object (key and size) in `bucket` under each prefix, using `client`. */
export async function listObjects(client, bucket, prefixes = [""]) {
  const out = [];
  for (const prefix of prefixes) {
    let token;
    do {
      const r = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, ContinuationToken: token }),
      );
      for (const o of r.Contents ?? []) out.push({ key: o.Key, size: o.Size ?? 0 });
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
  }
  return out;
}

/** Every object key in the R2 bucket that starts with one of `prefixes`. */
export async function listKeys(prefixes) {
  return (await listObjects(r2Client(), R2_BUCKET, prefixes)).map((o) => o.key);
}

/** Removes keys from the R2 bucket, reporting the ones that could not be removed. */
export async function deleteKeys(keys) {
  if (keys.length === 0) return [];
  const failed = [];
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    const r = await r2Client().send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: false },
      }),
    );
    for (const e of r.Errors ?? []) failed.push(e.Key);
  }
  return failed;
}

/**
 * The URL shape publicUrlFor() produces, for asserting on without duplicating
 * the decision: the public base when R2_PUBLIC_URL is set, else the app's
 * streaming route.
 */
export function expectedUrlPrefix() {
  return R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/` : "/api/media/";
}
