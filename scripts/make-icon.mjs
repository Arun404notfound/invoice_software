/**
 * Rasterises build/icon.svg -> build/icon.png (1024x1024) for
 * electron-builder, which derives the macOS .icns from it. Run via
 * `npm run desktop:icon` (also part of `npm run desktop:mac`).
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const svgPath = path.join(root, "build", "icon.svg");
const pngPath = path.join(root, "build", "icon.png");

try {
  await access(pngPath);
  // Regenerate anyway so edits to the SVG take effect.
} catch {
  /* no existing png — fine */
}

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error(
    "sharp is not installed. Run `npm install`, or create build/icon.png " +
      "(1024x1024) by hand from build/icon.svg.",
  );
  process.exit(1);
}

const svg = await readFile(svgPath);
const png = await sharp(svg, { density: 384 })
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await writeFile(pngPath, png);
console.log(`wrote ${path.relative(root, pngPath)} (${png.length} bytes)`);
