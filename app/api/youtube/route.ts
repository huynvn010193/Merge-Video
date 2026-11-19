import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_BYTES, MAX_UPLOAD_LABEL } from "../../../lib/video";
import { downloadVideo, fail, ffmpeg } from "../../../lib/video-server";
import { youtubeVideoId } from "../../../lib/youtube";

export const runtime = "nodejs";

let importing = false;

async function importYouTube(url: string, directory: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const child = spawn(process.env.YOUTUBE_PYTHON_PATH || "python3", [
    join(process.cwd(), "scripts", "import_youtube.py"),
  ], { detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });

  return new Promise<{ title?: string; error?: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    function stopDownload() {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill();
        else process.kill(-child.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") console.error("Could not stop YouTube import", error);
      }
    }
    const timer = setTimeout(() => {
      timedOut = true;
      stopDownload();
    }, 10 * 60 * 1000);
    signal.addEventListener("abort", stopDownload, { once: true });
    if (signal.aborted) stopDownload();

    function cleanup() {
      clearTimeout(timer);
      signal.removeEventListener("abort", stopDownload);
    }
    child.stdout.on("data", (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-16_384); });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.stdin.on("error", () => {
      // Early process exits are reported through error/close below.
    });
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("close", (code) => {
      cleanup();
      if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
      if (timedOut) return resolve({ error: "timeout" });
      if (code !== 0) {
        console.error("YouTube importer exited", code, stderr);
        return resolve({ error: "download" });
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ error: "download" });
      }
    });
    child.stdin.end(JSON.stringify({
      url,
      directory,
      maxBytes: MAX_BYTES,
      ffmpeg,
      node: process.execPath,
    }));
  });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 4096) return fail("Link quá dài.", 413);
  if (!request.body) return fail("Hãy nhập link YouTube.", 400);

  // Bound JSON input even when Content-Length is missing.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        return fail("Link quá dài.", 413);
      }
      chunks.push(value);
    }
  } catch {
    return fail("Không đọc được link YouTube.", 400);
  }
  const body = await new Response(Buffer.concat(chunks)).json().catch(() => null) as { url?: unknown } | null;
  const id = typeof body?.url === "string" ? youtubeVideoId(body.url) : null;
  if (!id) return fail("Hãy nhập link video YouTube hoặc Shorts hợp lệ.", 400);
  if (importing) return fail("Đang tải một video YouTube. Vui lòng thử lại sau.", 503);

  importing = true;
  let directory: string | undefined;
  let streaming = false;
  try {
    directory = await mkdtemp(join(tmpdir(), "clipjoin-youtube-"));
    const result = await importYouTube(`https://www.youtube.com/watch?v=${id}`, directory, request.signal);
    if (result.error) {
      const messages: Record<string, string> = {
        dependency: "Máy chủ cần cài Python và yt-dlp để tải video YouTube.",
        size: `Video YouTube vượt quá ${MAX_UPLOAD_LABEL}. Hãy chọn video ngắn hơn.`,
        live: "Hãy chọn video đã đăng hoàn tất để cắt.",
        timeout: "Tải YouTube quá lâu. Hãy thử lại hoặc chọn video ngắn hơn.",
        download: "Không tải được video YouTube. Video có thể bị xóa, giới hạn truy cập hoặc YouTube đang chặn tải. Bạn có thể tải tệp từ máy để cắt.",
      };
      return fail(messages[result.error] || messages.download, result.error === "size" ? 413 : 422);
    }
    const response = await downloadVideo(join(directory, "source.mp4"), directory, "youtube.mp4");
    response.headers.set("X-Video-Title", encodeURIComponent(result.title || "YouTube video"));
    streaming = true;
    return response;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fail("Máy chủ cần cài Python để tải video YouTube.", 503);
    }
    if (!request.signal.aborted) console.error("YouTube import failed", error);
    return fail("Không tải được video YouTube. Vui lòng thử lại.", 502);
  } finally {
    importing = false;
    if (directory && !streaming) {
      await rm(directory, { recursive: true, force: true }).catch(console.error);
    }
  }
}
