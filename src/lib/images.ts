import sharp from "sharp";

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  contentType: "image/jpeg";
}

/**
 * Validate that `input` decodes as a real image, auto-orient it, and produce
 * a full-size (max 1600px) and thumbnail (max 400px) JPEG. Throws on non-images.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { failOn: "error" }).rotate(); // auto-orient via EXIF, then strip metadata
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("not a valid image");

  const full = await base.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const thumb = await base.clone().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return { full, thumb, contentType: "image/jpeg" };
}
