/** 元画像の寸法・背景・透過の分布を調べる（取り込み方法を決めるため） */
import { existsSync } from 'node:fs';

import sharp from 'sharp';

for (const name of ['logo', 'logo-white', 'icon']) {
  const path = `assets/brand/source/${name}.png`;
  if (!existsSync(path)) continue;

  const meta = await sharp(path).metadata();
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  const total = info.width * info.height;

  let opaque = 0;
  let transparent = 0;
  let partial = 0;
  for (let i = 3; i < data.length; i += ch) {
    const a = data[i];
    if (a === 255) opaque++;
    else if (a === 0) transparent++;
    else partial++;
  }

  const px = (x, y) => {
    const i = (y * info.width + x) * ch;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  console.log(`\n=== ${name}.png ===`);
  console.log(`  寸法      : ${meta.width}x${meta.height}`);
  console.log(
    `  透過      : 不透明 ${((opaque / total) * 100).toFixed(1)}% / ` +
      `完全透過 ${((transparent / total) * 100).toFixed(1)}% / ` +
      `半透明 ${((partial / total) * 100).toFixed(1)}%`,
  );
  console.log(`  左上      : rgba(${px(4, 4).join(', ')})`);
  console.log(`  右下      : rgba(${px(info.width - 5, info.height - 5).join(', ')})`);
}
