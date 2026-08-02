# ZE CenterOS — Production Operations Platform

ZE CenterOS là nền tảng vận hành trung tâm dùng **database thật**, không phải prototype và không có role switcher giả lập.

## Stack

- Next.js 16.2.12 (security-patched Active LTS)
- React 19.2.8
- Supabase Auth + PostgreSQL + Storage + Row Level Security
- Vercel deployment
- Node.js 22+

## Phân quyền thật

Mỗi user đăng nhập bằng email/mật khẩu riêng. Quyền được kiểm soát ở hai lớp:

1. Route/UI guard trên Next.js.
2. Supabase RLS ở database. Việc gọi API trực tiếp cũng không vượt được policy.

- **Admin:** toàn hệ thống, user/role, archive/delete và audit log.
- **Quản lý học vụ:** hồ sơ học viên, lớp, lịch, session, attendance, homework, assessment, feedback approval và observation. Không đọc học phí.
- **Giáo viên:** chỉ lớp/session/học viên được phân công; availability, attendance, homework, assignment, assessment, feedback của lớp mình và observation đã share. Không đọc tuition/renewal/raw student ratings.
- **CSKH:** hồ sơ học viên, thông tin lớp cơ bản, tuition, payment và renewal. Không đọc attendance, điểm, feedback học thuật hoặc observation.
- **Học viên:** chỉ dữ liệu của chính mình; lớp đã enroll, lịch, attendance, assignment, điểm đã publish, feedback đã publish và tuition account của mình.

Xem ma trận chi tiết tại `docs/RBAC_MATRIX.md`.

## Cài đặt production

### 1. Tạo Supabase project

Tạo project mới. Trong SQL Editor, chạy lần lượt:

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls.sql`
3. `supabase/migrations/003_storage_and_seed.sql`

### 2. Tạo Admin đầu tiên

- Supabase Dashboard → Authentication → Users → Add user.
- Mở `supabase/bootstrap_first_admin.sql`.
- Thay `REPLACE_WITH_ADMIN_EMAIL` bằng email vừa tạo.
- Chạy SQL và kiểm tra role trả về là `admin`.

Sau đó Admin tạo các tài khoản còn lại trong **Administration → Users & Roles**.

### 3. Cấu hình Auth

Supabase → Authentication:

- Tắt public sign-up nếu chỉ Admin được cấp tài khoản.
- Cấu hình Site URL là domain production.
- Thêm redirect URL:
  - `https://YOUR_DOMAIN/auth/callback`
  - `http://localhost:3000/auth/callback`
- Cấu hình SMTP thật để gửi email reset password.

### 4. Environment variables

Copy `.env.example` thành `.env.local` khi chạy local.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
```

`SUPABASE_SERVICE_ROLE_KEY` là secret server-only. Không bao giờ thêm tiền tố `NEXT_PUBLIC_`.

### 5. Deploy Vercel

Dùng **repository mới hoặc xoá sạch source cũ trước khi upload**. Root repository phải có:

```text
app/
components/
lib/
public/
supabase/
package.json
next.config.ts
proxy.ts
vercel.json
```

Không giữ `package-lock.json` cũ từ package demo/vulnerable. Sau đó:

- Import repository vào Vercel.
- Framework Preset: Next.js.
- Root Directory: `./`.
- Node.js: 22.x (package đã khai báo engines).
- Thêm 4 environment variables ở trên.
- Deploy.

## Chạy local

```bash
npm install
npm run dev
```

Production checks:

```bash
npm run typecheck
npm run build
```

## Dữ liệu thật, không demo

Seed chỉ tạo catalog nền tảng (IELTS, Communication, B2B, level và observation rubric). Không tạo học viên, giáo viên, lớp, học phí hoặc transaction giả.

## Chính sách xóa

- Role thường chỉ insert/update theo phạm vi được cấp.
- Chỉ Admin có DELETE policy.
- UI mặc định dùng archive/soft-delete cho hồ sơ có lịch sử vận hành.
- Audit trigger ghi INSERT/UPDATE/DELETE trên các bảng trọng yếu.

## File assignment

Bucket `assignment-files` là private. Học viên chỉ upload vào folder mang student ID của mình. Giáo viên chỉ đọc file của học viên trong lớp mình; Admin/Academic Manager đọc theo phạm vi RLS.

## Go-live checklist

Xem `docs/GO_LIVE_CHECKLIST.md` trước khi dùng dữ liệu thật.
