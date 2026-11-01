import React from 'react'
import ReactECharts from 'echarts-for-react'

interface CpuChartProps {
  history: Array<{ time: string; value: number }>
}

export const CpuChart: React.FC<CpuChartProps> = ({ history }) => {
  const times = history.map((h) => h.time)
  const values = history.map((h) => h.value)

  const option = {
    backgroundColor: 'transparent',
    grid: {
      top: 15,
      right: 15,
      bottom: 25,
      left: 35,
    },
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>CPU: {c}%',
      backgroundColor: '#0f172a',
      borderColor: '#334155',
      textStyle: { color: '#f8fafc', fontSize: 12 },
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
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#1e293b' } },
    },
    series: [
      {
        name: 'CPU %',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: values,
        itemStyle: { color: '#6366f1' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(99, 102, 241, 0.35)' },
              { offset: 1, color: 'rgba(99, 102, 241, 0.0)' },
            ],
          },
        },
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
