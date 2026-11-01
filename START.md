# START.md — Hướng dẫn Khởi chạy & Vận hành NodePilot HSCC

Tài liệu này cung cấp hướng dẫn từng bước chi tiết để biên dịch, khởi tạo tài khoản quản trị và chạy hệ thống **NodePilot Home Server Control Center (HSCC)** trên cả môi trường phát triển (Windows / Linux Dev) và máy chủ sản xuất (Ubuntu Server 24.04 LTS).

---

## 1. Yêu cầu Môi trường (Prerequisites)

- **Go**: Phiên bản `1.24` hoặc `1.26+` (Dự án sử dụng driver pure-Go `modernc.org/sqlite`, **không yêu cầu CGO hay GCC**).
- **Node.js & npm**: Node.js `v20+`, npm `v10+` (Chỉ cần thiết khi biên dịch giao diện Frontend; môi trường sản xuất không cần cài đặt Node.js).
- **Hệ điều hành**:
  - Máy phát triển: Windows 11 / Linux / macOS
  - Máy chủ sản xuất: Ubuntu Server 24.04 LTS (x86_64)

---

## 2. Dành cho Máy Phát triển (Dev): Khởi chạy 1-Click với Thư mục `start/`

Nếu bạn đang thử nghiệm trên máy tính cá nhân (Windows Dev), dự án đã cung cấp sẵn thư mục `start/` với các kịch bản tự động hóa 1-click:

- **Nhấp đúp chuột file `start/start.bat`** để mở Menu tương tác:
  - Chọn **[1]**: Tự động build, tạo admin mẫu (`admin` / `adminpassword123`) và tự mở trình duyệt tại `http://127.0.0.1:17880`.
  - Chọn **[2]**: Chế độ lập trình Hot-Reload (Backend Go + Frontend Vite tại `http://localhost:5173`).
  - Chọn **[3]**: Khởi chạy thử nghiệm cụm Docker Compose cục bộ.
  - Chọn **[4]**: Chạy toàn bộ kiểm thử Unit Tests tự động.

> Chi tiết xem thêm tại [start/README.md](file:///f:/Build/NodePilot-homeserver/start/README.md).

---

## 3. Khởi chạy Nhanh qua Docker (Khuyên Dùng cho Máy Chủ Acer Aspire 5733Z)

> [!TIP]
> **Giải pháp Tiết kiệm 100% Tài nguyên Máy chủ**: Hệ thống CI/CD của GitHub Actions đã tự động biên dịch toàn bộ Frontend và Backend trên đám mây. Máy chủ **hoàn toàn không cần chạy lệnh `build`**, không tốn CPU hay RAM để biên dịch.

### Triển khai chỉ với 2 câu lệnh:

```bash
# 1. Kéo image nhẹ đã đóng gói sẵn từ GitHub Container Registry
docker compose pull

# 2. Khởi chạy container với giới hạn tài nguyên nghiêm ngặt (CPU 0.5 core, RAM <= 120M)
docker compose up -d
```

### Khởi tạo tài khoản Quản trị viên bên trong container:
```bash
docker compose exec hscc-api hscc-cli bootstrap --username admin --role admin
```

Truy cập hệ thống ngay tại: `http://<IP_MAY_CHU>:17880`

### Cơ chế Tự động Cập nhật Không Cần Gõ Lệnh (Zero-Command Updates)

Sau khi cài đặt lần đầu, bạn **hoàn toàn không cần gõ lệnh terminal nữa**:

1. **Cập nhật tự động ngầm (Watchtower Daemon)**:
   - Dịch vụ `watchtower` đi kèm sẽ định kỳ quét GitHub Container Registry (GHCR).
   - Khi có commit mới được GitHub Actions build xong, Watchtower sẽ tự kéo image mới về và khởi động lại container nhẹ nhàng trong 3 giây.
   - Cơ chế `WATCHTOWER_CLEANUP=true` tự động xóa sạch các image cũ để không bao giờ làm đầy ổ cứng của máy chủ.

2. **Chủ động cập nhật ngay trên giao diện Web UI (1-Click Update)**:
   - Nhấn nút **"Cập nhật"** trên thanh Navbar hoặc trong mục **"Cài đặt & Chính sách"**.
   - Bấm **"Quét Git tìm bản mới nhất"**: Hệ thống sẽ đối soát commit đang chạy với commit mới nhất trên GitHub repository.
   - Nếu có bản mới: Bấm **"Cập nhật ngay"**. Backend sẽ tự động phát tín hiệu tới Watchtower API (`/v1/update`) để cập nhật ngay lập tức mà không cần SSH hay terminal.

---

## 4. Khởi chạy Thủ công (Chế độ Single Binary Sản xuất)

Toàn bộ giao diện Web SPA được nhúng trực tiếp vào file nhị phân Go. Bạn chỉ cần thực hiện 4 bước sau:

### Bước 1: Biên dịch Giao diện Web (SPA)
Vào thư mục `web/`, cài đặt dependencies và đóng gói giao diện:

```bash
cd web
npm install
npm run build
cd ..
```
*Kết quả sẽ được ghi vào thư mục `web/dist/`.*

### Bước 2: Biên dịch các File Nhị phân Go
Biên dịch công cụ quản trị dòng lệnh `hscc-cli` và máy chủ chính `hscc-api`:

**Trên Windows (PowerShell):**
```powershell
go build -o bin/hscc-cli.exe ./cmd/hscc-cli
go build -o bin/hscc-api.exe ./cmd/hscc-api
```

**Trên Linux / Ubuntu Server:**
```bash
go build -o bin/hscc-cli ./cmd/hscc-cli
go build -o bin/hscc-api ./cmd/hscc-api
```

### Bước 3: Khởi tạo Tài khoản Quản trị viên (Bootstrap)
Dự án sử dụng cơ chế an toàn: Lệnh bootstrap chỉ được thực hiện **duy nhất một lần** khi cơ sở dữ liệu chưa có tài khoản admin:

**Trên Windows:**
```powershell
./bin/hscc-cli.exe bootstrap --username admin --role admin
```
*Hệ thống sẽ nhắc bạn nhập mật khẩu bảo mật (tối thiểu 8 ký tự). Mật khẩu được băm an toàn bằng thuật toán **Argon2id**.*

**Trên Linux:**
```bash
./bin/hscc-cli bootstrap --username admin --role admin
```

*(Nếu cố tình chạy lại lệnh này lần thứ hai, hệ thống sẽ từ chối để ngăn chặn tấn công chiếm quyền).*

### Bước 4: Khởi chạy Máy chủ HSCC API
Chạy file nhị phân vừa tạo:

**Trên Windows:**
```powershell
./bin/hscc-api.exe
```

**Trên Linux:**
```bash
./bin/hscc-api
```

### Bước 5: Truy cập Giao diện Web
Mở trình duyệt web và truy cập địa chỉ:
```
http://127.0.0.1:17880
```
- Đăng nhập bằng tài khoản `admin` và mật khẩu bạn vừa thiết lập ở Bước 3.
- Giao diện Dark-first sẽ tự động thiết lập kết nối WebSocket thời gian thực (chu kỳ 3s) để hiển thị thông số CPU, RAM, Ổ đĩa, Băng thông mạng và Workloads.

---

## 5. Khởi chạy ở Chế độ Phát triển Nâng cao (Dev Mode với Hot-Reload)

Khi lập trình và cần chỉnh sửa giao diện nhanh chóng với tính năng HMR (Hot Module Replacement):

### Terminal 1: Chạy Backend Go API
```bash
go run ./cmd/hscc-api
```
*Backend sẽ chạy tại `http://127.0.0.1:17880`.*

### Terminal 2: Chạy Frontend Vite Dev Server
```bash
cd web
npm run dev
```
*Truy cập `http://localhost:5173` để code với Hot Reload. Vite đã được cấu hình proxy tự động các request `/api/` và `/ws/` về backend cổng `17880`.*

---

## 4. Chạy Kiểm thử Tự động (Testing)

### Chạy Unit Test Backend Go
Kiểm thử toàn bộ hệ thống xác thực (Argon2id, JWT claim rotation, token reuse detection) và In-Memory Ring Buffer:

```bash
go test -v ./...
```
*Yêu cầu tất cả các test suite phải đạt kết quả `PASS`.*

### Kiểm tra Kiểu TypeScript & Build Frontend
```bash
cd web
npm run build
cd ..
```

---

## 6. Biến Môi trường Cấu hình (Environment Variables)

Hệ thống có thể tùy biến qua các biến môi trường (hoặc file `.env`):

| Tên biến | Giá trị mặc định | Mô tả |
| :--- | :--- | :--- |
| `HSCC_ADDR` | `127.0.0.1:17880` | Địa chỉ và cổng mạng máy chủ API lắng nghe |
| `HSCC_DB_PATH` | `./data/hscc.db` | Đường dẫn file cơ sở dữ liệu SQLite (WAL mode) |
| `HSCC_JWT_SECRET` | *(chuỗi ngẫu nhiên)* | Khóa bí mật dùng để ký và xác thực JWT token |
| `HSCC_HELPER_SOCKET` | `/run/hscc/helper.sock` | Đường dẫn socket IPC Unix kết nối đến `hscc-helper` |
| `HSCC_LOG_LEVEL` | `INFO` | Mức ghi log (`DEBUG`, `INFO`, `WARN`, `ERROR`) |

---

## 7. Hướng dẫn Triển khai trên Ubuntu Server 24.04 (Acer Aspire 5733Z)

### 1. Biên dịch chéo (Cross-compile) từ máy Dev sang Linux:
```bash
# Biên dịch Frontend trước
cd web && npm run build && cd ..

# Biên dịch Binary Go cho kiến trúc Linux x86_64
GOOS=linux GOARCH=amd64 go build -o bin/hscc-api-linux ./cmd/hscc-api
GOOS=linux GOARCH=amd64 go build -o bin/hscc-cli-linux ./cmd/hscc-cli
```

### 2. Thiết lập trên máy chủ Ubuntu:
```bash
# Tạo người dùng hệ thống không đặc quyền
sudo useradd -r -s /usr/sbin/nologin hscc

# Tạo thư mục dữ liệu và phân quyền
sudo mkdir -p /var/lib/hscc /etc/hscc /run/hscc
sudo chown -R hscc:hscc /var/lib/hscc /run/hscc

# Copy binary vào /usr/local/bin
sudo cp bin/hscc-api-linux /usr/local/bin/hscc-api
sudo cp bin/hscc-cli-linux /usr/local/bin/hscc-cli
sudo chmod +x /usr/local/bin/hscc-api /usr/local/bin/hscc-cli

# Khởi tạo tài khoản admin
sudo -u hscc HSCC_DB_PATH=/var/lib/hscc/hscc.db /usr/local/bin/hscc-cli bootstrap --username admin --role admin
```

### 3. Tạo file Dịch vụ systemd (`/etc/systemd/system/hscc-api.service`):
```ini
[Unit]
Description=NodePilot Home Server Control Center (HSCC) API
After=network.target tailscaled.service

[Service]
Type=simple
User=hscc
Group=hscc
WorkingDirectory=/var/lib/hscc
Environment="HSCC_ADDR=127.0.0.1:17880"
Environment="HSCC_DB_PATH=/var/lib/hscc/hscc.db"
ExecStart=/usr/local/bin/hscc-api
Restart=always
RestartSec=5s
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

### 4. Kích hoạt và Khởi chạy Dịch vụ:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hscc-api.service
sudo systemctl status hscc-api.service
```
