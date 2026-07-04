// Regenerates the app icon set from the brand art in site/assets/.
// Run after any brand-mark change:
//   npm i --no-save sharp && node scripts/generate-brand-assets.mjs
// (sharp is deliberately NOT a devDependency — its native build breaks EAS iOS builds)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const markSvg = readFileSync('site/assets/mark.svg', 'utf8');
const DENSITY = 300;

// 1. App icon: the store art as-is (mark on butter rounded square).
await sharp('site/assets/app-icon-1024.png').png().toFile('assets/images/icon.png');

// 2. Android adaptive foreground: mark at 640px centered on a 1024 transparent
//    canvas — the launcher mask's safe zone is the central 66%.
const pad = { top: 192, bottom: 192, left: 192, right: 192, background: { r: 0, g: 0, b: 0, alpha: 0 } };
await sharp(Buffer.from(markSvg), { density: DENSITY })
  .resize(640, 640)
  .extend(pad)
  .png()
  .toFile('assets/images/android-icon-foreground.png');

// 3. Monochrome (themed icons): white dial silhouette with the holes/heart
//    punched out via dest-out compositing.
const discOnly = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><circle cx="120" cy="120" r="112" fill="#FFFFFF"/></svg>`;
const cutouts = markSvg
  .replace('<circle cx="120" cy="120" r="112" fill="#D9331F"/>', '')
  .replaceAll('#FFF7E8', '#FFFFFF');
const disc = await sharp(Buffer.from(discOnly), { density: DENSITY }).resize(640, 640).png().toBuffer();
const holes = await sharp(Buffer.from(cutouts), { density: DENSITY }).resize(640, 640).png().toBuffer();
await sharp(disc)
  .composite([{ input: holes, blend: 'dest-out' }])
  .extend(pad)
  .png()
  .toFile('assets/images/android-icon-monochrome.png');

// 4. Splash icon: the mark on transparent (splash background is butter).
await sharp(Buffer.from(markSvg), { density: DENSITY })
  .resize(512, 512)
  .png()
  .toFile('assets/images/splash-icon.png');

// 5. Web favicon.
await sharp(Buffer.from(markSvg), { density: DENSITY })
  .resize(48, 48)
  .png()
  .toFile('assets/images/favicon.png');

console.log('brand assets generated');
