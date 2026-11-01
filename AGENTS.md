# AGENTS.md — NodePilot Home Server Control Center (HSCC)
## Development, Architecture, UI/UX Pro Max, and Animation Standards

This document establishes the binding standards, coding principles, UI/UX rules, and animation guidelines for all AI agents and developers working on the **NodePilot Home Server Control Center (HSCC)** codebase.

---

## 1. Project Mission & Hardware Constraints

### 1.1 Target Hardware & Operating Environment
- **Host Server**: Acer Aspire 5733Z
- **CPU**: Intel® Pentium® P6200 (2 Cores / 2 Threads, 2.13 GHz, Arrandale architecture, 3MB Intel® Smart Cache)
- **RAM**: ~3.5 GiB DDR3 (shared with integrated Intel HD Graphics)
- **Target OS**: Ubuntu Server 24.04 LTS (x86_64)
- **Primary Display (Local / Kiosk)**: 15.6" HD WXGA (1366x768)

### 1.2 Resource Footprint Targets (Strict Non-Negotiable Budgets)
- **`hscc-api` (Backend & Web SPA)**:
  - Memory RSS (Idle / Stable): $\le \mathbf{120\text{ MiB}}$
  - CPU Utilization (Idle, No active WS clients): $\le \mathbf{1.5\%}$
  - CPU Utilization (Active streaming with 1-2 UI clients): $\le \mathbf{3.0\%}$
- **`hscc-helper` (Privileged Root Helper)**:
  - Memory RSS: $\le \mathbf{45\text{ MiB}}$
  - CPU Utilization: $\approx \mathbf{0.0\%}$ when idle (event-driven IPC socket)
- **Single Binary Artifact**: The production frontend must be built (`npm run build`) and embedded into the Go binary (`//go:embed web/dist/*`). No Node.js runtime or Python daemon is permitted on the production server.

---

## 2. Core Architectural Philosophy: Observability vs Control

### 2.1 100% Unrestricted Host Observability
- **Principle**: The system must observe **100% of all workloads** running on the host machine.
- **Scope**:
  - All Docker containers (`docker ps -a`), images, volumes, and networks.
  - All systemd units (`services`, `timers`, `sockets`, `mounts`) across the entire OS.
  - All host processes (`ps`, `gopsutil`), network interfaces, and storage mount points.
- **Rule**: Never hide or filter out unmanaged workloads from the read-only observability views. Operators must have full situational awareness of their entire homeserver.

### 2.2 Strict Guardrail Execution (Allowlist / Denylist)
- **Principle**: Write/Mutate operations (Start, Stop, Restart, Signal, Prune, Edit) are strictly constrained.
- **Denylist (Hardcoded System Safety Lock)**:
  - Critical services (`ssh`, `sshd`, `tailscaled`, `cloudflared`, `nginx`, `caddy`, `docker`, `containerd`, `dbus`, `systemd-*`, `hscc-*`) are strictly protected from modification or stopping.
  - Any mutation attempt targeting a Denylisted service must be blocked immediately with a `403 Forbidden` response and logged to the immutable audit trail.
- **Allowlist (Managed Targets Policy)**:
  - Only workloads explicitly registered in the Allowlist (`/etc/hscc/helper-policy.yaml`) or designated managed projects can be mutated by the API.
  - Every dangerous action requires:
    1. A **2-Step Confirmation Modal** on the UI.
    2. An **`Idempotency-Key`** header on the REST request.
    3. An **Immutable Audit Event** recorded in SQLite `audit_events`.

---

## 3. UI/UX Pro Max Design Standards (`ui-ux-pro-max-skill`)

All user interfaces must strictly comply with the design intelligence and UX rules derived from `ui-ux-pro-max-skill`.

### 3.1 Absolute Ban on Emojis (Zero Emojis Policy)
> [!CAUTION]
> **DO NOT USE EMOJIS ANYWHERE IN THE USER INTERFACE.**
> Emojis render inconsistently across operating systems, look playful/unprofessional in infrastructure tooling, and break accessibility screen-reader hierarchy.

- **Rule**: Replace 100% of emojis with vector SVG icons from **`lucide-react`**.
  - Incorrect: `📊 Dashboard`, `⚙️ Settings`, `🛑 Stop`, `✅ Running`, `⚠️ Warning`
  - Correct: `<LayoutDashboard className="w-4 h-4" />`, `<Settings className="w-4 h-4" />`, `<Square className="w-4 h-4" />`, `<CheckCircle2 className="w-4 h-4 text-emerald-400" />`, `<AlertTriangle className="w-4 h-4 text-amber-400" />`
- **Icon Sizing & Style Tokens**:
  - Tiny / Inline with badge: `w-3 h-3` or `w-3.5 h-3.5`, `strokeWidth={2}`
  - Standard action / Navigation menu: `w-4 h-4` (16px), `strokeWidth={1.75}`
  - Section header / Metric card icon: `w-5 h-5` (20px), `strokeWidth={1.75}`
  - Modal / Empty state / Hero icon: `w-8 h-8` (32px), `strokeWidth={1.5}`

### 3.2 Color System & Semantic Tokens (Dark-first Operations Theme)
The color palette is engineered for high contrast, low eye fatigue in 24/7 server environments, and WCAG 2.2 AA accessibility:

| Token Role | Tailwind Class | Hex Value | Usage |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `bg-slate-950` | `#020617` | Root app background |
| **Card Surface (Base)** | `bg-slate-900/60` | `#0f172a` (60% alpha) | Content panels, metric widgets |
| **Card Surface (Raised)** | `bg-slate-900/90` | `#0f172a` (90% alpha) | Modals, dropdowns, floating banners |
| **Border (Default)** | `border-slate-800` | `#1e293b` | Card borders, dividers, table rows |
| **Border (Subtle/Hover)**| `border-slate-700/60` | `#334155` | Hovered cards, active inputs |
| **Primary Brand** | `bg-indigo-600` / `text-indigo-400` | `#4f46e5` / `#818cf8` | Primary CTA, logo mark, key graphs |
| **Accent Tech** | `text-teal-400` / `bg-teal-500` | `#2dd4bf` / `#14b8a6` | Network throughput, telemetry tags |
| **Status: Running** | `text-emerald-400` / `bg-emerald-500/15` | `#34d399` | Online containers, active systemd units |
| **Status: Stopped** | `text-slate-400` / `bg-slate-800` | `#94a3b8` | Exited containers, inactive units |
| **Status: Degraded** | `text-amber-400` / `bg-amber-500/15` | `#fbbf24` | High CPU/RAM, stale telemetry |
| **Status: Critical** | `text-rose-400` / `bg-rose-500/15` | `#fb7185` | Failed units, dead containers, socket errors |
| **Action: Destructive** | `bg-rose-600 hover:bg-rose-500` | `#e11d48` | Kill, Force Stop, Prune modals |

### 3.3 Typography Hierarchy & Formatting
- **UI Body & Headings**: Inter / System Sans (`font-sans`), clean letter tracking (`tracking-tight`).
- **Data, Metrics & Identifiers**: Monospace font (`font-mono` / `JetBrains Mono` / `ui-monospace`) for:
  - Memory & Disk sizes (`1.84 GiB / 3.42 GiB`, `52.4%`)
  - Container IDs & Hashes (`e4a9f3b10c82`)
  - PIDs and systemd unit names (`hscc-helper.service`, `PID 1420`)
  - Network addresses and ports (`127.0.0.1:17880`, `0.0.0.0:80->80/tcp`)
  - Throughput rates (`142.5 KiB/s`, `1.2 MiB/s`)
- **No Text Truncation Without Hover**: Never slice off container names or unit names without a full tooltip or auto-wrapping card layout.

### 3.4 Responsive Design & Ergonomics Checklist
- **Breakpoints**: Must adapt smoothly to:
  - `375px`: Mobile admin on the go (collapsible drawer, full-width cards).
  - `768px`: Tablet / iPad view.
  - `1024px`: Compact laptop view.
  - `1366x768`: **Native Acer Aspire 5733Z display** (optimal layout density without vertical scrolling overload).
  - `1440px+`: Large desktop monitor (multi-column grid).
- **Interactive Affordance**: All interactive controls must specify `cursor-pointer` and visible keyboard `:focus-visible:ring-2 :focus-visible:ring-indigo-500`.

---

## 4. UI Animation & Motion Standards (`animate-ui`)

All motion and animations must strictly follow the specifications from `animate-ui` and Motion for React.

### 4.1 Core Motion Tokens
Always import and use the standardized tokens from `@animate-ui/react/utils/motion` (or adhere to these exact values):

```tsx
import { spring, ease, transition } from '@animate-ui/react/utils/motion';
```

| Token | Motion Config | Target Usage |
| :--- | :--- | :--- |
| **`spring.press`** | `{ type: 'spring', stiffness: 550, damping: 30 }` | Micro-interaction on button/card click (`whileTap={{ scale: 0.98 }}`). |
| **`spring.pop`** | `{ type: 'spring', stiffness: 400, damping: 29 }` | Status badges, tooltips, popovers, dropdown menus. |
| **`spring.dialog`** | `{ type: 'spring', stiffness: 150, damping: 25 }` | 2-step confirmation modal entrance & mutate dialogues. |
| **`spring.highlight`** | `{ type: 'spring', stiffness: 500, damping: 40 }` | Sliding active indicator across navigation tabs / pills. |
| **`spring.progress`** | `{ type: 'spring', stiffness: 300, damping: 35 }` | Smooth progress bars (CPU %, RAM %, Disk %). |
| **`transition.fade`** | `{ duration: 0.2, ease: [0, 0, 0.2, 1] }` | View switching and tab content transitions. |
| **`transition.menu`** | `{ duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }` | Collapsible sidebar, mobile navigation drawer. |

### 4.2 Low-Power Hardware Optimization (The Pentium P6200 Constraint)
> [!IMPORTANT]
> Because clients may access HSCC from low-power devices, all animations must run exclusively on the GPU compositor thread.

1. **Only Animate Compositor Properties**:
   - ✅ **Permitted**: `opacity`, `transform` (`translateX`, `translateY`, `scale`, `rotate`).
   - ❌ **Forbidden**: `height`, `width`, `top`, `left`, `margin`, `padding` (causes layout reflow and CPU spikes).
2. **Tab Visibility Throttling**:
   - When the user minimizes the browser or switches tabs (`document.visibilityState === 'hidden'`), all chart tickers, WebSocket rendering, and continuous CSS/JS animations MUST be paused.
   - Resume smoothly upon `visibilitychange`.

### 4.3 Accessibility: `prefers-reduced-motion` Compliance
- Always wrap animated trees with `ReducedMotionConfig` or query `useShouldReduceMotion()`:
  ```tsx
  import { useShouldReduceMotion } from '@animate-ui/react/utils/motion';

  export function AnimatedCard({ children }: { children: React.ReactNode }) {
    const shouldReduce = useShouldReduceMotion();
    return (
      <motion.div
        initial={{ opacity: 0, y: shouldReduce ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition.fade}
      >
        {children}
      </motion.div>
    );
  }
  ```
- Under reduced motion: Movement and scaling are suppressed; gentle opacity fades are retained.

---

## 5. Backend & Full-Stack Development Rules

### 5.1 Clean Architecture Directory Structure
```
internal/
├── modules/
│   ├── auth/          # Domain, Repository, Service (Argon2id, JWT, Cookie Rotate)
│   ├── system/        # Host Telemetry Engine (CPU, RAM, Disks, Networks, Temp)
│   ├── telemetry/     # RingBuffer (120 samples), Shared Collector Ticker (3s)
│   ├── workloads/     # Docker & systemd domain, Observability & Guardrails
│   ├── guardrail/     # Policy Engine (Denylist, Allowlist validator)
│   └── audit/         # Immutable append-only audit repository
├── platform/
│   ├── sqlite/        # SQLite WAL mode, schema migrations
│   └── helperproto/   # Versioned IPC JSON protocol (protocolVersion: 1)
└── transport/
    ├── http/          # Fiber v3 REST API, middleware, auth guards
    └── ws/            # WebSocket handler, bounded ring queues, auth-first message
cmd/
├── hscc-api/          # Main non-root daemon (REST, WS, embedded React SPA)
├── hscc-helper/       # Root privileged helper daemon (/run/hscc/helper.sock)
└── hscc-cli/          # Local CLI bootstrap tool (admin creation, policy check)
web/                   # React 19 + TypeScript + Vite + Tailwind CSS 4 SPA
```

### 5.2 Code Quality & Testing Mandates
1. **Zero Unhandled Errors**: Every Go error must be handled or explicitly propagated with structured context.
2. **Thread Safety**: All shared in-memory state (RingBuffer, WebSocket connection maps, Telemetry cache) must be guarded with `sync.RWMutex` or lock-free atomics.
3. **Audit Immutability**: The `audit_events` table has only `INSERT` and `SELECT` queries. Never implement `UPDATE` or `DELETE` endpoints for audit logs.
4. **Unit & Smoke Tests**: Any new module must provide automated test coverage (`go test ./...` and `npm run build` must always pass).

---

## 6. Pre-Delivery Verification Checklist

Before committing or completing any sprint task, verify:
- [ ] **No Emojis**: Verified that zero emojis exist in the UI components; all icons are SVG from `lucide-react`.
- [ ] **Animate UI Standards**: Animations use tokens from `@animate-ui/react/utils/motion`, have `whileTap` press feedback, and respect `prefers-reduced-motion`.
- [ ] **Observability Scope**: 100% of host workloads (containers and services) are visible in the read views.
- [ ] **Guardrails Intact**: Denylisted targets cannot be stopped or restarted.
- [ ] **Binary Embedding**: `npm run build` passes cleanly, `go test ./...` passes, and the binary compiles without warnings.
