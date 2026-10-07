import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type OutputInfo } from "sharp";
import type { Config } from "./config.js";
import { AppError } from "./errors.js";

export interface StoredImage {
  path: string; // relative to the upload dir, served under /media/
  thumbPath: string;
  width: number;
  height: number;
}

/**
 * Decode an uploaded image and re-encode it. Re-encoding means we never serve the user's
 * original bytes: EXIF metadata (including GPS location) is dropped, and anything that is
 * not a real image fails to decode and is rejected.
 */
export async function storeImage(config: Config, input: Buffer, opts: { square?: number } = {}): Promise<StoredImage> {
  mkdirSync(config.uploadDir, { recursive: true });
  let full: { data: Buffer; info: OutputInfo };
  let thumb: Buffer;
  try {
    const base = sharp(input, { limitInputPixels: 50_000_000, failOn: "error" }).rotate(); // apply EXIF orientation
    const meta = await sharp(input).metadata();
    if (!meta.format || !["jpeg", "png", "webp", "heif", "avif", "gif"].includes(meta.format)) {
      throw new Error("unsupported");
    }
    const size = opts.square;
    full = await (size
      ? base.clone().resize(size, size, { fit: "cover" })
      : base.clone().resize({ width: config.upload.fullWidth, withoutEnlargement: true }))
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    thumb = await base
      .clone()
      .resize(config.upload.thumbSize, config.upload.thumbSize, { fit: "cover" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new AppError("UNSUPPORTED_MEDIA", "File is not a supported image (JPEG, PNG, WebP, HEIC, AVIF or GIF)");
  }
  const id = randomBytes(12).toString("hex");
  const path = `${id}.jpg`;
  const thumbPath = `${id}_t.jpg`;
  await writeFile(join(config.uploadDir, path), full.data);
  await writeFile(join(config.uploadDir, thumbPath), thumb);
  return { path, thumbPath, width: full.info.width, height: full.info.height };
}

export async function deleteImages(config: Config, paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => unlink(join(config.uploadDir, p)).catch(() => {})));
}

export function mediaUrl(path: string | null): string | null {
  return path ? `/media/${path}` : null;
}
