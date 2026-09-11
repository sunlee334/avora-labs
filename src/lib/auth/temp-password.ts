/** 임시 비밀번호 유효 시간. 지나면 로그인 자체를 거부하고 다시 발급받게 한다. */
export const TEMP_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

export type TempPasswordState = "ok" | "reset_required" | "expired";

/**
 * 임시 비밀번호 상태 판정 (로그인·가드 공용).
 * - reset_required: 임시 비밀번호로 로그인 가능하지만 새 비밀번호를 정하기 전까지 계정·관리자 화면은 비밀번호 변경 화면으로 보낸다.
 * - expired: 발급 후 24시간이 지났고 아직 바꾸지 않았다 → 로그인 거부.
 */
export function tempPasswordState(
  user: { passwordResetRequired: boolean; tempPasswordExpiresAt: Date | null },
  now: Date = new Date(),
): TempPasswordState {
  if (!user.passwordResetRequired) return "ok";
  if (user.tempPasswordExpiresAt && user.tempPasswordExpiresAt.getTime() <= now.getTime()) return "expired";
  return "reset_required";
}
