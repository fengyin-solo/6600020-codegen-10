"""Modbus service with mock data (replace with pymodbus for production)."""
import random
import math
from typing import List, Dict, Any, Optional

MOCK_DEVICES = [
    {"id": "dev1", "name": "温湿度传感器-A区", "ip": "192.168.1.101", "port": 502, "slave_id": 1, "online": True},
    {"id": "dev2", "name": "压力变送器-B区", "ip": "192.168.1.102", "port": 502, "slave_id": 2, "online": True},
    {"id": "dev3", "name": "电机控制器-C区", "ip": "192.168.1.103", "port": 502, "slave_id": 3, "online": False},
]

ANOMALY_WINDOW_SIZE = 10
ANOMALY_ZSCORE_THRESHOLD = 2.5
ANOMALY_CHANGE_RATE_THRESHOLD = 0.15

_history: Dict[str, List[float]] = {}


def get_device_status() -> List[Dict[str, Any]]:
    return MOCK_DEVICES


def read_registers(device_id: str, address: int, count: int) -> Dict[str, Any]:
    """Read registers via pymodbus (mock implementation)."""
    values = [round(random.uniform(0, 100), 2) for _ in range(count)]
    return {"device_id": device_id, "address": address, "values": values}


def record_value(key: str, value: float) -> None:
    if key not in _history:
        _history[key] = []
    _history[key].append(value)
    if len(_history[key]) > 100:
        _history[key] = _history[key][-100:]


def detect_anomalies(values: List[float], timestamps: List[float]) -> List[Dict[str, Any]]:
    """Detect anomaly fluctuations in a series of values."""
    anomalies: List[Dict[str, Any]] = []
    if len(values) < ANOMALY_WINDOW_SIZE + 1:
        return anomalies

    for i in range(ANOMALY_WINDOW_SIZE, len(values)):
        window = values[i - ANOMALY_WINDOW_SIZE:i]
        mean = sum(window) / len(window)
        variance = sum((v - mean) ** 2 for v in window) / len(window)
        std_dev = math.sqrt(variance)

        if std_dev == 0:
            continue

        z_score = abs(values[i] - mean) / std_dev
        old_val = values[i - 1]
        change_rate = abs(values[i] - old_val) / max(abs(old_val), 0.001)

        if z_score > ANOMALY_ZSCORE_THRESHOLD or change_rate > ANOMALY_CHANGE_RATE_THRESHOLD:
            anomalies.append({
                "index": i,
                "value": values[i],
                "value_before": round(old_val, 2),
                "value_after": round(values[i], 2),
                "direction": "spike" if values[i] > old_val else "drop",
                "change_rate": round(change_rate * 10000) / 100,
                "z_score": round(z_score, 2),
                "timestamp": timestamps[i] if i < len(timestamps) else None,
            })

    return anomalies
