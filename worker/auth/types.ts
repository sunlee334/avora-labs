/**
 * 소셜 로그인 제공자 인터페이스.
 *
 * 결제 어댑터와 같은 모양입니다. 카카오를 붙이든 네이버를 붙이든 화면과
 * 계정 코드는 바뀌지 않도록 이 인터페이스 뒤에 둡니다.
 *
 * **비밀번호는 어디에도 없습니다.** 이 서비스는 비밀번호를 받지도 저장하지도
 * 않습니다. 유출될 것이 없고, 재설정·잠금·무차별 대입 방어를 만들 필요도
 * 없습니다. 그 책임을 제공자에게 넘기는 것이 소셜 로그인을 고른 이유입니다.
 */

export interface AuthProfile {
  /** 제공자 안에서 이 사람을 가리키는 고유 id. 우리 쪽 식별자의 절반입니다. */
  providerUserId: string;
  /**
   * 이메일. **없을 수 있습니다.**
   *
   * 카카오는 이메일을 필수 동의로 설정해도, 사용자가 카카오계정에 이메일을
   * 등록하지 않았으면 값을 주지 않습니다. 그래서 이메일을 계정 식별자로
   * 쓰지 않습니다 — 그랬다면 그런 사용자는 로그인 자체가 막힙니다.
   */
  email?: string;
  name?: string;
}

export interface AuthStart {
  /** 사용자를 보낼 제공자 로그인 주소 */
  authorizeUrl: string;
  /** CSRF 방지용 난수. 콜백에서 대조합니다 */
  state: string;
}

export type ExchangeResult =
  | { ok: true; profile: AuthProfile }
  | { ok: false; error: string; message: string };

export interface AuthProvider {
  readonly name: string;
  /** 이 제공자가 동작하는 데 필요한 키가 환경에 들어 있는지 */
  isConfigured(env: Record<string, unknown>): boolean;
  /** 로그인 시작 — 제공자로 보낼 주소를 만듭니다 */
  start(redirectUri: string, state: string, env: Record<string, unknown>): AuthStart;
  /** 콜백에서 받은 인가 코드를 프로필로 바꿉니다 */
  exchange(
    code: string,
    redirectUri: string,
    env: Record<string, unknown>,
  ): Promise<ExchangeResult>;
}
