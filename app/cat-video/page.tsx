"use client";

import { Download, LoaderCircle, Play, Scissors, Upload } from "lucide-react";
import { useEffect, useReducer, useRef } from "react";
import { MAX_BYTES, VIDEO_ACCEPT, VIDEO_EXTENSION } from "../../lib/video";

type Source = { file: File; url: string };
type RangePoint = "start" | "end";

type TrimState = {
  source: Source | null;
  result: string;
  start: string;
  end: string;
  duration?: number;
  previewError: boolean;
  error: string;
  busy: boolean;
};

type TrimAction =
  | { type: "sourceSelected"; source: Source }
  | { type: "metadataLoaded"; url: string; duration: number }
  | { type: "previewFailed"; url: string }
  | { type: "rangeChanged"; point: RangePoint; value: string }
  | { type: "errorReported"; message: string }
  | { type: "exportStarted" }
  | { type: "exportSucceeded"; url: string }
  | { type: "exportFailed"; message: string };

const initialState: TrimState = {
  source: null,
  result: "",
  start: "0",
  end: "",
  previewError: false,
  error: "",
  busy: false,
};

function trimReducer(state: TrimState, action: TrimAction): TrimState {
  switch (action.type) {
    case "sourceSelected":
      return { ...initialState, source: action.source };
    case "metadataLoaded":
      if (state.source?.url !== action.url) return state;
      return {
        ...state,
        duration: action.duration,
        end: state.end || String(Number(action.duration.toFixed(3))),
      };
    case "previewFailed":
      return state.source?.url === action.url ? { ...state, previewError: true } : state;
    case "rangeChanged":
      return { ...state, [action.point]: action.value, result: "", error: "" };
    case "errorReported":
      return { ...state, error: action.message };
    case "exportStarted":
      return { ...state, busy: true, result: "", error: "" };
    case "exportSucceeded":
      return { ...state, busy: false, result: action.url };
    case "exportFailed":
      return { ...state, busy: false, error: action.message };
  }
}

export default function TrimPage() {
  const picker = useRef<HTMLInputElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const request = useRef<AbortController | null>(null);
  const previewEnd = useRef<number | null>(null);
  const urls = useRef(new Set<string>());
  const [state, dispatch] = useReducer(trimReducer, initialState);
  const { source, result, start, end, duration, previewError, error, busy } = state;
  const from = Number(start);
  const to = Number(end);
  const validRange = start.trim() !== "" && end.trim() !== "" &&
    Number.isFinite(from) && Number.isFinite(to) && from >= 0 && to > from &&
    (duration === undefined || to <= duration + 0.001);

  useEffect(() => {
    const objectUrls = urls.current;
    return () => {
      request.current?.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function releaseUrl(url: string) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }

  function chooseFile(file?: File) {
    if (!file || busy) return;
    if (!file.size || !VIDEO_EXTENSION.test(file.name)) {
      return dispatch({ type: "errorReported", message: "Hãy chọn tệp MP4, MOV, WebM, MKV, AVI hoặc M4V có dữ liệu." });
    }
    if (file.size > MAX_BYTES) return dispatch({ type: "errorReported", message: "Video vượt quá 250 MB." });

    if (source) releaseUrl(source.url);
    releaseUrl(result);
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    previewEnd.current = null;
    dispatch({ type: "sourceSelected", source: { file, url } });
  }

  function updateRange(point: RangePoint, value: string) {
    previewEnd.current = null;
    player.current?.pause();
    releaseUrl(result);
    dispatch({ type: "rangeChanged", point, value });
  }

  async function playSelection() {
    const video = player.current;
    if (!video || !validRange) return;
    try {
      video.currentTime = from;
      previewEnd.current = to;
      await video.play();
    } catch {
      previewEnd.current = null;
      dispatch({ type: "errorReported", message: "Không phát được đoạn xem trước." });
    }
  }

  async function trim() {
    if (!source || !validRange || request.current) return;
    releaseUrl(result);
    dispatch({ type: "exportStarted" });
    player.current?.pause();
    const controller = new AbortController();
    request.current = controller;
    const body = new FormData();
    body.set("video", source.file);
    body.set("start", start);
    body.set("end", end);
    try {
      const response = await fetch("/api/trim", { method: "POST", body, signal: controller.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Không thể cắt video. Vui lòng thử lại.");
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      dispatch({ type: "exportSucceeded", url });
    } catch (cause) {
      if (!controller.signal.aborted) {
        dispatch({
          type: "exportFailed",
          message: cause instanceof Error ? cause.message : "Không thể cắt video.",
        });
      }
    } finally {
      request.current = null;
    }
  }

  return (
    <main className="wrap">
      <section className="intro">
        <h1>Cắt video<span>.</span></h1>
        <p>Chọn đoạn muốn giữ và xuất thành một tệp MP4.</p>
      </section>
      <div className="workspace">
        <section className="panel" aria-labelledby="trim-source">
          <div className="panel-head">
            <div>
              <h2 id="trim-source">Video nguồn</h2>
              {source && <p className="trim-filename">{source.file.name}</p>}
            </div>
            {source && <button className="secondary" type="button" disabled={busy} onClick={() => picker.current?.click()}>Đổi video</button>}
          </div>
          <input ref={picker} type="file" accept={VIDEO_ACCEPT} hidden onChange={(event) => {
            chooseFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }} />
          {source ? (
            <>
              <div className="preview">
                <video key={source.url} ref={player} src={source.url} controls playsInline preload="metadata"
                  aria-label="Xem trước video nguồn"
                  onLoadedMetadata={({ currentTarget }) => {
                    const length = currentTarget.duration;
                    if (Number.isFinite(length) && length > 0) {
                      dispatch({ type: "metadataLoaded", url: source.url, duration: length });
                    }
                  }}
                  onTimeUpdate={({ currentTarget }) => {
                    if (previewEnd.current !== null && currentTarget.currentTime >= previewEnd.current) {
                      const stop = previewEnd.current;
                      previewEnd.current = null;
                      currentTarget.pause();
                      currentTarget.currentTime = stop;
                    }
                  }}
                  onSeeking={({ currentTarget }) => {
                    if (previewEnd.current !== null && (currentTarget.currentTime < from || currentTarget.currentTime >= previewEnd.current)) {
                      previewEnd.current = null;
                    }
                  }}
                  onError={() => dispatch({ type: "previewFailed", url: source.url })} />
              </div>
              {previewError && <p className="preview-note">Trình duyệt không phát được tệp nguồn. Bạn vẫn có thể nhập mốc cắt theo giây.</p>}
            </>
          ) : (
            <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
              event.preventDefault();
              const files = event.dataTransfer.files;
              if (files.length === 1) chooseFile(files[0]);
              else if (files.length > 1) dispatch({ type: "errorReported", message: "Hãy chọn một video mỗi lần." });
            }}>
              <div className="upload-icon"><Upload size={24} /></div>
              <strong>Kéo và thả một video vào đây</strong>
              <button className="secondary" type="button" onClick={() => picker.current?.click()}>Chọn video</button>
              <small>MP4, MOV, WebM, MKV, AVI, M4V · Tối đa 250 MB</small>
            </div>
          )}
        </section>
        <section className="panel" aria-labelledby="trim-export">
          <div className="panel-head"><div><h2 id="trim-export">Đoạn muốn giữ</h2><p>Nhập thời gian theo giây.</p></div></div>
          <fieldset className="trim-times" disabled={!source || busy} aria-label="Mốc cắt">
            <div className="trim-time">
              <label htmlFor="trim-start">Bắt đầu</label>
              <input id="trim-start" type="number" inputMode="decimal" min="0" max={duration} step="any" value={start}
                onChange={(event) => updateRange("start", event.target.value)} />
              <button className="secondary" type="button" disabled={previewError || duration === undefined}
                aria-label="Dùng vị trí phát làm điểm bắt đầu"
                onClick={() => { if (player.current) updateRange("start", player.current.currentTime.toFixed(3)); }}>Lấy vị trí phát</button>
            </div>
            <div className="trim-time">
              <label htmlFor="trim-end">Kết thúc</label>
              <input id="trim-end" type="number" inputMode="decimal" min="0" max={duration} step="any" value={end}
                onChange={(event) => updateRange("end", event.target.value)} />
              <button className="secondary" type="button" disabled={previewError || duration === undefined}
                aria-label="Dùng vị trí phát làm điểm kết thúc"
                onClick={() => { if (player.current) updateRange("end", player.current.currentTime.toFixed(3)); }}>Lấy vị trí phát</button>
            </div>
          </fieldset>
          <div className="resolution"><span>Thời lượng đoạn cắt</span><strong>{validRange ? `${(to - from).toLocaleString("vi-VN", { maximumFractionDigits: 3 })} giây` : "—"}</strong></div>
          {source && start !== "" && end !== "" && !validRange && (
            <p className="error">Chọn điểm kết thúc sau điểm bắt đầu và trong thời lượng video.</p>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {result ? (
            <>
              <div className="preview trim-output"><video src={result} controls playsInline preload="metadata" aria-label="Video đã cắt" /></div>
              <a className="primary" href={result} download={`${source?.file.name.replace(VIDEO_EXTENSION, "")}-cut.mp4`}><Download size={18} /> Tải video MP4</a>
            </>
          ) : (
            <div className="trim-actions">
              <button className="secondary" type="button" disabled={busy || !source || !validRange || previewError || duration === undefined} onClick={playSelection}>
                <Play size={16} /> Xem đoạn
              </button>
              <button className="primary" type="button" disabled={busy || !source || !validRange} onClick={trim}>
                {busy ? <><LoaderCircle className="spinner" size={18} /> Đang cắt…</> : <><Scissors size={18} /> Cắt và xuất MP4</>}
              </button>
            </div>
          )}
          <div className="status" role="status">{result ? "Video đã sẵn sàng để tải." : busy ? "Đang xử lý video trên máy chủ." : ""}</div>
        </section>
      </div>
    </main>
  );
}
