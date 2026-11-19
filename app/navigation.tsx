"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard } from "lucide-react";

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-icon"><Clapperboard size={21} /></span>Clipjoin
        </Link>
        <nav aria-label="Công cụ video">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Ghép video</Link>
          <Link href="/cat-video" aria-current={pathname === "/cat-video" ? "page" : undefined}>Cắt video</Link>
        </nav>
      </div>
    </header>
  );
}
