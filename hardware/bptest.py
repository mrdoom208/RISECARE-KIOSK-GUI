"""Experimental cuff pressure test using a TM7711 ADC.

The pressure conversion values below are the calibration retained from the
previous bptest.py. Check them against a reference gauge before use.
"""

from collections import deque
import statistics
import time

import RPi.GPIO as GPIO


# BCM pins
OUT_PIN = 17
SCK_PIN = 27
PUMP = 22
VALVE = 4

# Retained pressure calibration (raw ADC counts per mmHg, then zero offset).
RAW_PER_MMHG = 14143.12
RAW_OFFSET = 51409.0

# Pressure cycle
PUMP_OFF_PRESSURE = 170.0
MEASURE_END_PRESSURE = 60.0
SETTLE_SECONDS = 2.0

# TM7711 timing copied from hardware/tm7711.py.
READY_TIMEOUT = 1.0
CLOCK_HALF_PERIOD = 0.000002
EXTRA_CLOCK_PULSES = 1

# Filtering: reject isolated raw spikes, then lightly smooth pressure.
RAW_WINDOW = 3
PRESSURE_ALPHA = 0.35

# Relay modules commonly energize on LOW. Change only if your board is active-high.
RELAYS_ACTIVE_LOW = True


def relay_level(on):
    if RELAYS_ACTIVE_LOW:
        return GPIO.LOW if on else GPIO.HIGH
    return GPIO.HIGH if on else GPIO.LOW


def pump_set(on):
    GPIO.output(PUMP, relay_level(on))


def valve_set(closed):
    GPIO.output(VALVE, relay_level(closed))


def raw_to_mmhg(raw):
    return (raw - RAW_OFFSET) / RAW_PER_MMHG


class TM7711:
    """Read signed 24-bit conversions using the timing in tm7711.py."""

    def wait_ready(self):
        start = time.monotonic()
        while GPIO.input(OUT_PIN) == GPIO.HIGH:
            if time.monotonic() - start >= READY_TIMEOUT:
                return False
            time.sleep(0.0001)
        return True

    def read_raw(self):
        if not self.wait_ready():
            return None

        value = 0
        for _ in range(24):
            GPIO.output(SCK_PIN, GPIO.HIGH)
            time.sleep(CLOCK_HALF_PERIOD)
            value = (value << 1) | GPIO.input(OUT_PIN)
            GPIO.output(SCK_PIN, GPIO.LOW)
            time.sleep(CLOCK_HALF_PERIOD)

        for _ in range(EXTRA_CLOCK_PULSES):
            GPIO.output(SCK_PIN, GPIO.HIGH)
            time.sleep(CLOCK_HALF_PERIOD)
            GPIO.output(SCK_PIN, GPIO.LOW)
            time.sleep(CLOCK_HALF_PERIOD)

        if value & 0x800000:
            value -= 0x1000000
        return value


class PressureFilter:
    """Median spike rejection followed by a light exponential smoother."""

    def __init__(self):
        self.raw_samples = deque(maxlen=RAW_WINDOW)
        self.pressure = None

    def update(self, raw):
        self.raw_samples.append(raw)
        clean_raw = int(statistics.median(self.raw_samples))
        pressure = raw_to_mmhg(clean_raw)
        if self.pressure is None:
            self.pressure = pressure
        else:
            self.pressure += PRESSURE_ALPHA * (pressure - self.pressure)
        return self.pressure


class BloodPressureTest:
    def __init__(self):
        self.adc = TM7711()
        self.filter = PressureFilter()
        self.pump_running = False
        self.measuring = False
        self.settle_started = None

    def setup(self):
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(OUT_PIN, GPIO.IN)
        GPIO.setup(SCK_PIN, GPIO.OUT, initial=GPIO.LOW)
        GPIO.setup(PUMP, GPIO.OUT)
        GPIO.setup(VALVE, GPIO.OUT)
        self.safe_stop()

    def safe_stop(self):
        pump_set(False)
        valve_set(False)  # open the cuff to release pressure
        self.pump_running = False

    def run(self):
        self.setup()
        print("RiseCare pressure test (experimental; not for diagnosis)")
        print(f"Calibration: {RAW_PER_MMHG} raw/mmHg, offset {RAW_OFFSET}")
        try:
            # Close the exhaust valve, then inflate.
            valve_set(True)
            pump_set(True)
            self.pump_running = True
            while True:
                raw = self.adc.read_raw()
                if raw is None:
                    print("ERROR: TM7711 ready timeout")
                    break

                pressure = self.filter.update(raw)
                if pressure < -5 or pressure > 250:
                    print(f"ERROR: invalid pressure {pressure:.1f} mmHg")
                    break

                if self.pump_running and pressure >= PUMP_OFF_PRESSURE:
                    pump_set(False)
                    self.pump_running = False
                    self.settle_started = time.monotonic()
                    print("Pump off; allowing pressure to settle")

                if (not self.pump_running and not self.measuring and
                        time.monotonic() - self.settle_started >= SETTLE_SECONDS):
                    self.measuring = True
                    valve_set(False)  # controlled deflation
                    print("Measuring during deflation")

                phase = "INFLATING" if self.pump_running else (
                    "DEFLATING" if self.measuring else "SETTLING")
                print(f"Raw:{raw:9d}  Pressure:{pressure:6.1f} mmHg  {phase}",
                      flush=True)

                if self.measuring and pressure <= MEASURE_END_PRESSURE:
                    print("Measurement complete")
                    break

        except KeyboardInterrupt:
            print("\nStopped by user")
        finally:
            self.safe_stop()
            GPIO.output(SCK_PIN, GPIO.LOW)
            GPIO.cleanup()


if __name__ == "__main__":
    BloodPressureTest().run()
