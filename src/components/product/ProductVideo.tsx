"use client";

import { useEffect } from "react";
import { Play } from "lucide-react";
import { embedUrl, videoPoster, type ProductVideo as Video } from "@/lib/media/video";

/**
 * One product video in the gallery stage.
 *
 * The host's player shows straight away (no tap-to-play cover first); it does
 * not autoplay. Only the selected slide is rendered, so nothing from the host
 * loads until the shopper picks the video slide. `onPlay` tells the gallery to
 * hide its badges/buttons, which would sit over the player's controls.
 */
export function ProductVideo({ video, title, onPlay }: { video: Video; title: string; playLabel?: string; onPlay?: () => void }) {
  const poster = videoPoster(video);
  const frame = embedUrl(video, false);

  useEffect(() => {
    onPlay?.();
    // Once per mounted video (the gallery remounts it per slide).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black">
      {video.kind === "file" ? (
        <video
          src={video.url}
          poster={poster ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
        />
      ) : (
        <iframe
          src={frame ?? undefined}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className={video.vertical ? "h-full aspect-[9/16] max-w-full" : "w-full aspect-video max-h-full"}
        />
      )}
    </div>
  );
}

/**
 * Gallery thumbnail for a video. Links other than YouTube carry no still, so
 * `fallback` (the product's photo) stands in, darkened, with a play mark and
 * a "Video" label so the slide is clearly a video.
 */
export function VideoThumb({ video, fallback, label }: { video: Video; fallback?: string | null; label?: string }) {
  const poster = videoPoster(video) ?? fallback ?? null;
  return (
    <>
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : null}
      <span className={`absolute inset-0 ${poster ? "bg-black/40" : "bg-black/80"}`} />
      <span className="absolute inset-0 m-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-black shadow">
        <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
      </span>
      {label ? (
        <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[10px] font-semibold leading-tight text-white">
          {label}
        </span>
      ) : null}
    </>
  );
}
