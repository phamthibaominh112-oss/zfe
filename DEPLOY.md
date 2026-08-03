# Deploy hotfix v1.1.0

1. Giải nén ZIP.
2. Upload toàn bộ file/folder bên trong vào root repository ZE CenterOS hiện tại.
3. Chọn Replace/Overwrite khi GitHub hỏi.
4. Commit vào nhánh `main`.
5. Chờ Vercel tự tạo deployment mới.

Không chạy SQL. Không thay environment variables. Không import lại dữ liệu.
