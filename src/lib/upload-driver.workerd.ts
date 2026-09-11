import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare Workers 업로드 드라이버: R2 바인딩 `UPLOADS`.
 * R2 가 아직 활성화되지 않아 바인딩이 없으면 UPLOADS_UNAVAILABLE 을 던지고,
 * 리뷰 작성 폼은 사진 없이 등록하도록 안내한다.
 */
function bucket(): R2Bucket {
  const { env } = getCloudflareContext();
  const b = (env as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!b) throw new Error("UPLOADS_UNAVAILABLE");
  return b;
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await bucket().put(key, body, { httpMetadata: { contentType } });
}

export async function getObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string | null } | null> {
  let object: R2ObjectBody | null;
  try {
    object = await bucket().get(key);
  } catch {
    return null;
  }
  if (!object) return null;
  return {
    body: new Uint8Array(await object.arrayBuffer()),
    contentType: object.httpMetadata?.contentType ?? null,
  };
}
