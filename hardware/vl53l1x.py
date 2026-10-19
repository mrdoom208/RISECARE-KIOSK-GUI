import time
import json
import os
import threading

try:
    import board
    import adafruit_vl53l1x
    _adafruit_available = True
except ImportError:
    board = None
    adafruit_vl53l1x = None
    _adafruit_available = False

MIN_DISTANCE_CM = 2
MAX_DISTANCE_CM = 400
CALIBRATION_SAMPLES = 11
MIN_CALIBRATION_READINGS = 7

TOTAL_HEIGHT = None
sensor_available = False
bus = None
sensor = None
_bus_number = 1
hw_lock = threading.Lock()

CALIBRATION_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "calibration.json"
)


def set_bus_number(bus_num):
    """Select the default Pi I2C bus used by board.I2C (bus 1)."""
    global _bus_number
    if bus_num != 1:
        raise ValueError("Adafruit board.I2C() uses Raspberry Pi I2C bus 1")
    _bus_number = bus_num
    close()


def _ensure_sensor():
    global bus, sensor
    if sensor is not None:
        return True
    if not _adafruit_available:
        raise RuntimeError(
            "Adafruit VL53L1X dependencies missing; install the libraries used by sad.py"
        )

    try:
        bus = board.I2C()
        sensor = adafruit_vl53l1x.VL53L1X(bus)
        sensor.distance_mode = 2
        sensor.timing_budget = 100
        sensor.start_ranging()
        print("VL53L1X initialized with Adafruit driver on I2C bus 1")
        return True
    except Exception:
        close()
        raise


def setup():
    global sensor_available
    try:
        sensor_available = _ensure_sensor()
    except Exception as exc:
        sensor_available = False
        raise RuntimeError(f"VL53L1X initialization failed: {exc}") from exc
    return sensor_available


def measure_distance():
    if not _ensure_sensor() or sensor is None:
        return None
    if not hw_lock.acquire(blocking=False):
        return None
    try:
        for _ in range(100):
            if sensor.data_ready:
                distance_cm = sensor.distance  # Adafruit driver returns centimeters.
                sensor.clear_interrupt()
                return round(distance_cm, 2) if distance_cm is not None else None
            time.sleep(0.01)
        return None
    finally:
        hw_lock.release()


def _is_valid_distance(distance):
    return distance is not None and MIN_DISTANCE_CM <= distance <= MAX_DISTANCE_CM


def _average_readings(readings):
    sorted_readings = sorted(readings)
    if len(sorted_readings) >= 3:
        sorted_readings = sorted_readings[1:-1]
    return sum(sorted_readings) / len(sorted_readings)


def _median_readings(readings):
    sorted_readings = sorted(readings)
    middle = len(sorted_readings) // 2
    if len(sorted_readings) % 2:
        return sorted_readings[middle]
    return (sorted_readings[middle - 1] + sorted_readings[middle]) / 2


def calibrate_height(progress_callback=None):
    global TOTAL_HEIGHT
    message = "Calibrating height... Make sure nothing is under the sensor."
    print(message)
    if progress_callback:
        progress_callback(message)

    time.sleep(2)
    readings = []

    for _ in range(CALIBRATION_SAMPLES):
        d = measure_distance()
        if _is_valid_distance(d):
            readings.append(d)
            message = f"Reading {len(readings)}/{CALIBRATION_SAMPLES}: {d} cm"
            print(message)
            if progress_callback:
                progress_callback(message)
        else:
            message = f"Ignored invalid reading: {d} cm"
            print(message)
            if progress_callback:
                progress_callback(message)
        time.sleep(0.2)

    if len(readings) < MIN_CALIBRATION_READINGS:
        message = (
            f"Calibration failed: only {len(readings)} valid readings; "
            f"at least {MIN_CALIBRATION_READINGS} are required"
        )
        print(message)
        if progress_callback:
            progress_callback(message)
        return None

    TOTAL_HEIGHT = _median_readings(readings)

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}

    data["vl53l1x"] = {"total_height": TOTAL_HEIGHT}

    with open(CALIBRATION_FILE, "w") as f:
        json.dump(data, f)

    message = f"Saved height calibration: {TOTAL_HEIGHT:.2f} cm"
    print(f"\n{message}\n")
    if progress_callback:
        progress_callback(message)

    return TOTAL_HEIGHT


def get_height():
    if TOTAL_HEIGHT is None or not _is_valid_distance(TOTAL_HEIGHT):
        return None

    readings = []
    for _ in range(3):
        d = measure_distance()
        if _is_valid_distance(d):
            readings.append(d)
        time.sleep(0.05)

    if not readings:
        return None

    avg_distance = _average_readings(readings)
    height = TOTAL_HEIGHT - avg_distance

    if height < 0:
        print(f"Ignored invalid height: calibrated={TOTAL_HEIGHT:.2f} cm, measured={avg_distance:.2f} cm")
        return None

    return round(height, 2)


def reset_calibration():
    global TOTAL_HEIGHT
    TOTAL_HEIGHT = None
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
        data.pop("vl53l1x", None)
        with open(CALIBRATION_FILE, "w") as f:
            json.dump(data, f)
        print("VL53L1X calibration reset")


def load_calibration():
    global TOTAL_HEIGHT

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
            TOTAL_HEIGHT = data.get("vl53l1x", {}).get("total_height")

        if _is_valid_distance(TOTAL_HEIGHT):
            print(f"📂 Loaded VL53L1X Calibration: {TOTAL_HEIGHT:.2f} cm")
        else:
            TOTAL_HEIGHT = None
            print("⚠️ No VL53L1X calibration found. Please calibrate.")
    else:
        print("⚠️ No calibration file found. Please calibrate.")


def close():
    global bus, sensor, sensor_available
    if sensor is not None:
        try:
            sensor.stop_ranging()
        except Exception:
            pass
    if bus is not None:
        try:
            bus.deinit()
        except Exception:
            pass
    sensor = None
    bus = None
    sensor_available = False
