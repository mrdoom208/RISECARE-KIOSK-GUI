import time
import json
import os

DT = 5
SCK = 6

try:
    import RPi.GPIO as GPIO
    from hx711 import HX711
    sensor_available = True
except ImportError:
    print("Warning: HX711 or GPIO libraries not available")
    sensor_available = False

if sensor_available:
    GPIO.setmode(GPIO.BCM)
    hx = HX711(dout_pin=DT, pd_sck_pin=SCK)
else:
    hx = None

CALIBRATION_FILE = "calibration.json"
calibration_factor = None
empty_offset = None


def _raw():
    data = hx.get_raw_data()
    if isinstance(data, list):
        return data[0]
    return data


def load_calibration():
    global calibration_factor, empty_offset
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
            loadcell_data = data.get("loadcell", {})
            calibration_factor = loadcell_data.get("calibration_factor")
            empty_offset = loadcell_data.get("empty_offset")
        if calibration_factor:
            print(f" Loaded LoadCell Calibration: factor={calibration_factor}, offset={empty_offset}")
        else:
            print(" No loadcell calibration found. Please calibrate.")
    else:
        print(" No calibration file found. Please calibrate.")


def calibrate_tare():
    global empty_offset

    if not sensor_available:
        print("Load cell sensor not available")
        return None

    print("Taring... Clear the scale.")
    hx.reset()
    time.sleep(1)
    empty_offset = _raw()
    print(f"Tare done. Empty reading: {empty_offset}")
    return empty_offset


def _stable_raw(samples=10):
    readings = []
    for i in range(samples):
        readings.append(_raw())
        time.sleep(0.2)
    readings.sort()
    trimmed = readings[2:-2]
    return sum(trimmed) / len(trimmed)


def calibrate_finalize(known_weight_grams=1000):
    global calibration_factor, empty_offset

    if not sensor_available or empty_offset is None:
        print("Calibration not started or sensor unavailable")
        return None

    known_weight_kg = known_weight_grams / 1000

    print("Taking 10 readings...")
    stable = _stable_raw(10)
    print(f"Stable value (avg of middle 6): {stable:.0f}")

    difference = stable - empty_offset
    if difference <= 0:
        print("Calibration failed: loaded reading must be higher than empty reading")
        return None

    calibration_factor = difference / known_weight_kg

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}

    data["loadcell"] = {
        "calibration_factor": calibration_factor,
        "empty_offset": empty_offset
    }

    with open(CALIBRATION_FILE, "w") as f:
        json.dump(data, f)

    print(f"Saved weight calibration: factor={calibration_factor:.2f}, offset={empty_offset}")
    return calibration_factor


def reset_calibration():
    global calibration_factor, empty_offset
    calibration_factor = None
    empty_offset = None
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
        data.pop("loadcell", None)
        with open(CALIBRATION_FILE, "w") as f:
            json.dump(data, f)
        print("LoadCell calibration reset")


def get_weight():
    if calibration_factor is None or empty_offset is None or not sensor_available:
        return None

    raw = _raw()
    weight = (raw - empty_offset) / calibration_factor
    return round(weight, 2)


def get_stable_weight():
    if calibration_factor is None or empty_offset is None or not sensor_available:
        return None

    print("Taking 10 readings for stable weight...")
    raw = _stable_raw(10)
    weight = (raw - empty_offset) / calibration_factor
    return round(weight, 2)


def setup():
    if not sensor_available:
        print(" LoadCell sensor not available")
        return

    print("Initializing LoadCell (HX711)...")
    hx.reset()
    load_calibration()
    print(" LoadCell initialized")
