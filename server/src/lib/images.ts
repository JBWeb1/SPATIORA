import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([m, e]) => [e, m]));

/** Persist bytes in the upload folder and return the public URL path. */
export function saveImage(data: Buffer, mime: string): string {
  const ext = IMAGE_TYPES[mime] ?? ".bin";
  const name = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(config.uploadDir, name), data);
  return `/uploads/${name}`;
}

/** Resolve a public /uploads/... URL to a file on disk (guards against path traversal). */
export function resolveUpload(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("/uploads/")) return null;
  const name = path.basename(url);
  const file = path.join(config.uploadDir, name);
  return fs.existsSync(file) ? file : null;
}

export function readUpload(url: string | null | undefined): { data: Buffer; mime: string } | null {
  const file = resolveUpload(url);
  if (!file) return null;
  const mime = EXT_TO_MIME[path.extname(file).toLowerCase()];
  if (!mime) return null;
  return { data: fs.readFileSync(file), mime };
}

/** Read pixel dimensions from PNG, JPEG or WebP headers without decoding. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  // PNG
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  // WebP
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** Check that uploaded bytes really are the image type they claim to be. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
