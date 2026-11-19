"use client";

import { ArrowDown, ArrowUp, ArrowRight, Check, Download, Film, LoaderCircle, Plus, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formats, MAX_BYTES, MAX_CLIPS, VIDEO_ACCEPT, VIDEO_EXTENSION, type Format } from "../lib/video";

type Clip = { id: string; file: File; url: string };
const formatOptions = Object.keys(formats) as Format[];

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export default function Home() {
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef(new Set<string>());
  const [clips, setClips] = useState<Clip[]>([]);
  const [selected, setSelected] = useState("");
  const [format, setFormat] = useState<Format>("landscape");
  const [result, setResult] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const total = clips.reduce((sum, clip) => sum + clip.file.size, 0);
  const preview = clips.find((clip) => clip.id === selected);
  const size = formats[format];
  const playback = showResult && result ? result : preview?.url;

  useEffect(() => {
    const objectUrls = urls.current;
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function release(url: string) {
    if (url) URL.revokeObjectURL(url);
    urls.current.delete(url);
  }

  function resetResult() {
    release(result);
    setResult("");
    setError("");
  }

  function addFiles(files: FileList | File[]) {
    if (!files.length || busy) return;
    const incoming = Array.from(files);
    if (incoming.some((file) => !file.size || !VIDEO_EXTENSION.test(file.name))) {
      return setError("Hãy chọn tệp MP4, MOV, WebM, MKV, AVI hoặc M4V có dữ liệu.");
    }
    if (incoming.length + clips.length > MAX_CLIPS) return setError("Chỉ có thể thêm tối đa 12 video.");
    if (total + incoming.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
      return setError("Tổng dung lượng video vượt quá 250 MB.");
    }

    const added = incoming.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return { id: url, file, url };
    });
    resetResult();
    setClips([...clips, ...added]);
    if (!selected) setSelected(added[0].id);
  }

  function removeClip(clip: Clip) {
    resetResult();
    release(clip.url);
    const remaining = clips.filter((item) => item.id !== clip.id);
    setClips(remaining);
    if (selected === clip.id) setSelected(remaining[0]?.id ?? "");
  }

  function moveClip(from: number, to: number) {
    const reordered = [...clips];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    resetResult();
    setClips(reordered);
  }

  async function merge() {
    resetResult();
    setBusy(true);
    const body = new FormData();
    clips.forEach(({ file }) => body.append("videos", file));
    body.set("format", format);
    try {
      const response = await fetch("/api/merge", { method: "POST", body });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Không thể ghép video. Vui lòng thử lại.");
      }
      const url = URL.createObjectURL(await response.blob());
      urls.current.add(url);
      setResult(url);
      setShowResult(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể ghép video.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <section className="intro">
        <h1>Ghép video<span>.</span></h1>
        <p>Sắp xếp các đoạn clip và xuất thành một video MP4.</p>
      </section>

      <div className="workspace">
        <section className="panel source" aria-labelledby="source-title">
          <div className="panel-head">
            <div>
              <h2 id="source-title">Video nguồn</h2>
              <p>Video được ghép theo thứ tự từ trên xuống.</p>
            </div>
            <span className="counter">{clips.length} / {MAX_CLIPS}</span>
          </div>
          <input ref={input} type="file" accept={VIDEO_ACCEPT} multiple hidden
            onChange={(event) => {
              if (event.currentTarget.files) addFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }} />
          <div className={`dropzone ${dragging ? "dragging" : ""} ${clips.length ? "compact" : ""}`}
            onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}>
            {!clips.length && <div className="upload-icon"><Upload size={24} /></div>}
            {!clips.length && <strong>Kéo và thả video vào đây</strong>}
            <button className="secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>
              <Plus size={17} /> {clips.length ? "Thêm video" : "Chọn video"}
            </button>
            <small>MP4, MOV, WebM, MKV, AVI, M4V · Tối đa 250 MB tổng cộng</small>
          </div>

          {!!clips.length && (
            <ol className="clips">
              {clips.map((clip, index) => (
                <li key={clip.id} className={clip.id === selected ? "selected" : ""}>
                  <button type="button" className="clip-select" aria-pressed={clip.id === selected}
                    onClick={() => { setShowResult(false); setSelected(clip.id); }}>
                    <span className="clip-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="clip-details"><strong>{clip.file.name}</strong><small>{fileSize(clip.file.size)}</small></span>
                  </button>
                  <div className="clip-actions">
                    <button type="button" aria-label={`Đưa ${clip.file.name} lên`} disabled={busy || index === 0}
                      onClick={() => moveClip(index, index - 1)}><ArrowUp size={16} /></button>
                    <button type="button" aria-label={`Đưa ${clip.file.name} xuống`} disabled={busy || index === clips.length - 1}
                      onClick={() => moveClip(index, index + 1)}><ArrowDown size={16} /></button>
                    <button type="button" aria-label={`Xóa ${clip.file.name}`} disabled={busy}
                      onClick={() => removeClip(clip)}><X size={16} /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel export" aria-labelledby="export-title">
          <div className="panel-head">
            <div><h2 id="export-title">Xuất video</h2><p>MP4 · H.264 · 30 fps</p></div>
            <span className="format-badge">MP4</span>
          </div>
          <div className="preview">
            {playback ? (
              <video key={playback} src={playback} controls playsInline
                preload="metadata" aria-label={showResult && result ? "Video đã ghép" : preview?.file.name}
                onError={() => setPreviewError(playback)} />
            ) : (
              <div className="preview-empty"><Film size={28} strokeWidth={1.5} />Xem trước video</div>
            )}
          </div>
          {playback && previewError === playback && (
            <p className="preview-note">Trình duyệt không phát được bản xem trước của video này.</p>
          )}
          {result && !showResult && (
            <button className="secondary preview-result" type="button" onClick={() => { setError(""); setShowResult(true); }}>
              <Film size={16} /> Xem video đã ghép
            </button>
          )}
          <fieldset disabled={busy}>
            <legend>Tỉ lệ khung hình</legend>
            <div className="formats">
              {formatOptions.map((option) => (
                <label key={option} className={option === format ? "chosen" : ""}>
                  <input type="radio" name="format" value={option} checked={option === format}
                    onChange={() => { resetResult(); setFormat(option); }} />
                  <span className={`ratio-icon ${option}`} />
                  <strong>{formats[option].label}</strong>
                  <small>{formats[option].ratio}</small>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="resolution"><span>Độ phân giải đầu ra</span><strong>{size.width} × {size.height}</strong></div>
          {error && <p role="alert" className="error">{error}</p>}
          {result ? (
            <a className="primary" href={result} download="clipjoin.mp4"><Download size={19} /> Tải video MP4</a>
          ) : (
            <button className="primary" type="button" disabled={clips.length < 2 || busy} onClick={merge}>
              {busy ? <><LoaderCircle className="spinner" size={18} /> Đang ghép video…</> : <>Ghép video <ArrowRight size={18} /></>}
            </button>
          )}
          <div className="status" role="status">
            {result ? <><Check size={15} /> Video đã sẵn sàng để tải.</> : busy ? "Giữ trang mở trong khi xử lý." : clips.length < 2 ? "Thêm ít nhất 2 video để bắt đầu." : `${clips.length} video · ${fileSize(total)}`}
          </div>
        </section>
      </div>
    </main>
  );
}
