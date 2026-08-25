/**
 * SNS 공유용 OG 이미지를 원본에서 1200×630 으로 잘라 만듭니다.
 *
 * 본문 이미지는 Astro 가 해시 붙은 파일명으로 최적화하는데, OG 는 메타태그에
 * 고정된 절대 URL 이 필요해서 별도로 public/og/ 에 둡니다.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'src/assets/images');
const OUT = resolve(root, 'public/og');

const TARGETS = [
  { from: 'hero-runner-sunrise.jpg', to: 'home.jpg' },
  { from: 'product-daily-sunscreen.jpg', to: 'product.jpg' },
];

mkdirSync(OUT, { recursive: true });

for (const { from, to } of TARGETS) {
  const info = await sharp(resolve(SRC, from))
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toFile(resolve(OUT, to));
  console.log(`og → public/og/${to} (${Math.round(info.size / 1024)}KB)`);
}
