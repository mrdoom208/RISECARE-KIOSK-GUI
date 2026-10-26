"""VL53L1X time-of-flight sensor: distance, height and calibration.

The module owns the whole sensor flow so both the kiosk (hardware/main.py)
and the standalone diagnostic (vl53l1x_test.py) use the same code:

    python3 vl53l1x.py                 stream raw distance readings
    python3 vl53l1x.py --height         stream calculated height
    python3 vl53l1x.py --calibrate      calibrate sensor-to-floor distance
"""

import argparse
import collections
import json
import os
import statistics
import threading
import time

try:
    import board
    import adafruit_vl53l1x
    _adafruit_available = True
except ImportError:
    board = None
    adafruit_vl53l1x = None
    _adafruit_available = False

# Sensor range limits (long range mode), in centimetres.
MIN_DISTANCE_CM = 2
MAX_DISTANCE_CM = 400

# Calibration measures the sensor-to-floor distance, so it needs nothing under
# the sensor while it runs.
CALIBRATION_SAMPLES = 11
MIN_CALIBRATION_READINGS = 7

# One height reading is built from a few samples, so a single noisy ranging
# result cannot move the published height.
HEIGHT_SAMPLES = 3
HEIGHT_SAMPLE_INTERVAL = 0.05
# How long a single sample may block while the sensor finishes ranging.
SAMPLE_TIMEOUT = 0.35

# A standing person has to be under the sensor. Anything below or above these
# limits is not a height: with nobody under the sensor the ToF beam reaches
# the floor and the calculated height collapses to zero.
MIN_HEIGHT_CM = 30.0
MAX_HEIGHT_CM = 250.0

# The published height is the median of the recent readings, so the kiosk sees
# a value that settles instead of a value that jitters.
HEIGHT_HISTORY = 5
# A jump this large means a different person (or a big move): the history is
# dropped instead of blending two measurements.
HEIGHT_JUMP_CM = 8.0

# Diagnostic modes, also used by the standalone test scripts.
MODE_DISTANCE = "distance"
MODE_HEIGHT = "height"
MODE_CALIBRATE = "calibrate"
DIAGNOSTIC_INTERVAL = 0.5

TOTAL_HEIGHT = None
sensor_available = False
bus = None
sensor = None
_bus_number = 1
hw_lock = threading.Lock()
# Only one thread may bring the sensor up: the reading loop and the
# availability probe can both reach for a missing sensor.
_init_lock = threading.RLock()
_height_history = collections.deque(maxlen=HEIGHT_HISTORY)

CALIBRATION_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "settings.json"
)


def set_bus_number(bus_num):
    """Select the default Pi I2C bus used by board.I2C (bus 1)."""
    global _bus_number
    if bus_num != 1:
        raise ValueError(
            "Adafruit board.I2C() uses Raspberry Pi I2C bus 1, "
            f"bus {bus_num} is not supported"
        )
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

    with _init_lock:
        if sensor is not None:
            return True
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


def measure_distance(timeout=SAMPLE_TIMEOUT):
    """Return one distance reading in cm, or None when the sensor has none."""
    if not _ensure_sensor() or sensor is None:
        return None
    if not hw_lock.acquire(blocking=False):
        return None
    try:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
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


def _collect_distances(samples, interval=HEIGHT_SAMPLE_INTERVAL):
    """Read a few distances and keep the ones the sensor could measure."""
    distances = []
    for _ in range(samples):
        distance = measure_distance()
        if _is_valid_distance(distance):
            distances.append(distance)
        time.sleep(interval)
    return distances


def is_calibrated():
    """True when a usable sensor-to-floor distance has been calibrated."""
    return TOTAL_HEIGHT is not None and _is_valid_distance(TOTAL_HEIGHT)


def _smooth_height(height):
    """Publish the median of the recent heights so the value settles."""
    if _height_history:
        previous = statistics.median(_height_history)
        if abs(height - previous) > HEIGHT_JUMP_CM:
            _height_history.clear()
    _height_history.append(height)
    return round(statistics.median(_height_history), 2)


def calibrate_height(progress_callback=None, stop_event=None):
    global TOTAL_HEIGHT
    message = "Calibrating height... Make sure nothing is under the sensor."
    print(message)
    if progress_callback:
        progress_callback(message)

    if stop_event and stop_event.wait(2):
        return None
    if not stop_event:
        time.sleep(2)
    readings = []

    for _ in range(CALIBRATION_SAMPLES):
        if stop_event and stop_event.is_set():
            return None
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
        if stop_event:
            if stop_event.wait(0.2):
                return None
        else:
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

    if stop_event and stop_event.is_set():
        return None

    TOTAL_HEIGHT = _median_readings(readings)
    _height_history.clear()

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}

    data["vl53l1x"] = {"total_height": TOTAL_HEIGHT}

    with open(CALIBRATION_FILE, "w") as f:
        json.dump(data, f)

    print(f"\nSaved height calibration: {TOTAL_HEIGHT:.2f} cm\n")

    # The kiosk keeps the last progress message and offers the "Done" button
    # of the height calibration once it sees this one, so it goes last.
    message = f"Height measured: {TOTAL_HEIGHT:.2f} cm"
    print(message)
    if progress_callback:
        progress_callback(message)

    return TOTAL_HEIGHT


def get_height():
    """Return the measured height in cm, or None when it cannot be measured.

    None means "no height right now": the sensor is not calibrated, the
    ranging failed, or nobody is standing under the sensor.
    """
    if not is_calibrated():
        return None
    if not _ensure_sensor():
        return None

    distances = _collect_distances(HEIGHT_SAMPLES)
    if not distances:
        return None

    distance = _average_readings(distances)
    height = TOTAL_HEIGHT - distance

    if height < MIN_HEIGHT_CM or height > MAX_HEIGHT_CM:
        # The beam reached the floor (nobody under the sensor) or the reading
        # is out of range: this is not a height.
        _height_history.clear()
        return None

    return _smooth_height(height)


def reset_calibration():
    global TOTAL_HEIGHT
    TOTAL_HEIGHT = None
    _height_history.clear()
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

    _height_history.clear()


def probe():
    """Return True if the VL53L1X sensor is reachable, False otherwise."""
    global sensor_available, sensor, bus
    try:
        _ensure_sensor()
        sensor_available = True
        return True
    except Exception:
        close()
        sensor_available = False
        return False


def close():
    global bus, sensor, sensor_available
    with _init_lock:
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
    _height_history.clear()


def run_diagnostic(mode=MODE_DISTANCE, interval=DIAGNOSTIC_INTERVAL, output=print):
    """Run the standalone diagnostic: stream distances or heights.

    Returns a process exit code: 0 when the run finished cleanly, 1 when the
    sensor could not be used.
    """
    try:
        if not setup():
            output("FAIL: VL53L1X sensor did not return a valid reading")
            return 1

        if mode == MODE_CALIBRATE:
            total_height = calibrate_height()
            return 0 if total_height is not None else 1

        if mode == MODE_HEIGHT:
            load_calibration()
            if TOTAL_HEIGHT is None:
                output("No valid calibration. Run with --calibrate first.")
                return 1
            output(
                f"Streaming height using {TOTAL_HEIGHT:.2f} cm calibration. "
                "Ctrl+C to stop."
            )
        else:
            output("Streaming raw sensor distance in cm. Ctrl+C to stop.")

        while True:
            if mode == MODE_HEIGHT:
                value = get_height()
                output(
                    f"Height: {value:.2f} cm" if value is not None else "Height: unavailable",
                    flush=True,
                )
            else:
                value = measure_distance()
                output(
                    f"Distance: {value:.2f} cm"
                    if value is not None
                    else "Distance: no reading",
                    flush=True,
                )
            time.sleep(interval)
    except KeyboardInterrupt:
        output("\nTest stopped")
        return 0
    except Exception as exc:
        output(f"VL53L1X test failed: {exc}")
        return 1
    finally:
        close()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Test the VL53L1X TOF height sensor")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--distance", action="store_true", help="stream raw distance (default)")
    mode.add_argument("--height", action="store_true", help="stream calculated height")
    mode.add_argument("--calibrate", action="store_true", help="calibrate sensor-to-floor distance")
    args = parser.parse_args(argv)

    if args.calibrate:
        selected = MODE_CALIBRATE
    elif args.height:
        selected = MODE_HEIGHT
    else:
        selected = MODE_DISTANCE

    return run_diagnostic(selected)


if __name__ == "__main__":
    raise SystemExit(main())
