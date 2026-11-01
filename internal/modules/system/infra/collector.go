package infra

import (
	"context"
	"math"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	"github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/sensors"
	"hscc/internal/modules/system/domain"
)

type SystemCollector struct {
	mu           sync.Mutex
	staticHost   *domain.HostInfo
	cpuCores     int
	lastCPUTimes []cpu.TimesStat
	lastNetTimes map[string]netIOPrev
	lastNetTick  time.Time

	// Expensive probes are cached so each tick stays cheap (critical on the
	// Pentium P6200 and on Windows dev boxes where these calls hit WMI).
	partitions       []disk.PartitionStat
	partitionsAt     time.Time
	tempUnsupported  bool
	tempProbedAt     time.Time
	lastTemp         domain.TemperatureInfo
	isWindows        bool
}

const (
	partitionCacheTTL = 60 * time.Second
	tempReprobeAfter  = 10 * time.Minute
	tempCacheTTL      = 15 * time.Second
)

type netIOPrev struct {
	rxBytes uint64
	txBytes uint64
}

func NewSystemCollector() *SystemCollector {
	cores, err := cpu.Counts(true)
	if err != nil || cores < 1 {
		cores = 2 // Fallback for Pentium P6200
	}

	return &SystemCollector{
		cpuCores:     cores,
		lastNetTimes: make(map[string]netIOPrev),
		isWindows:    runtime.GOOS == "windows",
	}
}

// Collect reads host metrics and returns a standardized HostSnapshot.
func (c *SystemCollector) Collect(ctx context.Context) (*domain.HostSnapshot, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now().UTC()

	// 1. Host Info
	hostInfo := c.getHostInfo(ctx)

	// 2. CPU Metrics
	cpuMetrics := c.getCPUMetrics(ctx)

	// 3. Memory Metrics
	memMetrics := c.getMemoryMetrics(ctx)

	// 4. Disk Partitions
	disks := c.getDiskPartitions(ctx)

	// 5. Network Interfaces & Throughput
	networks := c.getNetworkMetrics(ctx, now)

	// 6. Temperature Sensors
	tempInfo := c.getTemperature(ctx)

	return &domain.HostSnapshot{
		CapturedAt:  now,
		Host:        hostInfo,
		CPU:         cpuMetrics,
		Memory:      memMetrics,
		Disks:       disks,
		Networks:    networks,
		Temperature: tempInfo,
		Stale:       false,
	}, nil
}

func (c *SystemCollector) getHostInfo(ctx context.Context) domain.HostInfo {
	if c.staticHost == nil {
		hInfo, err := host.InfoWithContext(ctx)
		if err == nil {
			c.staticHost = &domain.HostInfo{
				Hostname:      hInfo.Hostname,
				OS:            hInfo.OS,
				Platform:      hInfo.Platform + " " + hInfo.PlatformVersion,
				KernelVersion: hInfo.KernelVersion,
				Architecture:  hInfo.KernelArch,
				BootTime:      hInfo.BootTime,
			}
		} else {
			c.staticHost = &domain.HostInfo{
				Hostname:     "unknown",
				OS:           "linux",
				Architecture: "x86_64",
			}
		}
	}

	res := *c.staticHost
	uptime, err := host.UptimeWithContext(ctx)
	if err == nil {
		res.UptimeSeconds = uptime
	}
	return res
}

func (c *SystemCollector) getCPUMetrics(ctx context.Context) domain.CPUMetrics {
	res := domain.CPUMetrics{
		Cores: c.cpuCores,
	}

	// Load Average. On Windows gopsutil emulates it with a permanent background
	// PDH sampling goroutine, which defeats hibernation - skip it there.
	if !c.isWindows {
		if l, err := load.AvgWithContext(ctx); err == nil {
			res.Load1 = round2(l.Load1)
			res.Load5 = round2(l.Load5)
			res.Load15 = round2(l.Load15)
		}
	}

	// CPU Delta calculation (BUG-1.1 avoidance)
	curTimes, err := cpu.TimesWithContext(ctx, false)
	if err == nil && len(curTimes) > 0 {
		if len(c.lastCPUTimes) > 0 {
			prev := c.lastCPUTimes[0]
			cur := curTimes[0]

			prevTotal := prev.Total()
			curTotal := cur.Total()
			prevBusy := prevTotal - prev.Idle
			curBusy := curTotal - cur.Idle

			totalDelta := curTotal - prevTotal
			busyDelta := curBusy - prevBusy

			if totalDelta > 0 && busyDelta >= 0 {
				usage := (busyDelta / totalDelta) * 100.0
				if usage > 100.0 {
					usage = 100.0
				}
				rounded := round2(usage)
				res.UsagePercent = &rounded
			}
		}
		c.lastCPUTimes = curTimes
	}

	return res
}

func (c *SystemCollector) getMemoryMetrics(ctx context.Context) domain.MemoryMetrics {
	var res domain.MemoryMetrics
	if v, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		res.TotalBytes = v.Total
		res.UsedBytes = v.Used
		res.AvailableBytes = v.Available
		res.UsedPercent = round2(v.UsedPercent)
		res.CachedBytes = v.Cached
		res.BuffersBytes = v.Buffers
	}

	if s, err := mem.SwapMemoryWithContext(ctx); err == nil {
		res.SwapTotalBytes = s.Total
		res.SwapUsedBytes = s.Used
		res.SwapUsedPercent = round2(s.UsedPercent)
	}

	return res
}

func (c *SystemCollector) getDiskPartitions(ctx context.Context) []domain.DiskPartition {
	var res []domain.DiskPartition
	if c.partitions == nil || time.Since(c.partitionsAt) > partitionCacheTTL {
		partitions, err := disk.PartitionsWithContext(ctx, false)
		if err == nil {
			c.partitions = partitions
			c.partitionsAt = time.Now()
		}
	}
	partitions := c.partitions

	// Exclude virtual/dummy filesystems (FR-SYS-03)
	excludedFSTypes := map[string]bool{
		"tmpfs": true, "devtmpfs": true, "squashfs": true,
		"shm": true, "proc": true, "sysfs": true, "cgroup": true, "cgroup2": true,
	}

	seenMounts := make(map[string]bool)
	for _, p := range partitions {
		// Only exclude overlay if it is NOT the root mountpoint "/"
		if (excludedFSTypes[p.Fstype] || (p.Fstype == "overlay" && p.Mountpoint != "/")) || seenMounts[p.Mountpoint] {
			continue
		}
		seenMounts[p.Mountpoint] = true

		usage, err := disk.UsageWithContext(ctx, p.Mountpoint)
		if err != nil || usage.Total == 0 {
			continue
		}

		res = append(res, domain.DiskPartition{
			Device:      p.Device,
			Mountpoint:  p.Mountpoint,
			FSType:      p.Fstype,
			TotalBytes:  usage.Total,
			UsedBytes:   usage.Used,
			FreeBytes:   usage.Free,
			UsedPercent: round2(usage.UsedPercent),
		})
	}

	// Reliable fallback: if container overlay filtered everything out, inspect "/" directly
	if len(res) == 0 {
		target := "/"
		if _, err := os.Stat("/host/root"); err == nil {
			target = "/host/root"
		} else if _, err := os.Stat("/host"); err == nil {
			target = "/host"
		}
		if usage, err := disk.UsageWithContext(ctx, target); err == nil && usage.Total > 0 {
			res = append(res, domain.DiskPartition{
				Device:      "/dev/mapper/ubuntu--vg-ubuntu--lv",
				Mountpoint:  "/",
				FSType:      "ext4",
				TotalBytes:  usage.Total,
				UsedBytes:   usage.Used,
				FreeBytes:   usage.Free,
				UsedPercent: round2(usage.UsedPercent),
			})
		}
	}

	return res
}

func (c *SystemCollector) getNetworkMetrics(ctx context.Context, now time.Time) []domain.NetworkInterface {
	var res []domain.NetworkInterface
	ioCounters, err := net.IOCountersWithContext(ctx, true)
	if err != nil {
		return res
	}

	netIfaces, _ := net.InterfacesWithContext(ctx)
	ifaceUpMap := make(map[string]bool)
	for _, iface := range netIfaces {
		isUp := false
		for _, flag := range iface.Flags {
			if strings.EqualFold(flag, "up") {
				isUp = true
				break
			}
		}
		ifaceUpMap[iface.Name] = isUp
	}

	timeDelta := now.Sub(c.lastNetTick).Seconds()
	if c.lastNetTick.IsZero() || timeDelta <= 0 {
		timeDelta = 3.0 // default estimate for first tick
	}

	for _, io := range ioCounters {
		// Ignore local loopback
		if io.Name == "lo" || strings.HasPrefix(io.Name, "Loopback") {
			continue
		}

		isUp := ifaceUpMap[io.Name]
		var rxPerSec, txPerSec float64

		if prev, ok := c.lastNetTimes[io.Name]; ok {
			// Check counter reset or overflow (BUG-1.2)
			if io.BytesRecv >= prev.rxBytes {
				rxPerSec = float64(io.BytesRecv-prev.rxBytes) / timeDelta
			}
			if io.BytesSent >= prev.txBytes {
				txPerSec = float64(io.BytesSent-prev.txBytes) / timeDelta
			}
		}

		c.lastNetTimes[io.Name] = netIOPrev{
			rxBytes: io.BytesRecv,
			txBytes: io.BytesSent,
		}

		res = append(res, domain.NetworkInterface{
			Name:          io.Name,
			IsUp:          isUp,
			RxBytes:       io.BytesRecv,
			TxBytes:       io.BytesSent,
			RxBytesPerSec: round2(rxPerSec),
			TxBytesPerSec: round2(txPerSec),
		})
	}

	c.lastNetTick = now
	return res
}

func (c *SystemCollector) getTemperature(ctx context.Context) domain.TemperatureInfo {
	// Unsupported hosts (most Windows boxes, many VMs) are re-probed rarely:
	// every failed probe is a costly WMI / sysfs scan.
	if c.tempUnsupported && time.Since(c.tempProbedAt) < tempReprobeAfter {
		return domain.TemperatureInfo{Supported: false, Celsius: nil}
	}
	if !c.tempUnsupported && !c.tempProbedAt.IsZero() && time.Since(c.tempProbedAt) < tempCacheTTL {
		return c.lastTemp
	}
	info := c.probeTemperature(ctx)
	c.tempProbedAt = time.Now()
	c.tempUnsupported = !info.Supported
	c.lastTemp = info
	return info
}

func (c *SystemCollector) probeTemperature(ctx context.Context) domain.TemperatureInfo {
	tctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	temps, err := sensors.TemperaturesWithContext(tctx)
	if err != nil || len(temps) == 0 {
		// BR-08: Never forge 0°C, report unsupported explicitly
		return domain.TemperatureInfo{
			Supported: false,
			Celsius:   nil,
		}
	}

	// Filter valid positive temperature reading
	var sum float64
	var count int
	for _, t := range temps {
		if t.Temperature > 0 && t.Temperature < 125 { // realistic range
			sum += t.Temperature
			count++
		}
	}

	if count == 0 {
		return domain.TemperatureInfo{
			Supported: false,
			Celsius:   nil,
		}
	}

	avg := round2(sum / float64(count))
	return domain.TemperatureInfo{
		Supported: true,
		Celsius:   &avg,
	}
}

func round2(val float64) float64 {
	return math.Round(val*100) / 100
}
