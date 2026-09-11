import { describe, expect, it } from "vitest";
import { TEMP_PASSWORD_TTL_MS, tempPasswordState } from "@/lib/auth/temp-password";

describe("tempPasswordState", () => {
  const now = new Date("2026-09-11T00:00:00Z");

  it("is ok for a normal account", () => {
    expect(tempPasswordState({ passwordResetRequired: false, tempPasswordExpiresAt: null }, now)).toBe("ok");
    // 과거 만료 시각이 남아 있어도 플래그가 꺼져 있으면 정상 계정이다 (비밀번호를 이미 바꿨음)
    expect(tempPasswordState({ passwordResetRequired: false, tempPasswordExpiresAt: new Date(now.getTime() - 1) }, now)).toBe("ok");
  });

  it("requires a reset while the temporary password is still valid", () => {
    const expiresAt = new Date(now.getTime() + TEMP_PASSWORD_TTL_MS);
    expect(tempPasswordState({ passwordResetRequired: true, tempPasswordExpiresAt: expiresAt }, now)).toBe("reset_required");
    // 만료 시각이 없는 옛 데이터도 재설정만 요구한다
    expect(tempPasswordState({ passwordResetRequired: true, tempPasswordExpiresAt: null }, now)).toBe("reset_required");
  });

  it("expires exactly at the deadline", () => {
    const expiresAt = new Date(now.getTime() + 1000);
    expect(tempPasswordState({ passwordResetRequired: true, tempPasswordExpiresAt: expiresAt }, now)).toBe("reset_required");
    expect(tempPasswordState({ passwordResetRequired: true, tempPasswordExpiresAt: expiresAt }, new Date(expiresAt.getTime()))).toBe("expired");
    expect(tempPasswordState({ passwordResetRequired: true, tempPasswordExpiresAt: expiresAt }, new Date(expiresAt.getTime() + 1))).toBe("expired");
  });

  it("ttl is 24 hours", () => {
    expect(TEMP_PASSWORD_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
