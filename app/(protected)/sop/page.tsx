import { HandbookViewer } from "@/components/handbook-viewer";
import { PageHeader, Panel } from "@/components/ui";
import {
  MASTER_TRAINING_HANDBOOK_UPDATED,
  MASTER_TRAINING_HANDBOOK_VERSION,
  masterTrainingHandbookHtml
} from "@/content/handbooks/master-training-handbook";
import { requireRole } from "@/lib/auth";

export default async function SopLibraryPage() {
  const profile = await requireRole(["admin", "academic_manager", "customer_service"]);

  return <>
    <PageHeader
      eyebrow="Knowledge Library"
      title="SOP & Training"
      description="Kho tài liệu vận hành nội bộ để Admin, Academic và CSKH tra cứu lại quy trình, trách nhiệm, SLA và hướng dẫn sử dụng ZE CenterOS."
    />

    <div className="sop-summary-grid">
      <article className="sop-summary-card sop-summary-primary">
        <span>Tài liệu hiện hành</span>
        <strong>Master Training Handbook v{MASTER_TRAINING_HANDBOOK_VERSION}</strong>
        <small>Cập nhật {MASTER_TRAINING_HANDBOOK_UPDATED}</small>
      </article>
      <article className="sop-summary-card">
        <span>Phạm vi</span>
        <strong>End-to-End Learner Journey</strong>
        <small>Tư vấn → Placement → Xếp lịch → QC → Báo điểm → Tái phí</small>
      </article>
      <article className="sop-summary-card">
        <span>SLA nổi bật</span>
        <strong>Placement Test</strong>
        <small>90–180 phút · Speaking book ≥12h · Result/follow-up ≤12h</small>
      </article>
      <article className="sop-summary-card">
        <span>Quyền truy cập</span>
        <strong>{profile.role === "admin" ? "Admin" : profile.role === "academic_manager" ? "Academic" : "CSKH"}</strong>
        <small>Chỉ Admin, Academic và CSKH được mở thư viện này</small>
      </article>
    </div>

    <Panel
      className="section-gap sop-library-panel"
      title="ZE CenterOS Master Training Handbook"
      description="Tài liệu sống trong portal: có mục lục, learner journey, Placement Test SOP, RACI, policy xếp lịch và hướng dẫn step-by-step cho từng role."
    >
      <div className="sop-topic-chips">
        <span>Quy trình tổng thể HV</span>
        <span>Placement Test SOP</span>
        <span>Academic</span>
        <span>CSKH</span>
        <span>Giáo viên</span>
        <span>Schedule Policy</span>
        <span>KPI & Payroll</span>
        <span>Case Practice</span>
      </div>
      <div className="sop-usage-note">
        <strong>Cách dùng:</strong> mở mục lục bên trong tài liệu để nhảy tới phần cần tra cứu. Bấm <b>Toàn màn hình</b> khi training hoặc <b>In / Lưu PDF</b> khi cần bản in. Nội dung được lưu cùng phiên bản ZE CenterOS nên không phụ thuộc file bên ngoài.
      </div>
      <HandbookViewer html={masterTrainingHandbookHtml} />
    </Panel>
  </>;
}
