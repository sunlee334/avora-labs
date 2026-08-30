/**
 * 번역 문구 접근 헬퍼.
 *
 * 문구를 고치려면 이 파일이 아니라 `src/i18n/{언어}.json` 을 고치세요.
 * 키 구조가 어긋나면 `node scripts/check-i18n.mjs` 가 잡아냅니다.
 */
import ko from './ko.json';
import en from './en.json';
import zh from './zh.json';
import th from './th.json';
import vi from './vi.json';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../config/site';

const DICTS = { ko, en, zh, th, vi } as const;

/**
 * ko.json 이 키 구조의 기준입니다.
 *
 * `$meta` 만 제외합니다 — ko 는 `source`, 나머지 넷은 `note` 를 가져 모양이
 * 다릅니다. 그것까지 포함하면 en·zh·th·vi 가 `Dict` 에 대입되지 않아
 * 사전을 타입으로 다루는 모든 곳이 캐스트를 필요로 하게 됩니다.
 * `$meta` 는 카피가 아니라 메타데이터이고, check-i18n 도 `$` 접두 키를
 * 콘텐츠로 세지 않습니다.
 */
export type Dict = Omit<typeof ko, '$meta'>;

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * 해당 언어의 사전을 돌려줍니다.
 * 알 수 없는 언어면 기본 언어로 넘어갑니다 — 빌드 중 잘못된 lang 이 들어와도 죽지 않게.
 */
export function dict(locale: string): Dict {
  return isLocale(locale) ? DICTS[locale] : DICTS[DEFAULT_LOCALE];
}

/**
 * 언어 접두어를 붙인 경로. 모든 내부 링크가 이 함수를 지납니다.
 *
 * ── 왜 끝에 슬래시를 붙이는가 ──────────────────────────────
 * 빌드 결과물은 디렉터리(`build.format: 'directory'`)라 실제로 서빙되는 주소는
 * `/ko/product/` 입니다. Cloudflare 는 `/ko/product` 로 들어오면 307 로 그쪽에
 * 넘깁니다. 그래서 슬래시를 빼면 canonical·hreflang·og:url·내부 링크가 전부
 * **리다이렉트되는 주소** 를 가리키게 됩니다. 사이트맵(@astrojs/sitemap)은
 * 슬래시를 붙이므로 서로 다른 주소를 신고하는 상태가 됩니다.
 *
 * `trailingSlash: 'ignore'` 라서 빌드는 이것을 잡아 주지 않습니다. 실제 서빙에서만
 * 드러나므로 여기서 형태를 하나로 고정합니다.
 *
 * ⚠️ 프래그먼트와 질의는 경로가 아닙니다. `#story` 뒤에 슬래시를 붙이면
 *    `/ko/#story/` 가 되어 앵커가 죽습니다. 내비게이션의 브랜드 항목이 실제로
 *    이 형태를 씁니다(`src/config/nav.ts`).
 */
export function localePath(locale: string, path = ''): string {
  const clean = path.replace(/^\/+/, '');
  if (!clean) return `/${locale}/`;

  const cut = clean.search(/[#?]/);
  if (cut === 0) return `/${locale}/${clean}`;

  const route = cut === -1 ? clean : clean.slice(0, cut);
  const tail = cut === -1 ? '' : clean.slice(cut);
  return `/${locale}/${route}/${tail}`;
}

/** 같은 페이지의 모든 언어 URL — hreflang alternates 에 씁니다. */
export function alternates(path = ''): Array<{ locale: Locale; path: string }> {
  return LOCALES.map((locale) => ({ locale, path: localePath(locale, path) }));
}
