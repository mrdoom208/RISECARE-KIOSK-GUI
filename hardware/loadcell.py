import time
import json
import os

# HX711 DT and SCK pins
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
    hx = HX711(DT, SCK)
else:
    hx = None

CALIBRATION_FILE = "calibration.json"
calibration_factor = None
calibration_offset = None


def load_calibration():
    global calibration_factor, calibration_offset
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
            loadcell_data = data.get("loadcell", {})
            calibration_factor = loadcell_data.get("calibration_factor")
            calibration_offset = loadcell_data.get("calibration_offset")
        if calibration_factor:
            print(f"📂 Loaded LoadCell Calibration: factor={calibration_factor}, offset={calibration_offset}")
        else:
            print("⚠️ No loadcell calibration found. Please calibrate.")
    else:
        print("⚠️ No calibration file found. Please calibrate.")


def calibrate_loadcell(known_weight_grams=1000):
    global calibration_factor, calibration_offset
    print("Calibrating loadcell...")
    print(f"Place a {known_weight_grams}g weight on the sensor...")

    if not sensor_available:
        print("❌ Sensor not available")
        return None

    time.sleep(2)

    readings = []
    for _ in range(10):
        val = hx.get_weight_mean(5)
        readings.append(val)
        print(f"Reading: {val}")
        time.sleep(0.5)

    raw_value = sum(readings) / len(readings)
    calibration_factor = raw_value / known_weight_grams
    calibration_offset = 0

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}

    data["loadcell"] = {
        "calibration_factor": calibration_factor,
        "calibration_offset": calibration_offset
    }

    with open(CALIBRATION_FILE, "w") as f:
        json.dump(data, f)

    print(f"✅ Saved LoadCell Calibration: factor={calibration_factor}")
    return calibration_factor


def get_weight():
    if calibration_factor is None or not sensor_available:
        return None

    raw = hx.get_weight_mean(3)
    weight = raw / calibration_factor
    return round(weight, 2)


def tare():
    if sensor_available:
        zero_value= hx.get_weight_mean(5)
        print("Tare complete")

def setup():
    """Initialize the load cell sensor."""
    if not sensor_available:
        print("❌ LoadCell sensor not available")
        return

    print("Initializing LoadCell (HX711)...")
    # Reset the sensor
    hx.reset()
    # Load calibration if available
    load_calibration()
    # Tare the scale
    print("✓ LoadCell initialized")