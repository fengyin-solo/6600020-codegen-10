<template>
  <v-chart v-if="chartOption" :option="chartOption" class="h-56" autoresize />
  <div v-else class="h-56 flex items-center justify-center text-gray-600 text-sm">开始采集后显示趋势</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkPointComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useModbusStore } from '../store/modbus'
import type { EChartsOption } from 'echarts'

use([CanvasRenderer, LineChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, MarkPointComponent])

const store = useModbusStore()

const chartOption = computed<EChartsOption | null>(() => {
  const dev = store.selectedDevice
  if (!dev) return null
  const colors = ['#f97316', '#22d3ee', '#a78bfa', '#34d399']
  const series: any[] = []
  dev.registers.forEach((reg, i) => {
    const key = `${dev.id}_${reg.address}`
    const hd = store.historyData[key]
    if (!hd || !hd.values.length) return
    const data = hd.time.map((t, j) => [t, hd.values[j]])
    const points = store.anomalyPoints[key] || []
    const spikeData = points.filter(p => p.direction === 'spike').map(p => [p.time, p.value])
    const dropData = points.filter(p => p.direction === 'drop').map(p => [p.time, p.value])

    series.push({
      name: reg.name,
      type: 'line',
      showSymbol: false,
      smooth: true,
      lineStyle: { color: colors[i % colors.length], width: 2 },
      data
    })

    if (spikeData.length) {
      series.push({
        name: `${reg.name} 突增`,
        type: 'scatter',
        symbol: 'triangle',
        symbolSize: 14,
        itemStyle: { color: '#ef4444', borderColor: '#fca5a5', borderWidth: 2 },
        z: 10,
        data: spikeData
      })
    }
    if (dropData.length) {
      series.push({
        name: `${reg.name} 突降`,
        type: 'scatter',
        symbol: 'path://M0,0L7,0L3.5,10Z',
        symbolSize: 14,
        itemStyle: { color: '#3b82f6', borderColor: '#93c5fd', borderWidth: 2 },
        z: 10,
        data: dropData
      })
    }
  })
  if (!series.length) return null
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!Array.isArray(params)) return ''
        const time = new Date(params[0].value[0]).toLocaleTimeString()
        let html = `<div style="font-size:12px;color:#999">${time}</div>`
        for (const p of params) {
          if (p.seriesType === 'scatter') {
            const color = p.seriesName.includes('突增') ? '#ef4444' : '#3b82f6'
            html += `<div style="color:${color};font-weight:bold">${p.seriesName}: ${p.value[1]}</div>`
          } else {
            html += `<div>${p.marker}${p.seriesName}: ${p.value[1]}</div>`
          }
        }
        return html
      }
    },
    legend: { textStyle: { color: '#999' }, top: 0 },
    grid: { left: 50, right: 20, top: 30, bottom: 25 },
    xAxis: { type: 'value', axisLabel: { color: '#666', formatter: (v: number) => new Date(v).toLocaleTimeString() }, splitLine: { lineStyle: { color: '#1f2937' } } },
    yAxis: { type: 'value', axisLabel: { color: '#666' }, splitLine: { lineStyle: { color: '#1f2937' } } },
    series
  }
})
</script>
