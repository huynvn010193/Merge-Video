import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Navigation } from "./navigation";

export const metadata: Metadata = {
  title: "Clipjoin — Ghép và cắt video",
  description: "Ghép nhiều clip hoặc cắt một đoạn video và xuất ra MP4.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="vi"><body><Navigation />{children}</body></html>;
}
