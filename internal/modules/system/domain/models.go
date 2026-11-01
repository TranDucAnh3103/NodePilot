package domain

import "time"

// HostInfo contains basic OS and hardware metadata.
type HostInfo struct {
	Hostname      string `json:"hostname"`
	OS            string `json:"os"`
	Platform      string `json:"platform"`
	KernelVersion string `json:"kernelVersion"`
	Architecture  string `json:"architecture"`
	UptimeSeconds uint64 `json:"uptimeSeconds"`
	BootTime      uint64 `json:"bootTime"`
}

// CPUMetrics contains overall CPU usage and Linux load averages.
type CPUMetrics struct {
	UsagePercent *float64  `json:"usagePercent"` // Null during first tick warming up (BUG-1.1)
	Cores        int       `json:"cores"`
	Load1        float64   `json:"load1"`
	Load5        float64   `json:"load5"`
	Load15       float64   `json:"load15"`
	PerCoreUsage []float64 `json:"perCoreUsage,omitempty"`
}

// MemoryMetrics contains granular RAM breakdown in bytes.
type MemoryMetrics struct {
	TotalBytes      uint64  `json:"totalBytes"`
	UsedBytes       uint64  `json:"usedBytes"`
	AvailableBytes  uint64  `json:"availableBytes"`
	UsedPercent     float64 `json:"usedPercent"`
	CachedBytes     uint64  `json:"cachedBytes"`
	BuffersBytes    uint64  `json:"buffersBytes"`
	SwapTotalBytes  uint64  `json:"swapTotalBytes"`
	SwapUsedBytes   uint64  `json:"swapUsedBytes"`
	SwapUsedPercent float64 `json:"swapUsedPercent"`
}

// DiskPartition represents actual mounted filesystems.
type DiskPartition struct {
	Device      string  `json:"device"`
	Mountpoint  string  `json:"mountpoint"`
	FSType      string  `json:"fsType"`
	TotalBytes  uint64  `json:"totalBytes"`
	UsedBytes   uint64  `json:"usedBytes"`
	FreeBytes   uint64  `json:"freeBytes"`
	UsedPercent float64 `json:"usedPercent"`
}

// NetworkInterface represents per-interface stats and throughput.
type NetworkInterface struct {
	Name           string  `json:"name"`
	IsUp           bool    `json:"isUp"`
	RxBytes        uint64  `json:"rxBytes"`
	TxBytes        uint64  `json:"txBytes"`
	RxBytesPerSec  float64 `json:"rxBytesPerSec"`
	TxBytesPerSec  float64 `json:"txBytesPerSec"`
}

// TemperatureInfo represents hardware sensor readings.
type TemperatureInfo struct {
	Supported bool     `json:"supported"`
	Celsius   *float64 `json:"celsius"` // null if unsupported (BR-08)
}

// HostSnapshot is the single unified state emitted by the collector.
type HostSnapshot struct {
	CapturedAt  time.Time          `json:"capturedAt"`
	Host        HostInfo           `json:"host"`
	CPU         CPUMetrics         `json:"cpu"`
	Memory      MemoryMetrics      `json:"memory"`
	Disks       []DiskPartition    `json:"disks"`
	Networks    []NetworkInterface `json:"networks"`
	Temperature TemperatureInfo    `json:"temperature"`
	Stale       bool               `json:"stale"`
}
