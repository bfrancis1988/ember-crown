// scripts/generate-splash-logo.cjs
// Regenerates the Android 12 splash icon (`splashscreen_logo.png`) for every
// density. The native android/ folder is gitignored, so this script is the
// tracked record of how those PNGs are produced.
//
// Android 12's splash shows one centered icon over windowSplashScreenBackground
// (#0a0a0f). Each density file is a square canvas (288dp). We scale the source
// art to FILL_RATIO of the canvas HEIGHT, centered on a transparent canvas, so
// the logo reads larger without going edge-to-edge.
//
// Run: node scripts/generate-splash-logo.cjs

const sharp = require('sharp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'splash-icon.png');

// Android 12 splash icon canvas = 288dp, emitted at each density multiplier.
const DENSITIES = { mdpi: 288, hdpi: 432, xhdpi: 576, xxhdpi: 864, xxxhdpi: 1152 };

// Fraction of the square the art fills (by its limiting dimension). The source
// is tall, so this is effectively "% of canvas height". 0.90 = noticeably
// larger than the prior build, with a thin margin (not edge-to-edge).
const FILL_RATIO = 0.9;

function outPath(density) {
  return path.join(
    ROOT,
    'android', 'app', 'src', 'main', 'res',
    `drawable-${density}`,
    'splashscreen_logo.png',
  );
}

(async () => {
  for (const [density, size] of Object.entries(DENSITIES)) {
    const box = Math.round(size * FILL_RATIO);
    const art = await sharp(SOURCE)
      .resize({ width: box, height: box, fit: 'inside' })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: art, gravity: 'center' }])
      .png()
      .toFile(outPath(density));

    console.log(`wrote drawable-${density}/splashscreen_logo.png (${size}x${size})`);
  }
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
