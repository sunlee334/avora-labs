/**
 * 제품 사양 — **무엇이 확정이고 무엇이 아직 아닌가** 를 정하는 한 곳.
 *
 * ── 왜 모듈로 빼는가 ───────────────────────────────────────
 * 이 판정을 두 화면이 씁니다. 제품 페이지의 스펙표와 홈의 확정/미확정
 * 대조표입니다. 각자 알면 언젠가 한쪽만 고쳐지고, 그러면 홈은 "SPF50+
 * 확정" 이라고 하고 제품 페이지는 "목표" 라고 합니다.
 *
 * 이 저장소는 그 사고를 한 번 겪었습니다 — 홈에서 "워터리 젤", 스펙표에서
 * "로션·밀크" 라고 **동시에** 말하고 있었습니다.
 *
 * ── 확정의 뜻 ──────────────────────────────────────────────
 * `target: true` 는 "기획안이 값을 정해 주었지만 아직 확정이 아니다" 입니다.
 * 기능성화장품은 식약처 심사·보고가 남아 있어 차단지수를 확정 사실로 적으면
 * 표시·광고 문제가 됩니다(00-공통규칙 2-2). 그래서 값이 있어도 확정이
 * 아닌 상태가 존재합니다.
 */
import type { Dict } from '../i18n';
import product from '../data/product.json';

export interface SpecRow {
  /** `product.json` 의 키. 대조표가 "무엇을 기다리는지" 를 찾는 데 씁니다. */
  id: string;
  key: string;
  /** 값이 아직 없으면 `null` — 화면이 "확정 예정" 으로 그립니다. */
  value: string | null;
  /** 값은 있으나 확정은 아닌 상태. */
  target: boolean;
}

/**
 * 제품 페이지가 그리는 여덟 줄.
 *
 * 제형은 값 자체를 비웠습니다. 기획안 4장이 로션·밀크로 적어 두긴 했지만 같은
 * 장의 각주가 처방 선정 전이라고 못박고 있고, 고르기 전에는 고르는 중이라고
 * 적는 편이 맞습니다.
 */
export function specRows(t: Dict): SpecRow[] {
  const s = t.product.spec;
  return [
    { id: 'protection', key: s.labels.protection, value: product.spec.protection, target: true },
    { id: 'texture', key: s.labels.texture, value: null, target: true },
    { id: 'waterResistant', key: s.labels.waterResistant, value: s.values.waterResistant, target: true },
    { id: 'volume', key: s.labels.volume, value: product.spec.volume, target: false },
    { id: 'scent', key: s.labels.scent, value: s.values.scent, target: false },
    { id: 'tone', key: s.labels.tone, value: s.values.tone, target: false },
    { id: 'area', key: s.labels.area, value: s.values.area, target: false },
    { id: 'category', key: s.labels.category, value: s.values.category, target: false },
  ];
}

/**
 * 홈 대조표가 쓰는 두 덩이.
 *
 * ── 오른쪽 열은 값이 아닙니다 ──────────────────────────────
 * "아직 정해지지 않은 것" 칸에는 값 대신 **무엇을 기다리는지** 가 들어갑니다.
 * 값을 임의로 채우면 비어 있다는 사실 자체가 사라지는데, 그 비어 있음이
 * 이 표의 요점입니다.
 *
 * 용기는 `spec` 이 아니라 `disclosure` 쪽 항목이라 여기서 따로 붙입니다 —
 * `$pending` 이 "용기 발주 후 확정" 이라고 적어 두었습니다.
 */
export function compareRows(t: Dict) {
  const table = t.home.product.table;
  const rows = specRows(t);

  /*
   * 대조표는 스펙표보다 짧습니다. 톤·사용 부위·분류처럼 제품을 고르는 데
   * 직접 쓰이지 않는 줄은 제품 페이지에 남기고, 여기서는 사람이 "정해졌나
   * 아직인가" 를 궁금해하는 것만 보여줍니다.
   */
  const SHOWN = ['protection', 'texture', 'waterResistant', 'volume', 'scent'];
  const shown = rows.filter((row) => SHOWN.includes(row.id));

  return {
    settled: shown
      .filter((row) => !row.target && row.value)
      .map((row) => ({ key: row.key, value: row.value! })),
    unsettled: [
      ...shown
        .filter((row) => row.target)
        .map((row) => ({
          key: row.key,
          wait: table.waits[row.id as keyof typeof table.waits],
        })),
      // 용기는 스펙표에 없지만 손님이 궁금해하는 항목이라 대조표에는 넣습니다.
      { key: table.container, wait: table.waits.container },
    ],
  };
}
