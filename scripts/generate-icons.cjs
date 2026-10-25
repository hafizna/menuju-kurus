/* Reproduce the PWA and Apple icons from the original native SVG mark.
 * Usage: node scripts/generate-icons.cjs (after npm ci).
 * Sharp is included by Next.js. Keep maskable safe-area padding in icon.svg. */
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

async function main() {
  const publicDir = path.resolve(__dirname, "../public");
  const source = await fs.readFile(path.join(publicDir, "icon.svg"));
  const outputs = [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
  ];
  for (const [name, size] of outputs) {
    const target = path.join(publicDir, name);
    await sharp(source, { density: 192 })
      .resize(size, size, { kernel: "lanczos3" })
      .png({ compressionLevel: 9 })
      .toFile(target);
    const metadata = await sharp(target).metadata();
    if (metadata.width !== size || metadata.height !== size) {
      throw new Error(`Unexpected dimensions for ${name}`);
    }
    process.stdout.write(`${name}: ${size} x ${size}\n`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
