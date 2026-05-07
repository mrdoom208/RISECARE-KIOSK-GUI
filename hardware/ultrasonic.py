import RPi.GPIO as GPIO
import time
import json
import os

TRIG = 23
ECHO = 24
TIMEOUT = 0.5

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


# ---------------------------
# 2. Calibration function
# ---------------------------
def calibrate_height():
    global TOTAL_HEIGHT
    print("Calibrating... Make sure nothing is under the sensor.")

    time.sleep(2)
    readings = []

    for _ in range(5):
        d = measure_distance()
        if d is not None:
            readings.append(d)
            print(f"Reading: {d} cm")
        time.sleep(0.5)

    if not readings:
        print("❌ Calibration failed: no valid readings")
        return

    TOTAL_HEIGHT = sum(readings) / len(readings)

    # SAVE to file
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}

    data["ultrasonic"] = {"total_height": TOTAL_HEIGHT}

    with open(CALIBRATION_FILE, "w") as f:
        json.dump(data, f)

    print(f"\n✅ Saved Ultrasonic Calibration: {TOTAL_HEIGHT:.2f} cm\n")


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
    if TOTAL_HEIGHT is None:
        return None

    readings = []
    for _ in range(3):
        d = measure_distance()
        if d is not None:
            readings.append(d)
        time.sleep(0.05)

    if not readings:
        return None

    avg_distance = sum(readings) / len(readings)
    height = TOTAL_HEIGHT - avg_distance

    return round(height, 2)


CALIBRATION_FILE = "calibration.json"


def load_calibration():
    global TOTAL_HEIGHT

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
            TOTAL_HEIGHT = data.get("ultrasonic", {}).get("total_height")

        if TOTAL_HEIGHT:
            print(f"📂 Loaded Ultrasonic Calibration: {TOTAL_HEIGHT:.2f} cm")
        else:
            print("⚠️ No ultrasonic calibration found. Please calibrate.")
    else:
        print("⚠️ No calibration file found. Please calibrate.")