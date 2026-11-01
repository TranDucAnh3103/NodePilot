import React from 'react'
import ReactECharts from 'echarts-for-react'

interface NetworkChartProps {
  history: Array<{ time: string; rxKB: number; txKB: number }>
}

export const NetworkChart: React.FC<NetworkChartProps> = ({ history }) => {
  const times = history.map((h) => h.time)
  const rxValues = history.map((h) => h.rxKB)
  const txValues = history.map((h) => h.txKB)

  const option = {
    backgroundColor: 'transparent',
    grid: {
      top: 15,
      right: 15,
      bottom: 25,
      left: 45,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0f172a',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
    },
    legend: {
      data: ['Tải về (RX)', 'Tải lên (TX)'],
      textStyle: { color: '#94a3b8', fontSize: 11 },
      right: 10,
      top: 0,
    },
    xAxis: {
      type: 'category',
      data: times,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value} KB/s' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        name: 'Tải về (RX)',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: rxValues,
        itemStyle: { color: '#10b981' },
      },
      {
        name: 'Tải lên (TX)',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: txValues,
        itemStyle: { color: '#38bdf8' },
      },
    ],
  }

  return (
    <div className="w-full h-44">
      <ReactECharts
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
      />
    </div>
  )
}
