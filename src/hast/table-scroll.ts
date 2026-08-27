import { defineHastPlugin } from 'satteri';

/**
 * 마크다운 표를 가로 스크롤 상자로 감쌉니다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────
 * `body` 에 `overflow-x: hidden` 이 걸려 있습니다(`global.css`). 그래서 넓은
 * 표가 화면을 넘치면 **가로 스크롤바조차 없이 글자만 잘려 보입니다.**
 * 태국어 제품 페이지에서 실제로 겪은 실패 모드이고, 그때는 아무도 몰랐습니다.
 *
 * ── 왜 CSS 로 안 하는가 ─────────────────────────────────────
 * `table { display: block; overflow-x: auto }` 가 흔한 요령이지만, 그러면
 * 일부 스크린리더에서 **표 시맨틱(행·열 탐색)이 사라집니다.** 표를 표가
 * 아니게 만들어 스크롤을 얻는 셈입니다.
 *
 * 감싸는 것이 옳은데, 마크다운이 만드는 태그에는 클래스를 붙일 수 없습니다.
 * 그래서 HTML 트리 단계에서 끼워 넣습니다.
 *
 * ── 키보드로도 스크롤할 수 있어야 합니다 ────────────────────
 * 스크롤 상자에 `tabindex` 가 없으면 마우스·터치로만 움직일 수 있습니다
 * (WCAG 2.1.1 키보드).
 *
 * `role="region"` 은 붙이지 않습니다. 이름 없는 지역은 스크린리더가
 * "지역" 이라고만 읽어 오히려 소음이 되고, 여기에 이름을 주려면 5개 언어
 * 번역이 필요한데 그 낱말은 글이 아니라 마크업에서 나오므로 폰트 서브셋
 * 수집에도 안 걸립니다. 표에 캡션이 필요하면 글쓴이가 마크다운에 씁니다.
 */
export const hastTableScroll = defineHastPlugin({
  name: 'hast-table-scroll',
  element: {
    filter: ['table'],
    visit(node, context) {
      context.wrapNode(node, {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['tableScroll'],
          // 넘치지 않는 표에도 붙습니다. 넘치는지는 빌드 시점에 알 수 없고,
          // 넘치지 않으면 초점이 가도 할 일이 없을 뿐입니다.
          tabIndex: 0,
        },
        children: [],
      });
    },
  },
});
