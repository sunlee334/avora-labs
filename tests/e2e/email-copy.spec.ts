import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { launchNotifyEmail, panelApplyEmail, type EmailDict } from '../../src/lib/email';
import { LOCALES, BUSINESS } from '../../src/config/site';

/**
 * 확인 메일 문구.
 *
 * 아직 보내지 않습니다(F2-1 발송 서비스 대기). 그래서 화면으로는 확인할 수
 * 없고, 여기가 이 문구를 지키는 유일한 자리입니다.
 */

function dictOf(locale: string): EmailDict {
  return JSON.parse(readFileSync(`src/i18n/${locale}.json`, 'utf8'));
}

const UNSUB = 'https://avoralabs.co/api/launch-notify/unsubscribe?t=TEST';

test.describe('확인 메일', () => {
  test('광고성 메시지가 되지 않는다', () => {
    /*
     * 이 메일은 신청이라는 거래에서 나오는 **정보성 메시지** 입니다. 그래서
     * `(광고)` 표기 없이, 야간 전송 제한 없이 보낼 수 있습니다.
     *
     * 그런데 **광고성 내용을 한 줄이라도 섞으면 그 순간 광고성 메시지가
     * 됩니다.** 그러면 표기 의무와 야간 제한이 따라붙고, 지금 상태로 보내면
     * 위반입니다. 문구를 손볼 때 가장 쉽게 무너지는 곳이라 검사로 막습니다.
     */
    const BANNED = [
      '(광고)', '[광고]',
      '할인', '쿠폰', '특가', '세일', '프로모션', '지금 구매', '구매하기',
      'discount', 'coupon', 'sale', 'promo', 'buy now', 'shop now', 'offer',
      '优惠', '折扣', '促销', '立即购买',
      'ส่วนลด', 'โปรโมชั่น', 'ซื้อเลย',
      'giảm giá', 'khuyến mãi', 'mua ngay',
    ];

    for (const locale of LOCALES) {
      const t = dictOf(locale);
      for (const mail of [launchNotifyEmail(t, 'a@b.com', UNSUB), panelApplyEmail(t, 'a@b.com')]) {
        const whole = `${mail.subject}\n${mail.text}`.toLowerCase();
        for (const word of BANNED) {
          expect(whole, `${locale} 메일에 "${word}" 가 있습니다`).not.toContain(word.toLowerCase());
        }
      }
    }
  });

  test('일정이 화면의 타임라인과 같다', () => {
    /*
     * 초안은 "2026년 12월 예정" 처럼 날짜를 본문에 박아 두었습니다. 그러면
     * 화면과 메일이 각자 날짜를 갖고, 일정이 밀렸을 때 한쪽만 고치면 손님이
     * 서로 다른 두 날짜를 봅니다.
     */
    for (const locale of LOCALES) {
      const t = dictOf(locale);
      const mail = launchNotifyEmail(t, 'a@b.com', UNSUB);
      const expected = t.home.timeline.steps.slice(-3);

      expect(expected.length, `${locale} 타임라인이 3개 미만`).toBe(3);
      for (const step of expected) {
        expect(mail.text, `${locale} 메일에 ${step.when} 이 없습니다`).toContain(step.when);
        expect(mail.text, `${locale} 메일에 "${step.what}" 이 없습니다`).toContain(step.what);
      }
    }
  });

  test('5개 언어 모두 제목과 본문이 있고, 자리표시자가 남지 않는다', () => {
    // `{email}` 이 그대로 나가면 받는 사람이 중괄호를 봅니다.
    for (const locale of LOCALES) {
      const t = dictOf(locale);
      for (const mail of [launchNotifyEmail(t, 'a@b.com', UNSUB), panelApplyEmail(t, 'a@b.com')]) {
        expect(mail.subject.length, `${locale} 제목이 비었습니다`).toBeGreaterThan(5);
        expect(mail.text.length, `${locale} 본문이 비었습니다`).toBeGreaterThan(40);
        expect(mail.text, `${locale} 에 채워지지 않은 자리표시자`).not.toMatch(/\{[a-z]+\}/);
        expect(mail.text, `${locale} 에 신청 주소가 없습니다`).toContain('a@b.com');
        expect(mail.text, `${locale} 에 연락처가 없습니다`).toContain(BUSINESS.email);
      }
    }
  });

  test('알림 메일에만 해지 링크가 있다', () => {
    /*
     * 검증단 지원 확인에는 해지 링크를 넣지 않습니다. 그 메일은 광고성 수신
     * 동의와 무관한 접수 확인이고, 링크를 넣으면 "해지하면 지원도 취소되나"
     * 라는 질문을 만듭니다. 취소는 답장으로 한다고 본문이 안내합니다.
     */
    for (const locale of LOCALES) {
      const t = dictOf(locale);
      expect(launchNotifyEmail(t, 'a@b.com', UNSUB).text).toContain(UNSUB);
      expect(panelApplyEmail(t, 'a@b.com').text).not.toContain('unsubscribe');
    }
  });
});
