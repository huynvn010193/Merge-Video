export const MAX_CLIPS = 12;
export const MAX_BYTES = 250 * 1024 * 1024;

export const formats = {
  landscape: { label: "Ngang", ratio: "16:9", width: 1280, height: 720 },
  portrait: { label: "Dọc", ratio: "9:16", width: 720, height: 1280 },
  square: { label: "Vuông", ratio: "1:1", width: 720, height: 720 },
} as const;

export type Format = keyof typeof formats;

export const VIDEO_ACCEPT = ".mp4,.mov,.webm,.mkv,.avi,.m4v";
export const VIDEO_EXTENSION = /\.(mp4|mov|webm|mkv|avi|m4v)$/i;
