import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT, type JWK } from 'jose';
import { parseAllowlist, isAllowedAdmin, verifyAdmin } from '../../worker/admin';

/**
 * 관리자 허용 목록.
 *
 * ── 왜 서명 검증만으로는 부족한가 ─────────────────────────────
 * Cloudflare Access 의 서명이 말해 주는 것은 "정책을 통과한 사람" 까지입니다.
 * **누구를** 통과시킬지는 대시보드의 정책이 정하고, 그 정책은 이 저장소
 * 밖에 있습니다. 정책이 넓게 잡히면(아무 이메일이나, 또는 gmail.com 전체)
 * 서명은 멀쩡한 채로 남이 들어옵니다. 대시보드에서 한 줄 바꾸는 일은
 * diff 에도, 테스트에도 남지 않습니다.
 *
 * 그래서 자물쇠를 하나 더 겁니다. 여기 있는 테스트가 그 자물쇠를 봅니다.
 *
 * ── 왜 브라우저를 띄우지 않는가 ───────────────────────────────
 * Access 는 요청이 Worker 에 닿기 전에 Cloudflare 가 붙이는 것이라
 * `wrangler dev` 로는 재현할 수 없고, 카카오 웹훅과 달리 우리가 서명을
 * 흉내 낼 수도 없습니다(공개키가 Cloudflare 것입니다). 그래서 판단하는
 * 함수를 직접 부릅니다 — 검증하지 못한 채 두는 것보다 낫습니다.
 */

test.describe('허용 목록 해석', () => {
  test('쉼표로 나누고 공백과 대소문자를 정리한다', () => {
    expect(parseAllowlist({ ADMIN_ALLOWED_EMAILS: ' A@b.com , C@D.com ' })).toEqual([
      'a@b.com',
      'c@d.com',
    ]);
  });

  test('빈 항목은 버린다', () => {
    // "a@b.com," 처럼 쉼표가 남으면 빈 문자열이 생깁니다. 그게 목록에
    // 들어가면 이메일 없는 토큰이 통과할 수 있습니다.
    expect(parseAllowlist({ ADMIN_ALLOWED_EMAILS: 'a@b.com,,  ,' })).toEqual(['a@b.com']);
  });

  test('설정이 없으면 빈 목록이다', () => {
    expect(parseAllowlist({})).toEqual([]);
  });
});

test.describe('누가 들어올 수 있는가', () => {
  const list = parseAllowlist({ ADMIN_ALLOWED_EMAILS: 'owner@example.com' });

  test('목록에 있으면 들어온다', () => {
    expect(isAllowedAdmin('owner@example.com', list)).toBe(true);
  });

  test('대소문자와 공백이 달라도 같은 사람이다', () => {
    // 제공자마다 표기가 다르게 올 수 있습니다.
    expect(isAllowedAdmin('  Owner@Example.COM  ', list)).toBe(true);
  });

  test('목록에 없으면 막힌다', () => {
    expect(isAllowedAdmin('someone@example.com', list)).toBe(false);
  });

  test('비슷하기만 한 주소는 막힌다', () => {
    // 부분 일치로 비교하면 전부 뚫립니다.
    for (const attempt of [
      'owner@example.com.attacker.com',
      'attacker+owner@example.com.evil.io',
      'wner@example.com',
      'owner@example.co',
      'owner@example.com ,attacker@evil.io',
    ]) {
      expect(isAllowedAdmin(attempt, list), attempt).toBe(false);
    }
  });

  test('이메일이 없는 토큰은 막힌다', () => {
    // 서비스 토큰에는 email 대신 common_name 이 옵니다. 지금 쓰지 않고,
    // 쓰게 되면 목록과 별개로 명시해야 합니다.
    for (const missing of [undefined, null, '', '   ', 123, {}]) {
      expect(isAllowedAdmin(missing, list), String(missing)).toBe(false);
    }
  });

  test('목록이 비어 있으면 아무도 못 들어온다 — 전부 허용이 아니다', () => {
    // 여기가 이 파일에서 가장 중요한 줄입니다. "설정하지 않았으니 전부 허용"
    // 이면 변수를 지우는 순간 조용히 문이 열립니다. 잠기는 쪽이어야 합니다.
    expect(isAllowedAdmin('owner@example.com', [])).toBe(false);
    expect(isAllowedAdmin('anyone@anywhere.com', [])).toBe(false);
  });
});

test.describe('배포 설정', () => {
  /*
   * 위 테스트들은 함수가 옳게 판단하는지만 봅니다. 정작 **운영에 목록이
   * 들어 있는지**는 아무도 확인하지 않으므로 여기서 파일을 직접 읽습니다.
   * 비어 있으면 관리 화면이 아무에게도 열리지 않는 상태가 조용히 계속됩니다.
   */
  const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf-8');
  const varOf = (name: string): string | null => {
    const m = wrangler.match(new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`));
    return m ? m[1] : null;
  };

  test('Access 를 설정했다면 허용 목록도 있어야 한다', () => {
    const accessOn = Boolean(varOf('ACCESS_TEAM_DOMAIN') && varOf('ACCESS_POLICY_AUD'));
    if (!accessOn) test.skip();

    const raw = varOf('ADMIN_ALLOWED_EMAILS');
    expect(raw, 'ADMIN_ALLOWED_EMAILS 가 없습니다 — 관리 화면이 아무에게도 열리지 않습니다').toBeTruthy();
    expect(parseAllowlist({ ADMIN_ALLOWED_EMAILS: raw! }).length).toBeGreaterThan(0);
  });

  test('목록의 항목이 전부 이메일 모양이다', () => {
    const entries = parseAllowlist({ ADMIN_ALLOWED_EMAILS: varOf('ADMIN_ALLOWED_EMAILS') ?? '' });
    for (const entry of entries) {
      // 도메인 전체를 넣는 실수(@gmail.com)를 막습니다. 그건 목록이 아니라
      // 문이 열린 것입니다.
      expect(entry, entry).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
    }
  });

  test('목록이 작다 — 관리 화면은 소수만 봅니다', () => {
    // 숫자 자체가 중요한 게 아니라, 늘어날 때 눈에 띄는 것이 중요합니다.
    const entries = parseAllowlist({ ADMIN_ALLOWED_EMAILS: varOf('ADMIN_ALLOWED_EMAILS') ?? '' });
    expect(entries.length).toBeLessThanOrEqual(5);
  });
});

test.describe('verifyAdmin 이 실제로 목록을 본다', () => {
  /*
   * 위 테스트들은 판단하는 함수만 봅니다. 그 함수를 **부르는 곳**이
   * 지워져도 전부 통과합니다 — 실제로 문을 지키는 것은 verifyAdmin 이므로
   * 여기서는 그것을 통째로 부릅니다.
   *
   * Cloudflare 의 서명은 흉내 낼 수 없지만, verifyAdmin 은 공개키를
   * `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` 에서 가져올 뿐입니다.
   * 그래서 그 주소를 우리가 띄운 서버로 돌리고, 우리 열쇠로 서명합니다.
   * 검증 논리는 운영과 완전히 같은 코드를 지납니다.
   */
  let server: Server;
  let teamDomain: string;
  let sign: (claims: Record<string, unknown>) => Promise<string>;
  let signWithOtherKey: (claims: Record<string, unknown>) => Promise<string>;

  const AUD = 'a'.repeat(64);
  const OWNER = 'owner@example.com';
  const env = () => ({
    ACCESS_TEAM_DOMAIN: teamDomain,
    ACCESS_POLICY_AUD: AUD,
    ADMIN_ALLOWED_EMAILS: OWNER,
  });
  const withToken = (token: string) =>
    new Request('https://avoralabs.co/api/admin/orders', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    });

  test.beforeAll(async () => {
    const ours = await generateKeyPair('RS256');
    const theirs = await generateKeyPair('RS256');
    const jwk: JWK = { ...(await exportJWK(ours.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

    server = createServer((req, res) => {
      if (req.url === '/cdn-cgi/access/certs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as { port: number };
    teamDomain = `http://127.0.0.1:${port}`;

    const make = (key: CryptoKey) => (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(teamDomain)
        .setAudience(AUD)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
    sign = make(ours.privateKey);
    signWithOtherKey = make(theirs.privateKey);
  });

  test.afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  test('허용된 사람은 들어온다', async () => {
    const result = await verifyAdmin(withToken(await sign({ email: OWNER })), env());
    expect(result).toEqual({ ok: true, who: OWNER });
  });

  test('서명이 멀쩡해도 목록에 없으면 막힌다', async () => {
    // 이것이 이 파일의 핵심입니다. Access 정책이 넓어져 남이 로그인에
    // 성공해도 — 즉 서명·발급자·AUD 가 전부 맞아도 — 여기서 막힙니다.
    const result = await verifyAdmin(withToken(await sign({ email: 'stranger@example.com' })), env());
    expect(result).toMatchObject({ ok: false, status: 403, error: 'ACCESS_NOT_ALLOWED' });
  });

  test('목록이 비면 허용된 사람도 못 들어온다', async () => {
    const result = await verifyAdmin(withToken(await sign({ email: OWNER })), {
      ...env(),
      ADMIN_ALLOWED_EMAILS: '',
    });
    expect(result).toMatchObject({ ok: false, status: 403, error: 'ACCESS_NOT_ALLOWED' });
    // 무엇을 해야 열리는지 알려줍니다 — 잠긴 채 방치되는 것을 막습니다.
    expect((result as { message: string }).message).toContain('ADMIN_ALLOWED_EMAILS');
  });

  test('이메일 없는 서비스 토큰은 막힌다', async () => {
    const result = await verifyAdmin(withToken(await sign({ common_name: 'ci-runner' })), env());
    expect(result).toMatchObject({ ok: false, status: 403, error: 'ACCESS_NOT_ALLOWED' });
  });

  test('허용 목록에 있어도 서명이 다르면 막힌다', async () => {
    // 목록 검사가 서명 검사를 대체하지 않는지 봅니다.
    const result = await verifyAdmin(withToken(await signWithOtherKey({ email: OWNER })), env());
    expect(result).toMatchObject({ ok: false, status: 403, error: 'ACCESS_TOKEN_INVALID' });
  });

  test('Access 가 켜져 있으면 개발용 토큰은 쳐다보지도 않는다', async () => {
    const request = new Request('https://avoralabs.co/api/admin/orders', {
      headers: { 'X-Admin-Dev-Token': 'dev' },
    });
    const result = await verifyAdmin(request, { ...env(), ADMIN_DEV_TOKEN: 'dev' });
    expect(result).toMatchObject({ ok: false, status: 401, error: 'ACCESS_TOKEN_MISSING' });
  });
});
