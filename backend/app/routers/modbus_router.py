from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from app.services.modbus_service import read_registers, get_device_status, detect_anomalies

router = APIRouter()


class AnomalyRequest(BaseModel):
    values: List[float]
    timestamps: List[float] = []


@router.get("/modbus/devices")
def list_devices():
    return get_device_status()


@router.get("/modbus/read/{device_id}/{address}/{count}")
def read_holding(device_id: str, address: int, count: int = 1):
    """Read holding registers from a Modbus device."""
    return read_registers(device_id, address, count)


@router.post("/modbus/write/{device_id}/{address}")
def write_register(device_id: str, address: int, value: int):
    return {"device_id": device_id, "address": address, "value": value, "status": "written"}


@router.post("/modbus/anomaly-detect")
def anomaly_detect(req: AnomalyRequest):
    """Detect anomaly fluctuations in a series of measurement values."""
    anomalies = detect_anomalies(req.values, req.timestamps)
    affected_registers = set()
    for a in anomalies:
        affected_registers.add(a.get("index", -1))
    return {
        "anomalies": anomalies,
        "total_count": len(anomalies),
        "spike_count": sum(1 for a in anomalies if a["direction"] == "spike"),
        "drop_count": sum(1 for a in anomalies if a["direction"] == "drop"),
    }
