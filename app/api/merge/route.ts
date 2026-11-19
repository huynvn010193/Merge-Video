import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formats, MAX_BYTES, MAX_UPLOAD_LABEL, MAX_CLIPS, type Format } from "../../../lib/video";

import { downloadVideo, execute, fail, ffmpeg, ffprobe, inputOptions, readVideoForm, saveVideo } from "../../../lib/video-server";

export const runtime = "nodejs";

let activeJob = false;

export async function POST(request: Request) {
  if (activeJob) return fail("Đang có một lượt ghép video. Vui lòng thử lại sau.", 503);
  let directory: string | undefined;
  let streaming = false;
  let currentClip = 0;
  activeJob = true;
  try {
    const form = await readVideoForm(request);
    if (form instanceof Response) return form;

    const files = form.getAll("videos");
    const format = form.get("format");
    if (typeof format !== "string" || !Object.hasOwn(formats, format)) {
      return fail("Tỉ lệ khung hình không hợp lệ.", 400);
    }
    if (files.length < 2 || files.length > MAX_CLIPS ||
        !files.every((file): file is File => file instanceof File && file.size > 0)) {
      return fail("Hãy chọn từ 2 đến 12 video hợp lệ.", 400);
    }
    if (files.reduce((size, file) => size + file.size, 0) > MAX_BYTES) {
      return fail(`Tổng dung lượng video vượt quá ${MAX_UPLOAD_LABEL}.`, 413);
    }

    const { width, height } = formats[format as Format];
    const { signal } = request;
    directory = await mkdtemp(join(tmpdir(), "clipjoin-"));
    const segments: string[] = [];

    for (const [index, file] of files.entries()) {
      currentClip = index + 1;
      const input = join(directory, `input-${index}`);
      const segment = `clip-${index}.mp4`;
      await saveVideo(file, input, signal);
      const { stdout } = await execute(ffprobe, [
        "-v", "error", ...inputOptions,
        "-show_entries", "stream=codec_type:stream_disposition=attached_pic",
        "-of", "json", input,
      ], { signal, timeout: 30_000 });
      const { streams = [] } = JSON.parse(stdout) as {
        streams?: { codec_type: string; disposition?: { attached_pic?: number } }[];
      };
      if (!streams.some((stream) => stream.codec_type === "video" && !stream.disposition?.attached_pic)) {
        return fail(`Tệp thứ ${currentClip} không có luồng video.`, 422);
      }
      const hasAudio = streams.some((stream) => stream.codec_type === "audio");
      await execute(ffmpeg, [
        "-nostdin", "-v", "error", ...inputOptions, "-i", input,
        ...(!hasAudio ? ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"] : []),
        "-map", "0:V:0", "-map", hasAudio ? "0:a:0" : "1:a:0",
        "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:reset_sar=1,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`,
        "-af", "aresample=48000:async=1:first_pts=0,apad",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k", "-shortest",
        join(directory, segment),
      ], { signal, timeout: 300_000 });
      await rm(input);
      segments.push(segment);
    }

    currentClip = 0;
    const list = join(directory, "clips.txt");
    const output = join(directory, "clipjoin.mp4");
    await writeFile(list, segments.map((segment) => `file '${segment}'`).join("\n"));
    await execute(ffmpeg, [
      "-nostdin", "-v", "error", "-f", "concat", "-safe", "1", "-i", list,
      "-c", "copy", "-movflags", "+faststart", output,
    ], { signal, timeout: 120_000 });
    const response = await downloadVideo(output, directory, "clipjoin.mp4");
    streaming = true;
    return response;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fail("Máy chủ cần cài đặt FFmpeg và FFprobe.", 503);
    }
    console.error("Video merge failed", error);
    return currentClip
      ? fail(`Không thể xử lý video thứ ${currentClip}. Hãy kiểm tra định dạng hoặc thử video ngắn hơn.`, 422)
      : fail("Không thể ghép video. Vui lòng thử lại.", 500);
  } finally {
    activeJob = false;
    if (directory && !streaming) {
      await rm(directory, { recursive: true, force: true }).catch(console.error);
    }
  }
}
