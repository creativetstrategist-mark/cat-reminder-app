// Turns a chosen photo into a small square JPEG (as a data: URL) for a cat's
// avatar. Done in the browser, so a 5 MB phone photo becomes ~30–80 KB.

const MAX_LENGTH = 200_000; // characters; the database rules allow up to 300,000
const ATTEMPTS = [
  [480, 0.85],
  [400, 0.8],
  [320, 0.75],
  [256, 0.7],
];

async function decode(file) {
  try {
    // 'from-image' turns phone photos the right way up.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older browsers: fall back to an <img>, which also respects orientation.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** A centred square crop of `file`, as a JPEG data: URL. Throws a readable error. */
export async function photoFromFile(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Please choose a photo (JPEG or PNG).');
  let image;
  try {
    image = await decode(file);
  } catch {
    throw new Error('Couldn’t read that photo. Try a JPEG or PNG.');
  }
  const width = image.width;
  const height = image.height;
  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  for (const [size, quality] of ATTEMPTS) {
    const out = Math.min(size, side);
    canvas.width = out;
    canvas.height = out;
    ctx.fillStyle = '#fff'; // transparent PNGs get a white background
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, sx, sy, side, side, 0, 0, out, out);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_LENGTH) return dataUrl;
  }
  throw new Error('That photo is too large. Try a different one.');
}
