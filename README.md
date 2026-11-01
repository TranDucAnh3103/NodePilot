# NodePilot Home Server Control Center (HSCC)

> **Single-Binary, Ultra-Lightweight & Secure Infrastructure Control Center for Private Homeservers**

[![Go Version](https://img.shields.io/badge/Go-1.26+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React Version](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=flat&logo=tailwind-css)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-Proprietary-blue.svg)](#)

---

## 1. Tổng quan Dự án

**NodePilot Home Server Control Center (HSCC)** là hệ thống kiểm soát và quan sát hạ tầng máy chủ gia đình toàn diện, được thiết kế chuyên biệt để hoạt động bền bỉ, bảo mật cao trên phần cứng khiêm tốn.

Toàn bộ hệ thống Backend, WebSocket telemetry theo thời gian thực và giao diện Web SPA được đóng gói thành **một file nhị phân duy nhất (Single Binary)**, loại bỏ hoàn toàn nhu cầu cài đặt Node.js hay Python daemon trên máy chủ sản xuất.

### Phần cứng Mục tiêu & Ngân sách Tài nguyên
- **Thiết bị máy chủ**: Laptop Acer Aspire 5733Z
- **CPU**: Intel® Pentium® P6200 (2 Cores / 2 Threads, 2.13 GHz, Arrandale architecture)
- **RAM**: ~3.5 GiB DDR3 (chia sẻ với Intel HD Graphics tích hợp)
- **Hệ điều hành**: Ubuntu Server 24.04 LTS (x86_64)
- **Màn hình Kiosk**: 15.6" HD WXGA (1366x768)
- **Ngân sách bộ nhớ**:
  - `hscc-api` (Backend + Web SPA): $\le \mathbf{120\text{ MiB}}$ RSS
  - `hscc-helper` (Root IPC helper): $\le \mathbf{45\text{ MiB}}$ RSS
  - CPU khi nghỉ (Idle, không có client): $\le \mathbf{1.5\%}$

---

## 2. Triết lý Thiết kế Cốt lõi

### 2.1 100% Unrestricted Host Observability (Quan sát Toàn vẹn)
- Hệ thống quan sát **100% workloads** thực tế đang chạy trên máy chủ:
  - Tất cả Docker containers (`docker ps -a`), images, volumes và networks.
  - Tất cả systemd units (`services`, `timers`, `sockets`, `mounts`) trên toàn OS.
  - Tiến trình hệ thống, dung lượng từng phân vùng ổ cứng thật, băng thông mạng thời gian thực (RX/TX per sec) và nhiệt độ CPU.
- **Nguyên tắc**: Không bao giờ ẩn giấu hay lọc bỏ workloads khỏi màn hình quan sát của quản trị viên.

### 2.2 Strict Guardrail Execution (Điều khiển có Hàng rào Bảo vệ)
- Khác với quyền quan sát không giới hạn, các thao tác điều khiển / can thiệp (Start, Stop, Restart, Signal, Prune) bị giới hạn nghiêm ngặt:
  - **Denylist (Khóa an toàn phần cứng)**: Các dịch vụ trọng yếu (`ssh`, `sshd`, `tailscaled`, `cloudflared`, `nginx`, `caddy`, `docker`, `containerd`, `hscc-*`) tuyệt đối không thể tắt hay sửa đổi qua Web UI.
  - **Allowlist (Chính sách mục tiêu được quản lý)**: Chỉ các dịch vụ/container được đăng ký trong `/etc/hscc/helper-policy.yaml` mới được phép thao tác.
  - **Modal 2 bước & Idempotency**: Mọi thao tác nguy hiểm yêu cầu gõ xác nhận tên mục tiêu, tự động sinh header `Idempotency-Key` và lưu nhật ký kiểm toán không thể xóa/sửa (Append-only Audit Trail).

### 2.3 UI/UX Pro Max & Chuẩn Chuyển động `animate-ui`
- **Zero Emoji Policy**: Tuyệt đối không sử dụng emoji trong toàn bộ giao diện; 100% icon là vector SVG từ `lucide-react`.
- **Giao diện Dark-first**: Thiết kế chuyên dụng cho môi trường vận hành hạ tầng 24/7, đạt độ tương phản WCAG 2.2 AA, font monospace hiển thị chi tiết metrics, PID, IP/Port, container IDs.
- **Tối ưu hóa GPU Compositor**: Toàn bộ chuyển động (`animate-ui`) chạy trên luồng compositor (`transform`, `opacity`), tự ngắt khi ẩn tab, tôn trọng chuẩn trợ năng `prefers-reduced-motion`.

---

## 3. Kiến trúc Hệ thống

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Client Browser (Web SPA)                               │
│  React 19 + Tailwind CSS 4 + Lucide React + Animate UI + Apache ECharts    │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │ HTTPS (REST) & WSS (Metrics Stream 3s)
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  hscc-api (Daemon không đặc quyền, chạy user 'hscc', cổng 17880)           │
│  ├── Transport: Fiber v3 REST API & WebSocket Handler                       │
│  ├── Embedded Assets: //go:embed web/dist/*                                 │
│  ├── Auth Domain: Argon2id + JWT + HttpOnly Cookie Rotate                   │
│  ├── Telemetry Engine: In-Memory RingBuffer (120 mẫu, chu kỳ quét 3s)       │
│  └── Storage: SQLite (Chế độ WAL, bảng audit_events Append-only)            │
└───────────────────────┬─────────────────────────────────────────────────────┘
                        │ IPC Unix Domain Socket (/run/hscc/helper.sock)
                        │ Versioned JSON Protocol + Xác thực SO_PEERCRED
                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  hscc-helper (Daemon có đặc quyền, chạy user 'root')                        │
│  ├── Policy Engine: Đọc /etc/hscc/helper-policy.yaml (Allowlist & Denylist) │
│  ├── System Execution: D-Bus systemd Manager & Docker Engine SDK            │
│  └── Guardrail Lock: Chặn 100% yêu cầu can thiệp dịch vụ hạ tầng            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Cấu trúc Mã nguồn

```
NodePilot-homeserver/
├── AGENTS.md                  # Quy chuẩn kiến trúc, UI/UX Pro Max và Motion cho AI
├── START.md                   # Hướng dẫn chi tiết biên dịch, cài đặt và khởi chạy
├── README.md                  # Tài liệu tổng quan dự án
├── web_dist.go                # Nhúng web/dist/* vào binary Go bằng go:embed
├── cmd/
│   ├── hscc-api/              # Daemon máy chủ REST API, WebSocket & Web SPA nhúng
│   ├── hscc-helper/           # Daemon root điều khiển dịch vụ có bảo vệ Guardrail
│   └── hscc-cli/              # Công cụ dòng lệnh bootstrap tài khoản & kiểm tra policy
├── internal/
│   ├── modules/
│   │   ├── auth/              # Xác thực Argon2id, JWT, Rotate session token
│   │   ├── system/            # Trình thu thập CPU Delta %, RAM, Swap, Disks, Nets, Temp
│   │   ├── telemetry/         # RingBuffer in-memory 120 điểm & Single Shared Ticker
│   │   ├── workloads/         # Quan sát 100% Docker & systemd, cơ chế mutate
│   │   ├── guardrail/         # Bộ máy kiểm tra Allowlist và Denylist an toàn
│   │   └── audit/             # Kho lưu trữ nhật ký kiểm toán Append-only
│   ├── platform/
│   │   ├── sqlite/            # Kết nối SQLite WAL mode và tự động chạy migrations
│   │   ├── helperproto/       # Định dạng gói tin IPC JSON có phiên bản
│   │   ├── security/          # Argon2id password hasher & JWT claim manager
│   │   └── config/            # Cấu hình môi trường qua ENV
│   └── transport/
│       ├── http/              # Router REST API Fiber v3, Middleware bảo vệ
│       └── ws/                # WebSocket endpoint metrics với bounded queue
├── db/migrations/             # Schema di chuyển SQLite (bảng users, audit_events, ...)
└── web/                       # Ứng dụng Single Page Application (React 19 + Vite)
    ├── src/
    │   ├── components/        # Navbar, Sidebar, Charts, ConfirmModal, StaleBanner
    │   ├── views/             # Overview, Workloads, Services, Audit, Settings, Login
    │   ├── lib/               # REST client, WebSocket client, Motion tokens
    │   └── types/             # Kiểu dữ liệu TypeScript đồng bộ với Go structs
    └── dist/                  # Kết quả biên dịch của Vite được nhúng vào Go
```

---

## 5. Tiến độ Phát triển (3-Sprint Roadmap)

- [x] **Sprint 1 (Hoàn thành 100%)**:
  - Khởi tạo kiến trúc Clean Architecture, SQLite WAL engine.
  - Phân hệ xác thực đa tầng Argon2id + JWT + Refresh Token Rotation.
  - Công cụ CLI bootstrap tài khoản quản trị ban đầu.
  - Bộ máy Telemetry Host Snapshot (CPU Delta %, RAM/Swap, Disks, Networks, Temp).
  - Telemetry Service với In-Memory Ring Buffer 120 điểm và WebSocket streaming 3s.
  - Giao diện Web SPA chuẩn Dark-first, Zero Emoji, Animate UI và nhúng vào Single Binary Go.
- [ ] **Sprint 2 (Đang triển khai)**:
  - Daemon Privileged Root Helper (`hscc-helper`) giao tiếp qua Unix socket `/run/hscc/helper.sock`.
  - Bộ máy Guardrail Policy Engine (Allowlist/Denylist).
  - Phân hệ Docker Engine Observability (`all: true`) & systemd D-Bus Manager.
  - Modal xác nhận thao tác 2 bước, `Idempotency-Key` và hệ thống Audit Trail bất biến.
- [ ] **Sprint 3 (Theo kế hoạch)**:
  - Quản lý Scheduled Tasks (Cron Jobs & Systemd Timers).
  - Tối ưu hóa hiệu năng, profiling P6200, đóng gói Ubuntu systemd services và nghiệm thu toàn diện.

---

## 6. Hướng dẫn Khởi chạy Nhanh

Xem hướng dẫn chi tiết tại [START.md](file:///f:/Build/NodePilot-homeserver/START.md).

```bash
# 1. Biên dịch Frontend (React 19 + Tailwind v4 + Vite)
cd web && npm run build && cd ..

# 2. Biên dịch Binary Go (Tự động nhúng web/dist)
go build -o bin/hscc-api.exe ./cmd/hscc-api
go build -o bin/hscc-cli.exe ./cmd/hscc-cli

# 3. Tạo tài khoản quản trị đầu tiên
./bin/hscc-cli.exe bootstrap --username admin --role admin

# 4. Khởi chạy máy chủ
./bin/hscc-api.exe
```

Truy cập giao diện tại: `http://127.0.0.1:17880`
