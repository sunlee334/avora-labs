/*
 * 생성된 파일입니다. 고치지 마세요 — `npm run email:dict` 가 덮어씁니다.
 *
 * 원본은 `src/i18n/{언어}.json` 의 `email` 절과 `home.timeline.steps` 입니다.
 * 문구를 고치려면 그쪽을 고치세요. 빌드가 이 파일을 다시 만듭니다.
 */
import type { EmailDict } from '../../src/lib/email.ts';
import type { Locale } from '../../src/config/site.ts';

export const EMAIL_DICT: Record<Locale, EmailDict> = {
  ko: {
    "email": {
      "notify": {
        "subject": "PAROS 출시 알림 신청이 접수되었습니다",
        "body": "{email} 로 신청해 주셔서 감사합니다.\n\n앞으로 이 주소로 보내드릴 소식은 세 가지입니다.\n\n{list}\n\n자주 보내지 않습니다.",
        "unsubscribe": "받지 않으시려면 아래 링크로 언제든 해지하실 수 있습니다."
      },
      "panel": {
        "subject": "PAROS 검증단 지원이 접수되었습니다",
        "body": "{email} 로 지원해 주셔서 감사합니다.\n\n10월 중 선정 결과를 이 주소로 알려드리겠습니다.\n선정되신 분께는 샘플 발송 일정과 평가 방법을 함께 안내드립니다.\n\n지원해 주신 내용을 확인하거나 취소하고 싶으시면 이 메일에 회신해 주세요."
      }
    },
    "home": {
      "timeline": {
        "steps": [
          {
            "when": "2026.10",
            "what": "공장 샘플 비교"
          },
          {
            "when": "2026.11",
            "what": "고르는 기준 공개 · 패키지 확정"
          },
          {
            "when": "2026.12",
            "what": "처방 확정"
          },
          {
            "when": "2027.02",
            "what": "펀딩 오픈"
          },
          {
            "when": "2027 상반기",
            "what": "정식 출시"
          }
        ]
      }
    }
  },
  en: {
    "email": {
      "notify": {
        "subject": "Your PAROS launch notification request is confirmed",
        "body": "Thank you for signing up with {email}.\n\nThere are three things we will send to this address.\n\n{list}\n\nWe do not write often.",
        "unsubscribe": "You can unsubscribe at any time using the link below."
      },
      "panel": {
        "subject": "Your PAROS test panel application is confirmed",
        "body": "Thank you for applying with {email}.\n\nWe will send the selection result to this address during October.\nThose selected will also receive the sample shipping schedule and how the evaluation works.\n\nIf you would like to check or withdraw your application, simply reply to this email."
      }
    },
    "home": {
      "timeline": {
        "steps": [
          {
            "when": "Oct 2026",
            "what": "Factory samples compared"
          },
          {
            "when": "Nov 2026",
            "what": "Standard published · package set"
          },
          {
            "when": "Dec 2026",
            "what": "Formula decided"
          },
          {
            "when": "Feb 2027",
            "what": "Funding opens"
          },
          {
            "when": "H1 2027",
            "what": "Launch"
          }
        ]
      }
    }
  },
  zh: {
    "email": {
      "notify": {
        "subject": "PAROS 上市通知申请已受理",
        "body": "感谢您使用 {email} 提交申请。\n\n今后我们会向该地址发送三类消息。\n\n{list}\n\n我们不会频繁发送。",
        "unsubscribe": "如不希望继续接收，可随时通过下方链接退订。"
      },
      "panel": {
        "subject": "PAROS 验证团申请已受理",
        "body": "感谢您使用 {email} 提交申请。\n\n我们将在十月内把入选结果发送到该地址。\n入选者还会收到样品寄送安排与评估方式的说明。\n\n如需确认或撤回申请，直接回复本邮件即可。"
      }
    },
    "home": {
      "timeline": {
        "steps": [
          {
            "when": "2026.10",
            "what": "工厂样品比较"
          },
          {
            "when": "2026.11",
            "what": "公开挑选标准 · 包装确定"
          },
          {
            "when": "2026.12",
            "what": "配方确定"
          },
          {
            "when": "2027.02",
            "what": "众筹开启"
          },
          {
            "when": "2027 上半年",
            "what": "正式发售"
          }
        ]
      }
    }
  },
  th: {
    "email": {
      "notify": {
        "subject": "รับคำขอรับการแจ้งเตือนการเปิดตัว PAROS แล้ว",
        "body": "ขอบคุณที่สมัครด้วย {email}\n\nเราจะส่งข่าวสารสามเรื่องไปยังที่อยู่นี้\n\n{list}\n\nเราไม่ส่งบ่อย",
        "unsubscribe": "หากไม่ต้องการรับ สามารถยกเลิกได้ทุกเมื่อผ่านลิงก์ด้านล่าง"
      },
      "panel": {
        "subject": "รับใบสมัครคณะผู้ทดสอบ PAROS แล้ว",
        "body": "ขอบคุณที่สมัครด้วย {email}\n\nเราจะแจ้งผลการคัดเลือกไปยังที่อยู่นี้ภายในเดือนตุลาคม\nผู้ที่ได้รับเลือกจะได้รับกำหนดการจัดส่งตัวอย่างและวิธีการประเมินด้วย\n\nหากต้องการตรวจสอบหรือยกเลิกใบสมัคร กรุณาตอบกลับอีเมลฉบับนี้"
      }
    },
    "home": {
      "timeline": {
        "steps": [
          {
            "when": "ต.ค. 2026",
            "what": "เทียบตัวอย่างจากโรงงาน"
          },
          {
            "when": "พ.ย. 2026",
            "what": "เปิดเผยเกณฑ์ · สรุปแพ็กเกจ"
          },
          {
            "when": "ธ.ค. 2026",
            "what": "สรุปสูตร"
          },
          {
            "when": "ก.พ. 2027",
            "what": "เปิดระดมทุน"
          },
          {
            "when": "ครึ่งแรก 2027",
            "what": "วางจำหน่าย"
          }
        ]
      }
    }
  },
  vi: {
    "email": {
      "notify": {
        "subject": "Đã tiếp nhận đăng ký nhận thông báo ra mắt PAROS",
        "body": "Cảm ơn bạn đã đăng ký với {email}.\n\nChúng tôi sẽ gửi ba tin đến địa chỉ này.\n\n{list}\n\nChúng tôi không gửi thường xuyên.",
        "unsubscribe": "Nếu không muốn nhận, bạn có thể hủy bất cứ lúc nào bằng liên kết bên dưới."
      },
      "panel": {
        "subject": "Đã tiếp nhận đơn đăng ký nhóm kiểm chứng PAROS",
        "body": "Cảm ơn bạn đã đăng ký với {email}.\n\nChúng tôi sẽ gửi kết quả tuyển chọn đến địa chỉ này trong tháng Mười.\nNgười được chọn sẽ nhận thêm lịch gửi mẫu và cách thức đánh giá.\n\nNếu muốn kiểm tra hoặc rút đơn, bạn chỉ cần trả lời email này."
      }
    },
    "home": {
      "timeline": {
        "steps": [
          {
            "when": "10/2026",
            "what": "So sánh mẫu từ nhà máy"
          },
          {
            "when": "11/2026",
            "what": "Công bố tiêu chí · chốt bao bì"
          },
          {
            "when": "12/2026",
            "what": "Chốt công thức"
          },
          {
            "when": "02/2027",
            "what": "Mở gọi vốn"
          },
          {
            "when": "Nửa đầu 2027",
            "what": "Ra mắt"
          }
        ]
      }
    }
  },
};
