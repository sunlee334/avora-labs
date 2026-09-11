import "server-only";
import { randomBytes } from "node:crypto";
import { getObject, putObject } from "paros-upload-driver";

/**
 * 파일 저장을 한 곳에 격리한다. 실제 저장소는 런타임별 드라이버가 담당한다.
 * - Node(로컬): ./data/uploads (UPLOAD_DIR 로 변경 가능)
 * - Cloudflare Workers: R2 바인딩 UPLOADS
 * 서빙은 /api/uploads/[...path] 라우트가 담당한다.
 */
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UPLOAD_FOLDERS = new Set(["reviews"]);

export async function saveImage(folder: "reviews", file: File): Promise<{ url: string }> {
  const ext = ALLOWED.get(file.type);
  if (!ext) throw new Error("UNSUPPORTED_TYPE");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("FILE_TOO_LARGE");
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeImage(buffer, file.type)) throw new Error("UNSUPPORTED_TYPE");

  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
  await putObject(`${folder}/${name}`, buffer, file.type);
  return { url: `/api/uploads/${folder}/${name}` };
}

/** 경로 세그먼트를 검증한 뒤 드라이버에서 읽는다. */
export async function readUpload(
  segments: string[],
): Promise<{ body: Uint8Array; contentType: string } | null> {
  // 폴더는 우리가 쓰는 것만 허용하고, Content-Type 은 저장된 메타데이터가 아닌 확장자 허용 목록에서만 정한다
  // (버킷에 다른 경로로 들어온 객체가 앱 오리진에서 HTML 등으로 서빙되지 않도록).
  if (segments.length !== 2 || !UPLOAD_FOLDERS.has(segments[0]!) || !segments.every((s) => SAFE_SEGMENT.test(s))) {
    return null;
  }
  const key = segments.join("/");
  const contentType = contentTypeFromKey(key);
  if (contentType === "application/octet-stream") return null;
  const object = await getObject(key);
  if (!object) return null;
  return { body: object.body, contentType };
}

function contentTypeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

/** 매직 넘버 검사 */
function looksLikeImage(buf: Uint8Array, mime: string): boolean {
  if (buf.length < 12) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === "image/png")
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (mime === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  return false;
}
