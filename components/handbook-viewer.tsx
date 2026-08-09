"use client";

import { useEffect, useRef, useState } from "react";

const EMBEDDED_HANDBOOK_CSS = `
@media screen {
  html { scroll-padding-top: 76px !important; }
  body { background:#fff !important; overflow-x:hidden !important; }
  .topbar { display:none !important; }
  .layout {
    display:block !important;
    max-width:none !important;
    width:100% !important;
    padding:16px !important;
    margin:0 !important;
  }
  .sidebar {
    position:sticky !important;
    top:0 !important;
    z-index:40 !important;
    display:block !important;
    max-height:none !important;
    width:100% !important;
    margin:0 0 16px !important;
    padding:9px 10px !important;
    border-radius:13px !important;
    overflow-x:auto !important;
    overflow-y:hidden !important;
    white-space:nowrap !important;
    box-shadow:0 6px 18px rgba(20,44,90,.08) !important;
    scrollbar-width:thin;
  }
  .sidebar .nav-title { display:none !important; }
  .sidebar .nav {
    display:flex !important;
    align-items:center !important;
    gap:6px !important;
    width:max-content !important;
    min-width:100% !important;
  }
  .sidebar .nav a {
    display:inline-flex !important;
    align-items:center !important;
    min-height:34px !important;
    margin:0 !important;
    padding:7px 10px !important;
    border:1px solid #dce3f0 !important;
    border-radius:999px !important;
    background:#fff !important;
    color:#344054 !important;
    font-size:11px !important;
    font-weight:800 !important;
  }
  .sidebar .nav a:hover {
    background:#eaf0ff !important;
    color:#1746e0 !important;
    border-color:#b8c9ff !important;
  }
  main { width:100% !important; min-width:0 !important; }
  .hero { margin-top:0 !important; }
  .section { scroll-margin-top:76px !important; }

  /* Timeline labels such as T-24, T-12, 0–180', +2h, +6h must never be squeezed. */
  .timeline { min-width:0 !important; }
  .step {
    display:grid !important;
    grid-template-columns:max-content minmax(0,1fr) !important;
    gap:12px !important;
    align-items:start !important;
    min-width:0 !important;
  }
  .step-no {
    width:auto !important;
    min-width:48px !important;
    max-width:96px !important;
    height:auto !important;
    min-height:36px !important;
    padding:8px 10px !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important;
    white-space:nowrap !important;
    overflow:visible !important;
    text-align:center !important;
    font-size:11px !important;
    line-height:1.05 !important;
  }
  .step-box {
    min-width:0 !important;
    width:auto !important;
    overflow-wrap:anywhere !important;
  }
  @media (max-width:560px) {
    .step { grid-template-columns:1fr !important; gap:8px !important; }
    .step-no { justify-self:start !important; max-width:none !important; }
  }

  .footer { margin-bottom:20px !important; }
}
`;

export function HandbookViewer({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;

    setReady(false);

    // Write the trusted handbook only after the client mounts. This avoids sending the
    // very large handbook through the server-rendered iframe srcDoc attribute, which
    // could cause the current app document to appear recursively inside the viewer.
    doc.open();
    doc.write(html);
    doc.close();

    const style = doc.createElement("style");
    style.setAttribute("data-ze-centeros-embed", "true");
    style.textContent = EMBEDDED_HANDBOOK_CSS;
    doc.head.appendChild(style);

    // Make handbook links stay inside the handbook frame.
    doc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        const href = anchor.getAttribute("href");
        if (!href || href === "#") return;
        const target = doc.querySelector(href);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    setReady(true);
  }, [html]);

  useEffect(() => {
    function syncFullscreen() {
      setFullscreen(document.fullscreenElement === viewerRef.current);
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    const el = viewerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setFullscreen(false);
    }
  }

  function printHandbook() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
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
          <button className="button button-secondary button-small" type="button" onClick={jumpTop} disabled={!ready}>↑ Đầu tài liệu</button>
          <button className="button button-secondary button-small" type="button" onClick={toggleFullscreen}>{fullscreen ? "Thu nhỏ" : "Toàn màn hình"}</button>
          <button className="button button-primary button-small" type="button" onClick={printHandbook} disabled={!ready}>In / Lưu PDF</button>
        </div>
      </div>
      <div className="handbook-frame-shell">
        {!ready && <div className="handbook-loading">Đang mở tài liệu vận hành…</div>}
        <iframe
          ref={iframeRef}
          className="handbook-frame"
          title="ZE CenterOS Master Training Handbook"
          src="about:blank"
          sandbox="allow-same-origin allow-scripts allow-modals"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
