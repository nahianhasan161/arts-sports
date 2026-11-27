/**
 * Product videos: shared by the admin editor, the API and the product page.
 *
 * A product keeps a short list in `products.videos` (JSONB). Each entry is a
 * link to a video hosted elsewhere (YouTube, Facebook...) or a small file we
 * stored in R2 after the browser shrank it (video-compress.ts).
 *
 * Links are stored as the host's id, never as an embed URL from the client:
 * the embed address is built here, so a saved entry can only ever frame one of
 * the hosts below.
 */

export type VideoKind = "youtube" | "vimeo" | "facebook" | "tiktok" | "instagram" | "drive" | "file";

export interface ProductVideo {
  kind: VideoKind;
  /** Host's video id (YouTube/Vimeo/TikTok/Drive id, Instagram code). Absent for facebook and file. */
  id?: string;
  /** The link as pasted (links) or the public file address (file). */
  url: string;
  /** Tall video (Shorts, Reels, TikTok, or an uploaded phone video). */
  vertical?: boolean;
  /** Uploaded files only. */
  storage_path?: string;
  poster_path?: string | null;
  poster?: string | null;
  mime?: string;
  bytes?: number;
  seconds?: number;
}

export const MAX_VIDEOS = 6;
/** Largest file accepted after the browser has shrunk it. */
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
/** Longer clips belong on YouTube. */
export const MAX_VIDEO_SECONDS = 90;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pulls the link out of what staff paste: a plain link, or a host's "embed"
 * code (`<iframe src="...">`). Facebook's embed points at its own player
 * (`/plugins/video.php?href=<the real link>`), so we unwrap that too.
 */
function pastedLink(raw: string): string {
  let text = raw.trim();
  const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(text);
  if (src) text = src[1].replace(/&amp;/g, "&");
  try {
    const u = new URL(text);
    if (/(^|\.)facebook\.com$/i.test(u.hostname) && u.pathname.startsWith("/plugins/")) {
      const href = u.searchParams.get("href");
      if (href) return href;
    }
  } catch {
    /* not a link; the caller rejects it */
  }
  return text;
}

/** Reads a pasted link or embed code. Null when it is not a host we can show. */
export function parseVideoLink(raw: string): ProductVideo | null {
  let u: URL;
  try {
    u = new URL(pastedLink(raw));
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m|mobile)\./, "").toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  const url = u.toString();

  if (host === "youtu.be") {
    const id = parts[0];
    return id && YT_ID.test(id) ? { kind: "youtube", id, url } : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") {
      const id = u.searchParams.get("v") ?? "";
      return YT_ID.test(id) ? { kind: "youtube", id, url } : null;
    }
    if (["shorts", "embed", "live", "v"].includes(parts[0]) && parts[1] && YT_ID.test(parts[1])) {
      return { kind: "youtube", id: parts[1], url, vertical: parts[0] === "shorts" };
    }
    return null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((p) => /^\d{5,}$/.test(p));
    return id ? { kind: "vimeo", id, url } : null;
  }
  if (host === "facebook.com" || host === "fb.watch" || host === "web.facebook.com") {
    // Facebook's player takes the page link itself; it needs a video, a reel or a watch link.
    const isVideo =
      host === "fb.watch" ||
      parts.includes("videos") ||
      parts[0] === "reel" ||
      parts[0] === "watch" ||
      (parts[0] === "share" && (parts[1] === "v" || parts[1] === "r"));
    if (!isVideo) return null;
    const vertical = parts[0] === "reel" || parts[1] === "r";
    // Facebook's player is picky: tracking bits (?mibextid=, ?rdid=) or a
    // mobile host can make it show nothing. Keep a clean www link with the id.
    const id =
      (parts[0] === "reel" && /^\d{6,}$/.test(parts[1] ?? "") ? parts[1] : undefined) ??
      (parts.includes("videos") ? parts.find((p) => /^\d{6,}$/.test(p)) : undefined) ??
      (parts[0] === "watch" && /^\d{6,}$/.test(u.searchParams.get("v") ?? "") ? u.searchParams.get("v")! : undefined);
    if (id) {
      const clean = parts[0] === "reel" ? `https://www.facebook.com/reel/${id}/` : `https://www.facebook.com/watch/?v=${id}`;
      return { kind: "facebook", id, url: clean, vertical };
    }
    return { kind: "facebook", url, vertical };
  }
  if (host === "tiktok.com") {
    const i = parts.indexOf("video");
    const id = i >= 0 ? parts[i + 1] : undefined;
    return id && /^\d{8,}$/.test(id) ? { kind: "tiktok", id, url, vertical: true } : null;
  }
  if (host === "instagram.com") {
    const i = parts.findIndex((p) => p === "reel" || p === "reels" || p === "p" || p === "tv");
    const id = i >= 0 ? parts[i + 1] : undefined;
    return id && /^[A-Za-z0-9_-]{5,40}$/.test(id) ? { kind: "instagram", id, url, vertical: true } : null;
  }
  if (host === "drive.google.com") {
    const i = parts.indexOf("d");
    const id = (i >= 0 ? parts[i + 1] : null) ?? u.searchParams.get("id") ?? "";
    return /^[A-Za-z0-9_-]{10,}$/.test(id) ? { kind: "drive", id, url } : null;
  }
  return null;
}

/**
 * Short/share links we cannot read without opening them. Facebook's player
 * does not follow its own /share/ links, so those count too.
 */
export function isShortLink(raw: string): boolean {
  const text = pastedLink(raw);
  return (
    /^https?:\/\/(vt\.tiktok\.com|vm\.tiktok\.com|instagr\.am)\//i.test(text) ||
    /^https?:\/\/((www|m|web)\.)?facebook\.com\/share\//i.test(text)
  );
}

/** The address to put in an iframe, or null for an uploaded file. */
export function embedUrl(v: ProductVideo, autoplay = true): string | null {
  const ap = autoplay ? 1 : 0;
  switch (v.kind) {
    case "youtube":
      return `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=${ap}&rel=0&playsinline=1&modestbranding=1`;
    case "vimeo":
      return `https://player.vimeo.com/video/${v.id}?autoplay=${ap}&dnt=1`;
    case "facebook":
      // Without a width Facebook's player can draw nothing; these match its own embed code.
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v.url)}&show_text=false&t=0&autoplay=${autoplay}&${
        v.vertical ? "width=267&height=476" : "width=560&height=315"
      }`;
    case "tiktok":
      return `https://www.tiktok.com/player/v1/${v.id}?autoplay=${ap}&rel=0`;
    case "instagram":
      return `https://www.instagram.com/p/${v.id}/embed/`;
    case "drive":
      return `https://drive.google.com/file/d/${v.id}/preview`;
    default:
      return null;
  }
}

/** A still to show before the video plays, when one is known without asking the host. */
export function videoPoster(v: ProductVideo): string | null {
  if (v.poster) return v.poster;
  if (v.kind === "youtube" && v.id) return `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  return null;
}

export const VIDEO_HOST_LABEL: Record<VideoKind, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
  drive: "Google Drive",
  file: "Uploaded video",
};

/** What a product row carries, read defensively (the column may be missing or hand-edited). */
export function readVideos(value: unknown): ProductVideo[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is ProductVideo =>
      !!v && typeof v === "object" && typeof (v as ProductVideo).kind === "string" && typeof (v as ProductVideo).url === "string",
  );
}
