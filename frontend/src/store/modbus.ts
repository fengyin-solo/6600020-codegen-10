import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Device, Alarm, AnomalyFluctuation, ModbusRegister } from '../types'

const ANOMALY_WINDOW_SIZE = 10
const ANOMALY_ZSCORE_THRESHOLD = 2.5
const ANOMALY_CHANGE_RATE_THRESHOLD = 0.15

export const useModbusStore = defineStore('modbus', () => {
  const devices = ref<Device[]>([])
  const alarms = ref<Alarm[]>([])
  const anomalyFluctuations = ref<AnomalyFluctuation[]>([])
  const anomalyPoints = ref<Record<string, { time: number; value: number; direction: 'spike' | 'drop' }[]>>({})
  const historyData = ref<Record<string, { time: number[]; values: number[] }>>({})
  const isPolling = ref(false)
  const pollInterval = ref(1000)
  const selectedDevice = ref<Device | null>(null)

  const criticalAlarms = computed(() => alarms.value.filter(a => a.level === 'critical' && !a.acknowledged))
  const onlineDevices = computed(() => devices.value.filter(d => d.online))
  const unacknowledgedAnomalies = computed(() => anomalyFluctuations.value.filter(a => !a.acknowledged))
  const affectedDevices = computed(() => {
    const deviceIds = new Set(unacknowledgedAnomalies.value.map(a => a.deviceId))
    return devices.value.filter(d => deviceIds.has(d.id))
  })

  function initMockDevices() {
    devices.value = [
      {
        id: 'dev1', name: '温湿度传感器-A区', ip: '192.168.1.101', port: 502, slaveId: 1, online: true,
        registers: [
          { address: 0, name: '温度', type: 'holding', value: 25.6, unit: '°C', updatedAt: Date.now() },
          { address: 1, name: '湿度', type: 'holding', value: 62.3, unit: '%RH', updatedAt: Date.now() },
          { address: 2, name: '露点', type: 'holding', value: 17.8, unit: '°C', updatedAt: Date.now() },
        ]
      },
      {
        id: 'dev2', name: '压力变送器-B区', ip: '192.168.1.102', port: 502, slaveId: 2, online: true,
        registers: [
          { address: 0, name: '管道压力', type: 'holding', value: 3.45, unit: 'MPa', updatedAt: Date.now() },
          { address: 1, name: '差压', type: 'holding', value: 0.12, unit: 'kPa', updatedAt: Date.now() },
        ]
      },
      {
        id: 'dev3', name: '电机控制器-C区', ip: '192.168.1.103', port: 502, slaveId: 3, online: false,
        registers: [
          { address: 0, name: '转速', type: 'holding', value: 1480, unit: 'RPM', updatedAt: Date.now() },
          { address: 1, name: '电流', type: 'holding', value: 12.5, unit: 'A', updatedAt: Date.now() },
          { address: 2, name: '运行状态', type: 'coil', value: true, unit: '', updatedAt: Date.now() },
        ]
      },
      {
        id: 'dev4', name: '流量计-D区', ip: '192.168.1.104', port: 502, slaveId: 4, online: true,
        registers: [
          { address: 0, name: '瞬时流量', type: 'holding', value: 156.7, unit: 'L/min', updatedAt: Date.now() },
          { address: 1, name: '累计流量', type: 'holding', value: 98234, unit: 'L', updatedAt: Date.now() },
        ]
      },
    ]
    selectedDevice.value = devices.value[0]
  }

  function detectAnomaly(dev: Device, reg: ModbusRegister, oldValue: number, newValue: number) {
    const key = `${dev.id}_${reg.address}`
    const hd = historyData.value[key]
    if (!hd || hd.values.length < ANOMALY_WINDOW_SIZE) return

    const recentValues = hd.values.slice(-ANOMALY_WINDOW_SIZE)
    const mean = recentValues.reduce((s, v) => s + v, 0) / recentValues.length
    const stdDev = Math.sqrt(recentValues.reduce((s, v) => s + (v - mean) ** 2, 0) / recentValues.length)

    if (stdDev === 0) return

    const zScore = Math.abs(newValue - mean) / stdDev
    const changeRate = Math.abs(newValue - oldValue) / Math.max(Math.abs(oldValue), 0.001)

    if (zScore > ANOMALY_ZSCORE_THRESHOLD || changeRate > ANOMALY_CHANGE_RATE_THRESHOLD) {
      const direction: 'spike' | 'drop' = newValue > oldValue ? 'spike' : 'drop'
      const anomaly: AnomalyFluctuation = {
        id: `af_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        deviceId: dev.id,
        deviceName: dev.name,
        register: reg.name,
        direction,
        changeRate: Math.round(changeRate * 10000) / 100,
        valueBefore: Math.round(oldValue * 100) / 100,
        valueAfter: Math.round(newValue * 100) / 100,
        unit: reg.unit,
        timestamp: Date.now(),
        acknowledged: false
      }
      anomalyFluctuations.value.unshift(anomaly)
      if (anomalyFluctuations.value.length > 100) anomalyFluctuations.value = anomalyFluctuations.value.slice(0, 100)

      if (!anomalyPoints.value[key]) anomalyPoints.value[key] = []
      anomalyPoints.value[key].push({ time: Date.now(), value: newValue, direction })
      if (anomalyPoints.value[key].length > 50) anomalyPoints.value[key] = anomalyPoints.value[key].slice(-50)
    }
  }

  function simulatePoll() {
    for (const dev of devices.value) {
      if (!dev.online) continue
      for (const reg of dev.registers) {
        if (typeof reg.value === 'number') {
          const oldValue = reg.value
          const noise = (Math.random() - 0.5) * reg.value * 0.02
          reg.value = Math.round((reg.value + noise) * 100) / 100
          reg.updatedAt = Date.now()
          const key = `${dev.id}_${reg.address}`
          if (!historyData.value[key]) historyData.value[key] = { time: [], values: [] }
          historyData.value[key].time.push(Date.now())
          historyData.value[key].values.push(reg.value)
          if (historyData.value[key].time.length > 100) {
            historyData.value[key].time.shift()
            historyData.value[key].values.shift()
          }
          detectAnomaly(dev, reg, oldValue, reg.value)
          if (reg.name === '温度' && reg.value > 28) {
            alarms.value.unshift({
              id: `a_${Date.now()}`, deviceId: dev.id, register: reg.name,
              message: `${dev.name} ${reg.name}超限: ${reg.value}${reg.unit}`,
              level: reg.value > 30 ? 'critical' : 'warning',
              timestamp: Date.now(), acknowledged: false
            })
          }
        }
      }
    }
    if (alarms.value.length > 50) alarms.value = alarms.value.slice(0, 50)
  }

  function acknowledgeAlarm(id: string) {
    const a = alarms.value.find(a => a.id === id)
    if (a) a.acknowledged = true
  }

  function acknowledgeAnomaly(id: string) {
    const a = anomalyFluctuations.value.find(a => a.id === id)
    if (a) a.acknowledged = true
  }

  function toggleDevice(id: string) {
    const d = devices.value.find(d => d.id === id)
    if (d) d.online = !d.online
  }

  return {
    devices, alarms, anomalyFluctuations, anomalyPoints, historyData, isPolling, pollInterval, selectedDevice,
    criticalAlarms, onlineDevices, unacknowledgedAnomalies, affectedDevices,
    initMockDevices, simulatePoll, acknowledgeAlarm, acknowledgeAnomaly, toggleDevice
  }
})
