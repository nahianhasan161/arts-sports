/**
 * Shrinks a product video in the admin's browser before it is uploaded.
 *
 * The site runs on Cloudflare Workers, which cannot run ffmpeg, so the work
 * happens here, with what every modern browser has: the clip plays (silently)
 * into a canvas at most 1280 px on its long side (720p), and MediaRecorder
 * records that canvas plus the sound at about 1.6 Mbit/s. A phone video of
 * 30 s at 50-80 MB comes out near 6 MB.
 *
 * Recording runs in real time: a 60 s clip takes about 60 s. The tab has to
 * stay in front; when it is hidden the recording pauses and carries on when it
 * comes back, so the result has no frozen stretch.
 *
 * The original is kept when it is already small and sharp enough, when the
 * recorded file is not smaller, or when this browser cannot record (then only
 * if it is under the size limit). A still from the clip is made as the poster.
 */

import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from "./video";

export interface CompressedVideo {
  file: File;
  poster: File | null;
  width: number;
  height: number;
  seconds: number;
  /** False when the original file is sent as it is. */
  shrunk: boolean;
}

export class VideoCompressError extends Error {}

const LONG_SIDE = 1280;
/** Files this small and already within 720p are sent as they are. */
const KEEP_BELOW = 8 * 1024 * 1024;

const MIME_CHOICES = [
  "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_CHOICES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

const isPlayableType = (t: string) => t === "video/mp4" || t === "video/webm";

function once(target: EventTarget, ok: string, fail = "error"): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener(ok, done);
      target.removeEventListener(fail, bad);
      resolve();
    };
    const bad = () => {
      target.removeEventListener(ok, done);
      target.removeEventListener(fail, bad);
      reject(new VideoCompressError("This video could not be read. Try an MP4 from a phone or camera."));
    };
    target.addEventListener(ok, done);
    target.addEventListener(fail, bad);
  });
}

function even(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

async function grabPoster(video: HTMLVideoElement, width: number, height: number, name: string): Promise<File | null> {
  try {
    video.currentTime = Math.min(1, video.duration / 3);
    await once(video, "seeked");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.8));
    if (!blob || blob.type !== "image/webp") return null;
    return new File([blob], `${name}-poster.webp`, { type: "image/webp" });
  } catch {
    return null;
  }
}

export async function compressVideo(
  file: File,
  onProgress?: (done: number) => void,
  signal?: AbortSignal,
): Promise<CompressedVideo> {
  const src = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.playsInline = true;
  video.src = src;
  const base = (file.name || "video").replace(/\.[^./\\]+$/, "").replace(/[^\w-]+/g, "-").slice(0, 60) || "video";
  let audio: AudioContext | null = null;

  try {
    await once(video, "loadedmetadata");
    const seconds = video.duration;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new VideoCompressError("This video has no length. Try another file.");
    if (seconds > MAX_VIDEO_SECONDS + 0.5) {
      throw new VideoCompressError(
        `This video is ${Math.round(seconds)} s long. Keep uploads under ${MAX_VIDEO_SECONDS} s, or put it on YouTube and paste the link.`,
      );
    }
    const scale = Math.min(1, LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const width = even(video.videoWidth * scale);
    const height = even(video.videoHeight * scale);
    const poster = await grabPoster(video, width, height, base);

    const keepOriginal = (): CompressedVideo => {
      if (file.size > MAX_VIDEO_BYTES || !isPlayableType(file.type)) {
        throw new VideoCompressError(
          "This browser cannot shrink videos. Open the admin in Chrome or Edge, or put the video on YouTube and paste the link.",
        );
      }
      return { file, poster, width: video.videoWidth, height: video.videoHeight, seconds, shrunk: false };
    };

    if (isPlayableType(file.type) && file.size <= KEEP_BELOW && scale === 1) {
      return { file, poster, width, height, seconds, shrunk: false };
    }

    const mime = pickMime();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!mime || !ctx || typeof canvas.captureStream !== "function") return keepOriginal();

    const stream = canvas.captureStream(30);
    // The sound goes through Web Audio into the recording and nowhere else,
    // so nothing plays out of the speakers while it records.
    try {
      audio = new AudioContext();
      await audio.resume();
      const dest = audio.createMediaStreamDestination();
      audio.createMediaElementSource(video).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch {
      video.muted = true;
    }

    const pixels = width * height;
    const videoBitsPerSecond = Math.max(600_000, Math.round(1_600_000 * (pixels / (1280 * 720))));
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (recorder.onstop = () => r()));

    video.currentTime = 0;
    await once(video, "seeked");

    let running = true;
    const draw = () => {
      if (!running) return;
      ctx.drawImage(video, 0, 0, width, height);
      onProgress?.(Math.min(0.99, video.currentTime / seconds));
      if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };

    // A hidden tab stops drawing, so recording would freeze; pause both instead.
    const onVisibility = () => {
      if (document.hidden) {
        video.pause();
        if (recorder.state === "recording") recorder.pause();
      } else if (running) {
        if (recorder.state === "paused") recorder.resume();
        void video.play().catch(() => {});
      }
    };
    const onAbort = () => {
      running = false;
      video.pause();
      if (recorder.state !== "inactive") recorder.stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    signal?.addEventListener("abort", onAbort);

    try {
      recorder.start(1000);
      try {
        await video.play();
      } catch {
        // Sound needs a recent click; record without it rather than fail.
        video.muted = true;
        await video.play();
      }
      draw();
      await Promise.race([once(video, "ended"), stopped]);
      running = false;
      ctx.drawImage(video, 0, 0, width, height);
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
    } finally {
      document.removeEventListener("visibilitychange", onVisibility);
      signal?.removeEventListener("abort", onAbort);
      stream.getTracks().forEach((t) => t.stop());
    }
    if (signal?.aborted) throw new VideoCompressError("Stopped.");

    const type = mime.split(";")[0];
    const blob = new Blob(chunks, { type });
    if (blob.size === 0) return keepOriginal();
    if (blob.size >= file.size && isPlayableType(file.type) && file.size <= MAX_VIDEO_BYTES) {
      return { file, poster, width: video.videoWidth, height: video.videoHeight, seconds, shrunk: false };
    }
    if (blob.size > MAX_VIDEO_BYTES) {
      throw new VideoCompressError(
        `Even after shrinking this video is ${(blob.size / 1024 / 1024).toFixed(0)} MB (limit ${MAX_VIDEO_BYTES / 1024 / 1024} MB). Use a shorter clip or a YouTube link.`,
      );
    }
    onProgress?.(1);
    const ext = type === "video/mp4" ? "mp4" : "webm";
    return { file: new File([blob], `${base}.${ext}`, { type }), poster, width, height, seconds, shrunk: true };
  } finally {
    URL.revokeObjectURL(src);
    video.removeAttribute("src");
    video.load();
    void audio?.close().catch(() => {});
  }
}
