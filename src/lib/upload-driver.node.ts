import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Node 런타임 업로드 드라이버: 로컬 디스크(기본 ./data/uploads).
 * Cloudflare Workers 빌드에서는 upload-driver.workerd.ts(R2) 가 alias 로 대신 사용된다.
 */
const DEFAULT_ROOT = path.join(process.cwd(), "data", "uploads");

function root(): string {
  const custom = process.env.UPLOAD_DIR;
  return custom ? path.resolve(custom) : DEFAULT_ROOT;
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  void contentType; // 로컬 디스크는 확장자로 타입을 판단한다
  const target = path.join(root(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

export async function getObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string | null } | null> {
  const base = root();
  const target = path.resolve(base, key);
  if (!target.startsWith(base + path.sep)) return null;
  try {
    const body = await readFile(target);
    return { body: new Uint8Array(body), contentType: null };
  } catch {
    return null;
  }
}
