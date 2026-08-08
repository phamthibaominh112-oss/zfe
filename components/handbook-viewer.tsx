"use client";

import { useRef, useState } from "react";

export function HandbookViewer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  async function toggleFullscreen() {
    const el = viewerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {
      setFullscreen(false);
    }
  }

  function printHandbook() {
    iframeRef.current?.contentWindow?.focus();
    iframeRef.current?.contentWindow?.print();
  }

  function jumpTop() {
    iframeRef.current?.contentWindow?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="handbook-viewer" ref={viewerRef}>
      <div className="handbook-viewer-toolbar">
        <div>
          <strong>ZE CenterOS Master Training Handbook</strong>
          <span>Academic · CSKH · Admin · Placement Test SOP · End-to-End Learner Journey</span>
        </div>
        <div className="handbook-toolbar-actions">
          <button className="button button-secondary button-small" type="button" onClick={jumpTop}>↑ Đầu tài liệu</button>
          <button className="button button-secondary button-small" type="button" onClick={toggleFullscreen}>{fullscreen ? "Thu nhỏ" : "Toàn màn hình"}</button>
          <button className="button button-primary button-small" type="button" onClick={printHandbook}>In / Lưu PDF</button>
        </div>
      </div>
      <iframe
        ref={iframeRef}
        className="handbook-frame"
        title="ZE CenterOS Master Training Handbook"
        srcDoc={html}
      />
    </div>
  );
}
