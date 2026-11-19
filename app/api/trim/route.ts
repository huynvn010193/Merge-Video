import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_BYTES } from "../../../lib/video";
import { downloadVideo, execute, fail, ffmpeg, ffprobe, inputOptions, readVideoForm, saveVideo } from "../../../lib/video-server";

export const runtime = "nodejs";

let activeJob = false;

export async function POST(request: Request) {
  if (activeJob) return fail("Đang có một lượt cắt video. Vui lòng thử lại sau.", 503);
  activeJob = true;
  let directory: string | undefined;
  let streaming = false;
  try {
    const form = await readVideoForm(request);
    if (form instanceof Response) return form;

    const files = form.getAll("video");
    const file = files[0];
    if (files.length !== 1 || !(file instanceof File) || !file.size) {
      return fail("Hãy chọn một tệp video hợp lệ.", 400);
    }
    if (file.size > MAX_BYTES) return fail("Video vượt quá 250 MB.", 413);

    const startValue = form.get("start");
    const endValue = form.get("end");
    if (typeof startValue !== "string" || typeof endValue !== "string" || !startValue.trim() || !endValue.trim()) {
      return fail("Hãy nhập điểm bắt đầu và kết thúc.", 400);
    }
    const start = Number(startValue);
    const end = Number(endValue);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      return fail("Điểm kết thúc phải lớn hơn điểm bắt đầu và cả hai phải từ 0 giây trở lên.", 400);
    }

    const { signal } = request;
    directory = await mkdtemp(join(tmpdir(), "clipjoin-trim-"));
    const input = join(directory, "input");
    const output = join(directory, "trimmed.mp4");
    await saveVideo(file, input, signal);
    const { stdout } = await execute(ffprobe, [
      "-v", "error", ...inputOptions, "-select_streams", "V:0",
      "-show_entries", "stream=codec_type,duration:format=duration", "-of", "json", input,
    ], { signal, timeout: 30_000 });
    const probe = JSON.parse(stdout) as {
      streams?: { codec_type: string; duration?: string }[];
      format?: { duration?: string };
    };
    const video = probe.streams?.[0];
    if (video?.codec_type !== "video") return fail("Tệp đã chọn không có luồng video.", 422);
    const duration = Number(probe.format?.duration) || Number(video.duration);
    if (Number.isFinite(duration) && (start >= duration || end > duration + 0.001)) {
      return fail("Các mốc cắt phải nằm trong thời lượng video.", 422);
    }

    await execute(ffmpeg, [
      "-nostdin", "-v", "error", ...inputOptions, "-ss", start.toFixed(6), "-i", input,
      "-t", (end - start).toFixed(6), "-map", "0:V:0", "-map", "0:a:0?",
      "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast",
      "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart",
      "-abort_on", "empty_output", output,
    ], { signal, timeout: 300_000 });
    const { stdout: outputVideo } = await execute(ffprobe, [
      "-v", "error", "-select_streams", "V:0", "-show_entries", "stream=codec_type",
      "-of", "csv=p=0", output,
    ], { signal, timeout: 30_000 });
    if (outputVideo.trim() !== "video") return fail("Đoạn đã chọn không có khung hình.", 422);

    const response = await downloadVideo(output, directory, "clipjoin-cut.mp4");
    streaming = true;
    return response;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fail("Máy chủ cần cài đặt FFmpeg và FFprobe.", 503);
    }
    if (!request.signal.aborted) console.error("Video trim failed", error);
    return fail("Không thể cắt video ở các mốc đã chọn. Hãy kiểm tra lại video và thời gian.", 422);
  } finally {
    activeJob = false;
    if (directory && !streaming) {
      await rm(directory, { recursive: true, force: true }).catch(console.error);
    }
  }
}
