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


def calibrate_tare(progress_callback=None):
    global empty_offset

    if not sensor_available:
        message = "Load cell sensor not available"
        print(message)
        if progress_callback:
            progress_callback(message)
        return False

    message = "Step 1: Clear the scale. Taring..."
    print(message)
    if progress_callback:
        progress_callback(message)
    hx.reset()
    time.sleep(1)
    raw_empty = _raw()
    empty_offset = raw_empty
    message = f"Tare done. Empty reading: {raw_empty}"
    print(message)
    if progress_callback:
        progress_callback(message)
    return True


def calibrate_finalize(known_weight_grams=1000, progress_callback=None):
    global calibration_factor, empty_offset

    if not sensor_available or empty_offset is None:
        message = "Calibration not started or sensor unavailable"
        print(message)
        if progress_callback:
            progress_callback(message)
        return None

    known_weight_kg = known_weight_grams / 1000

    display_weight = "1 kg" if known_weight_grams == 1000 else f"{known_weight_grams}g ({known_weight_kg}kg)"
    message = f"Finalizing calibration with {display_weight}..."
    print(message)
    if progress_callback:
        progress_callback(message)

    raw_loaded = _raw()
    message = f"Loaded raw reading: {raw_loaded}"
    print(message)
    if progress_callback:
        progress_callback(message)

    difference = raw_loaded - empty_offset
    if difference <= 0:
        message = "Calibration failed: loaded reading must be higher than empty reading"
        print(message)
        if progress_callback:
            progress_callback(message)
        return None

    new_factor = difference / known_weight_kg
    calibration_factor = new_factor

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

    message = f"Saved weight calibration: factor={calibration_factor:.2f}, offset={empty_offset}"
    print(f"\n{message}")
    if progress_callback:
        progress_callback(message)
    print(f"Formula: ({raw_loaded} - {empty_offset}) / {known_weight_kg}kg = {calibration_factor}")
    return calibration_factor


def get_weight():
    if calibration_factor is None or empty_offset is None or not sensor_available:
        return None

    raw = _raw()
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
