/**
 * 고정 경로가 필요한 이미지를 원본에서 만들어 public/ 에 둡니다.
 *
 * 본문 이미지는 Astro 가 해시 붙은 파일명으로 최적화합니다. 그런데 두 곳은
 * 빌드 전에 경로를 알아야 해서 해시가 붙으면 곤란합니다.
 *   - OG 메타태그: 절대 URL 이 필요 (1200×630)
 *   - 장바구니 썸네일: 브라우저 JS 가 그리므로 고정 경로가 필요 (240×320)
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'src/assets/images');
const OUT = resolve(root, 'public/og');

const OG_TARGETS = [
  { from: 'hero-runner-sunrise.jpg', to: 'home.jpg' },
  { from: 'product-daily-sunscreen.jpg', to: 'product.jpg' },
];

const THUMB_DIR = resolve(root, 'public/product');
const THUMB_TARGETS = [{ from: 'product-daily-sunscreen.jpg', to: 'thumb.jpg' }];

mkdirSync(OUT, { recursive: true });
mkdirSync(THUMB_DIR, { recursive: true });

for (const { from, to } of OG_TARGETS) {
  const info = await sharp(resolve(SRC, from))
    .resize(1200, 630, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toFile(resolve(OUT, to));
  console.log(`og → public/og/${to} (${Math.round(info.size / 1024)}KB)`);
}

for (const { from, to } of THUMB_TARGETS) {
  const info = await sharp(resolve(SRC, from))
    .resize(240, 320, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 74, progressive: true, mozjpeg: true })
    .toFile(resolve(THUMB_DIR, to));
  console.log(`thumb → public/product/${to} (${Math.round(info.size / 1024)}KB)`);
}
