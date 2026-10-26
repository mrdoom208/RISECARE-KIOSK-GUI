import time
import json
import os
import threading
import statistics

DT = 5
SCK = 6

# One HX711 transaction at a time: the background availability probe and the
# main reading loop share the DATA/CLOCK pins. Measurement paths take this
# without blocking and skip a sample if the bus is busy, so the reading loop
# never stalls.
hw_lock = threading.Lock()


class SensorBusy(RuntimeError):
    """The HX711 pins were being probed; retry the read later."""


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

# Thread from a reset that outlived its timeout, if any.
_hung_reset = None

CALIBRATION_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "settings.json"
)
# HX711 raw counts per kilogram. Weight calibration only needs to capture the
# empty platform offset; the scale's per-kg factor is fixed for this hardware.
CALIBRATION_FACTOR_PER_KG = 27100
calibration_factor = None
empty_offset = None


def _raw():
    if not hw_lock.acquire(blocking=False):
        raise SensorBusy("HX711 is busy being probed")
    try:
        data = hx.get_raw_data()
    finally:
        hw_lock.release()
    if isinstance(data, list):
        return data[0]
    return data


def probe():
    """Return True when the HX711 answers a reset within the timeout."""
    global sensor_available, _hung_reset

    if _hung_reset is not None and _hung_reset.is_alive():
        # An earlier reset never returned and its thread may still be clocking
        # the pins, so don't start a second one on top of it.
        sensor_available = False
        return False

    if hx is None:
        sensor_available = False
        return False

    result = [None]

    def _reset():
        try:
            result[0] = hx.reset()
        except Exception as e:
            result[0] = e

    hw_lock.acquire()
    try:
        t = threading.Thread(target=_reset, daemon=True)
        t.start()
        t.join(timeout=3.0)
        hung = t.is_alive()
    finally:
        hw_lock.release()

    _hung_reset = t if hung else None
    if hung:
        print("⚠️ LoadCell (HX711) not responding — sensor may not be connected")
        sensor_available = False
        return False
    if isinstance(result[0], Exception):
        print(f"⚠️ LoadCell (HX711) reset failed: {result[0]}")
        sensor_available = False
        return False
    sensor_available = True
    return True


def load_calibration():
    global calibration_factor, empty_offset
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
            loadcell_data = data.get("loadcell", {})
            calibration_factor = loadcell_data.get("calibration_factor")
            empty_offset = loadcell_data.get("empty_offset")
        if calibration_factor:
            calibration_factor = CALIBRATION_FACTOR_PER_KG
            print(f" Loaded LoadCell Calibration: factor={calibration_factor}, offset={empty_offset}")
        else:
            print(" No loadcell calibration found. Please calibrate.")
    else:
        print(" No calibration file found. Please calibrate.")


def calibrate_tare(stop_event=None):
    global empty_offset

    if not sensor_available:
        print("Load cell sensor not available")
        return None

    print("Taring... Clear the scale.")
    hw_lock.acquire()
    try:
        hx.reset()
    finally:
        hw_lock.release()
    if stop_event:
        if stop_event.wait(1):
            print("Tare cancelled")
            return None
    else:
        time.sleep(1)
    if stop_event and stop_event.is_set():
        print("Tare cancelled")
        return None
    try:
        empty_offset = _raw()
    except SensorBusy:
        print("Tare aborted: HX711 busy")
        return None
    print(f"Tare done. Empty reading: {empty_offset}")
    return empty_offset


def _stable_raw(samples=10):
    readings = []
    attempts = 0
    while len(readings) < samples and attempts < samples * 3:
        attempts += 1
        try:
            readings.append(_raw())
        except SensorBusy:
            pass
        time.sleep(0.2)
    if len(readings) < samples:
        print(f"LoadCell read aborted: only {len(readings)}/{samples} clean samples")
        return None

    # Reject isolated HX711 spikes using the median absolute deviation.
    # Unlike trimming a fixed number of high/low values, this keeps valid
    # samples when readings are stable and drops only values far from the pack.
    center = statistics.median(readings)
    deviations = [abs(value - center) for value in readings]
    mad = statistics.median(deviations)
    threshold = max(3.5 * 1.4826 * mad, 1.0)
    clean = [value for value in readings if abs(value - center) <= threshold]
    rejected = len(readings) - len(clean)

    if rejected:
        print(f"Discarded {rejected} noisy load cell reading(s)")
    if len(clean) < max(6, samples - 4):
        print(f"LoadCell read aborted: only {len(clean)}/{samples} stable samples")
        return None

    return sum(clean) / len(clean)


def calibrate_finalize():
    global calibration_factor, empty_offset

    if not sensor_available or empty_offset is None:
        print("Calibration not started or sensor unavailable")
        return None

    calibration_factor = CALIBRATION_FACTOR_PER_KG

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

    print(f"Saved weight calibration: factor={calibration_factor}, offset={empty_offset}")
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

    try:
        raw = _raw()
    except SensorBusy:
        return None
    weight = (raw - empty_offset) / calibration_factor
    return round(weight, 2)


def get_stable_weight():
    if calibration_factor is None or empty_offset is None or not sensor_available:
        return None

    print("Taking 10 readings for stable weight...")
    try:
        raw = _stable_raw(10)
    except SensorBusy:
        return None
    if raw is None:
        return None
    weight = (raw - empty_offset) / calibration_factor
    return round(weight, 2)


def setup():
    global sensor_available
    if not sensor_available:
        print(" LoadCell sensor not available")
        return False

    print("Initializing LoadCell (HX711)...")
    if not probe():
        return False
    try:
        load_calibration()
    except Exception as e:
        print(f"⚠️ LoadCell calibration load failed: {e}")
    print(" LoadCell initialized")
    return True
