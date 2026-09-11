import { NextResponse } from "next/server";
import { readUpload } from "@/lib/uploads";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const file = await readUpload(path);
  if (!file) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
