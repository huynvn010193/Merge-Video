import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { promisify } from "node:util";
import { MAX_BYTES } from "./video";

export const execute = promisify(execFile);
export const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
export const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
export const inputOptions = ["-protocol_whitelist", "file", "-format_whitelist", "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi"];

export function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function readVideoForm(request: Request) {
  const limit = MAX_BYTES + 1024 * 1024;
  const tooLarge = () => fail("Tổng dung lượng video vượt quá 250 MB.", 413);
  if (Number(request.headers.get("content-length")) > limit) return tooLarge();

  const contentType = request.headers.get("content-type");
  if (!request.body || !contentType?.startsWith("multipart/form-data;")) {
    return fail("Yêu cầu tải video không hợp lệ.", 400);
  }

  let received = 0;
  const boundedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > limit) throw new Error("Request exceeds upload limit");
      controller.enqueue(chunk);
    },
  }));
  const form = await new Response(boundedBody, { headers: { "content-type": contentType } })
    .formData().catch(() => null);
  if (received > limit) return tooLarge();
  return form ?? fail("Không đọc được dữ liệu tải lên.", 400);
}

export async function saveVideo(file: File, path: string, signal: AbortSignal) {
  const stream = Readable.fromWeb(file.stream() as NodeReadableStream<Uint8Array>);
  await pipeline(stream, createWriteStream(path), { signal });
}

export async function downloadVideo(path: string, directory: string, filename: string) {
  const { size } = await stat(path);
  const stream = createReadStream(path);
  // Keep the file available until the response finishes or is cancelled.
  stream.once("close", () => {
    void rm(directory, { recursive: true, force: true }).catch(console.error);
  });
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
