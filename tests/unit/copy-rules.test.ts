import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

/** 지정한 디렉터리 아래에서 확장자가 일치하는 파일을 재귀적으로 모두 찾는다. */
function findFiles(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...findFiles(full, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

// 제품기획안 4-3, 4-4 금지 표현 (브랜드 카피 규칙 위반 시 리뷰 반려)
// "자체 개발"은 "자체 개발 처방"(주장) 형태로만 금지한다 — "자체 개발이 아니라 기성 처방입니다" 같은
// 정직 원칙(브리프: PAROS는 위탁 제조라는 사실을 숨기지 않는다) 서술은 정확히 반대 의미이므로 허용해야 한다.
const FORBIDDEN_STRINGS = [
  "스웨트프루프",
  "무백탁",
  "자체 개발 처방",
  "운동할 때 쓰는",
  "눈이 시리지 않은 선크림",
  "눈이 시리지 않는 선크림",
  "미백",
  "주름 개선",
  "여드름",
  "피부 재생",
];

/**
 * 번역본(EN·TH·VI·ZH)에도 같은 규칙을 건다. 한국어 금지어는 번역 파일에 나타나지 않으므로, 언어별로
 * 같은 취지의 표현(스웨트프루프, 미백·주름·여드름·재생 효능 주장, 자체 개발 처방 주장)을 따로 검사한다.
 * "no white cast"(백탁 없음)는 한국어에서도 허용되는 서술이라 금지하지 않는다.
 */
const FORBIDDEN_BY_LANGUAGE: Record<string, string[]> = {
  en: ["sweat-proof", "sweatproof", "whitening", "wrinkle", "acne", "skin regeneration", "in-house formula", "proprietary formula", "sting-free sunscreen"],
  th: ["กันเหงื่อ", "ไวท์เทนนิ่ง", "ผิวขาว", "ริ้วรอย", "สิว", "ฟื้นฟูผิว", "สูตรเฉพาะ"],
  vi: ["chống mồ hôi", "làm trắng", "trắng da", "nếp nhăn", "mụn", "tái tạo da", "công thức độc quyền"],
  zh: ["防汗", "美白", "皱纹", "痘", "痤疮", "皮肤再生", "自研配方", "独家配方"],
};

/** 파일 경로에서 번역 언어를 읽는다 (src/content/en.ts, src/i18n/messages/en.ts). 한국어·공용 파일은 undefined. */
function translationLanguage(file: string): string | undefined {
  const match = /[\\/](en|th|vi|zh)\.ts$/.exec(file);
  return match?.[1];
}

/** JSDoc/블록 주석은 정책을 인용하는 개발자 문서일 뿐 실제 노출 카피가 아니므로 스캔에서 제외한다. */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function scanTargets(): string[] {
  return [
    ...findFiles(path.join(ROOT, "src/content"), [".ts"]),
    ...findFiles(path.join(ROOT, "src/i18n/messages"), [".ts"]),
    ...findFiles(path.join(ROOT, "src/app"), [".tsx"]),
    ...findFiles(path.join(ROOT, "src/components"), [".tsx"]),
    ...findFiles(path.join(ROOT, "src/db"), [".ts"]),
  ];
}

describe("brand copy rules (제품기획안 4-3, 4-4)", () => {
  const files = scanTargets();

  it("found at least one file to scan", () => {
    // src/content는 항상 존재해야 한다. 다른 레인이 아직 페이지를 작성 중이면 app/components는 비어있을 수 있다.
    expect(files.length).toBeGreaterThan(0);
  });

  for (const forbidden of FORBIDDEN_STRINGS) {
    it(`no file contains the forbidden phrase "${forbidden}"`, () => {
      const offenders = files.filter((file) =>
        stripBlockComments(readFileSync(file, "utf8")).includes(forbidden),
      );
      expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
    });
  }

  for (const [lang, phrases] of Object.entries(FORBIDDEN_BY_LANGUAGE)) {
    const translated = files.filter((file) => translationLanguage(file) === lang);
    it(`${lang} translations exist and are scanned`, () => {
      expect(translated.length).toBeGreaterThan(0);
    });
    for (const forbidden of phrases) {
      it(`no ${lang} file contains "${forbidden}"`, () => {
        const offenders = translated.filter((file) =>
          stripBlockComments(readFileSync(file, "utf8")).toLowerCase().includes(forbidden.toLowerCase()),
        );
        expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
      });
    }
  }

  it("SiteFooter references COMPANY.mailOrderNumber (통신판매업 신고번호 표시 의무)", () => {
    const footerPath = path.join(ROOT, "src/components/site/SiteFooter.tsx");
    if (!existsSync(footerPath)) {
      // 아직 작성되지 않았다면 이 테스트는 건너뛴다 (다른 레인 작업 중일 수 있음).
      return;
    }
    const content = readFileSync(footerPath, "utf8");
    expect(content).toContain("COMPANY.mailOrderNumber");
  });
});
