"use client";

export function FinanceDashboardFrame({html}:{html:string}){
  return <iframe className="finance-intelligence-frame" title="ZFE Finance Intelligence" srcDoc={html} sandbox="allow-scripts allow-downloads allow-same-origin"/>;
}
