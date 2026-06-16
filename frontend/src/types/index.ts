export interface ModbusRegister {
  address: number
  name: string
  type: 'coil' | 'discrete' | 'holding' | 'input'
  value: number | boolean
  unit: string
  updatedAt: number
}

export interface Device {
  id: string
  name: string
  ip: string
  port: number
  slaveId: number
  online: boolean
  registers: ModbusRegister[]
}

export interface Alarm {
  id: string
  deviceId: string
  register: string
  message: string
  level: 'info' | 'warning' | 'critical'
  timestamp: number
  acknowledged: boolean
}

export interface AnomalyFluctuation {
  id: string
  deviceId: string
  deviceName: string
  register: string
  direction: 'spike' | 'drop'
  changeRate: number
  valueBefore: number
  valueAfter: number
  unit: string
  timestamp: number
  acknowledged: boolean
}
