import RPi.GPIO as GPIO
import time
import json
import os

TRIG = 23
ECHO = 24
TIMEOUT = 0.5
MIN_DISTANCE_CM = 2
MAX_DISTANCE_CM = 400

TOTAL_HEIGHT = None


def setup():
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(TRIG, GPIO.OUT)
    GPIO.setup(ECHO, GPIO.IN)
    print("✓ Ultrasonic sensor initialized")


def measure_distance():
    GPIO.output(TRIG, False)
    time.sleep(0.01)

    GPIO.output(TRIG, True)
    time.sleep(0.00001)
    GPIO.output(TRIG, False)

    timeout_start = time.monotonic()
    pulse_start = time.monotonic()

    while GPIO.input(ECHO) == 0:
        pulse_start = time.monotonic()
        if time.monotonic() - timeout_start > TIMEOUT:
            return None

    while GPIO.input(ECHO) == 1:
        pulse_end = time.monotonic()
        if time.monotonic() - timeout_start > TIMEOUT:
            return None

    pulse_duration = pulse_end - pulse_start
    distance = pulse_duration * 17150
    return round(distance, 2)


def _is_valid_distance(distance):
    return distance is not None and MIN_DISTANCE_CM <= distance <= MAX_DISTANCE_CM


def _average_readings(readings):
    sorted_readings = sorted(readings)
    if len(sorted_readings) >= 3:
        sorted_readings = sorted_readings[1:-1]
    return sum(sorted_readings) / len(sorted_readings)


# ---------------------------
# 2. Calibration function
# ---------------------------
def calibrate_height(progress_callback=None):
    global TOTAL_HEIGHT
    message = "Calibrating height... Make sure nothing is under the sensor."
    print(message)
    if progress_callback:
        progress_callback(message)

    time.sleep(2)
    readings = []

    for _ in range(7):
        d = measure_distance()
        if _is_valid_distance(d):
            readings.append(d)
            message = f"Reading {len(readings)}/7: {d} cm"
            print(message)
            if progress_callback:
                progress_callback(message)
        else:
            message = f"Ignored invalid reading: {d} cm"
            print(message)
            if progress_callback:
                progress_callback(message)
        time.sleep(0.5)

    if len(readings) < 3:
        message = "Calibration failed: no valid readings"
        print(message)
        if progress_callback:
            progress_callback(message)
        return None

    TOTAL_HEIGHT = _average_readings(readings)

    # SAVE to file
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}

    data["ultrasonic"] = {"total_height": TOTAL_HEIGHT}

    with open(CALIBRATION_FILE, "w") as f:
        json.dump(data, f)

    message = f"Saved height calibration: {TOTAL_HEIGHT:.2f} cm"
    print(f"\n{message}\n")
    if progress_callback:
        progress_callback(message)


    return TOTAL_HEIGHT


# ---------------------------
# 3. Test function (raw)
# ---------------------------
def test_sensor():
    print("Testing sensor (distance only)... Press CTRL+C to stop")
    try:
        while True:
            d = measure_distance()
            print(f"Distance: {d} cm")
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("Test stopped")


# ---------------------------
# 4. Use function (height)
# ---------------------------
def get_height():
    if TOTAL_HEIGHT is None or not _is_valid_distance(TOTAL_HEIGHT):
        return None

    readings = []
    for _ in range(10):
        d = measure_distance()
        if _is_valid_distance(d):
            readings.append(d)
        time.sleep(0.2)

    if len(readings) < 4:
        print("Not enough valid readings for height")
        return None

    readings.sort()
    trimmed = readings[2:-2]
    avg_distance = sum(trimmed) / len(trimmed)
    height = TOTAL_HEIGHT - avg_distance

    if height < 0:
        print(f"Ignored invalid height: calibrated={TOTAL_HEIGHT:.2f} cm, measured={avg_distance:.2f} cm")
        return None

    return round(height, 2)


CALIBRATION_FILE = "calibration.json"


def reset_calibration():
    global TOTAL_HEIGHT
    TOTAL_HEIGHT = None
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
        data.pop("ultrasonic", None)
        with open(CALIBRATION_FILE, "w") as f:
            json.dump(data, f)
        print("Ultrasonic calibration reset")


def load_calibration():
    global TOTAL_HEIGHT

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
            TOTAL_HEIGHT = data.get("ultrasonic", {}).get("total_height")

        if _is_valid_distance(TOTAL_HEIGHT):
            print(f"📂 Loaded Ultrasonic Calibration: {TOTAL_HEIGHT:.2f} cm")
        else:
            TOTAL_HEIGHT = None
            print("⚠️ No ultrasonic calibration found. Please calibrate.")
    else:
        print("⚠️ No calibration file found. Please calibrate.")
