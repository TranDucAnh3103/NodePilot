# start/ — Bộ Công cụ Khởi chạy Nhanh trên Máy Phát triển (Dev)

Thư mục `start/` cung cấp các script tự động hóa 1-click giúp bạn chạy thử nghiệm toàn bộ hệ thống **NodePilot Home Server Control Center (HSCC)** trên máy tính cá nhân (Windows / Linux) trước khi triển khai lên máy chủ thật (Acer Aspire 5733Z / Ubuntu Server 24.04).

---

## 1. Danh sách các Script

| Tên file | Mục đích sử dụng | Cách chạy |
| :--- | :--- | :--- |
| **`start.bat`** | **Menu tương tác Windows**: Cho phép nhấp đúp chuột để chọn chế độ chạy mong muốn. | Nhấp đúp chuột trong Windows Explorer hoặc gõ `.\start\start.bat` |
| **`start-standalone.ps1`** | **Single Binary Mode**: Đóng gói frontend vào file nhị phân Go, tự khởi tạo tài khoản admin, tự mở trình duyệt tại `http://127.0.0.1:17880`. | `powershell -File .\start\start-standalone.ps1` |
| **`start-dev.ps1`** | **Hot-Reload Dev Mode**: Chạy song song Go backend (`:17880`) và Vite Dev Server (`:5173`) với tính năng cập nhật giao diện tức thì khi sửa code. | `powershell -File .\start\start-dev.ps1` |
| **`start-docker.ps1`** | **Docker Compose Mode**: Khởi chạy thử nghiệm cụm container `hscc-api` và `watchtower` trên máy tính cục bộ. | `powershell -File .\start\start-docker.ps1` |

---

## 2. Thông tin Tài khoản Đăng nhập Thử nghiệm

Các script trong thư mục này tự động cấu hình cơ sở dữ liệu và tài khoản mẫu:

- **Địa chỉ truy cập**:
  - Chế độ Single Binary & Docker: `http://127.0.0.1:17880`
  - Chế độ Dev Hot-Reload: `http://localhost:5173`
- **Tên đăng nhập (Username)**: `admin`
- **Mật khẩu (Password)**: `adminpassword123`
- **Cơ sở dữ liệu SQLite**: `./data/hscc.db` (Chế độ WAL, tự động di chuyển schema).

---

## 3. Các Tùy chọn Nâng cao với PowerShell

### Biên dịch lại toàn bộ Frontend và Backend:
```powershell
.\start\start-standalone.ps1 -Rebuild -RebuildFrontend
```

### Đổi cổng lắng nghe khi chạy:
```powershell
.\start\start-standalone.ps1 -Port 18000
```
