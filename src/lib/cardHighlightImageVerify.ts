/**
 * Confirm downloaded bytes are a common raster format (not HTML/JSON error body).
 */
export function imageBytesLookLikeRaster(body: Buffer): boolean {
  if (body.length < 12) return false;
  // JPEG
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return true;
  // PNG
  if (body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) return true;
  // GIF
  const head3 = body.toString("ascii", 0, 3);
  if (head3 === "GIF") return true;
  // WEBP: RIFF....WEBP
  if (body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return true;
  return false;
}
