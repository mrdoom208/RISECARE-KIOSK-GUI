"""Experimental hardware-backed adaptation of the bptest oscillometric demo.

Uses the RiseCare TM7711 wiring and pressure calibration. This is a research
prototype, not a validated blood-pressure monitor. Do not use its estimates
for diagnosis or treatment.
"""

import statistics
import time

import RPi.GPIO as GPIO


# Match the current hardware/bptest.py wiring and Raspberry Pi calibration.
OUT_PIN = 17
SCK_PIN = 27
PUMP = 22
VALVE = 4
RELAYS_ACTIVE_LOW = True

RAW_PER_MMHG = 14143.12
RAW_OFFSET = 59409.0

# Pressure and acquisition limits.
HARD_SAFETY_MAX = 250.0
INITIAL_TARGET = 170.0
TARGET_STEP = 20.0
ABS_FLOOR_PRESSURE = 40.0
READY_TIMEOUT = 2.0
CLOCK_HALF_PERIOD = 0.000002
EXTRA_CLOCK_PULSES = 1

# Pulse extraction. These are experimental signal thresholds.
BASELINE_ALPHA = 0.01
OSC_FILTER_ALPHA = 0.35
PEAK_DROP_THRESHOLD = 0.002
MIN_PULSE_AMPLITUDE = 0.008
MIN_BEAT_INTERVAL_MS = 200
MAX_BEAT_INTERVAL_MS = 2000


def relay_level(on):
    if RELAYS_ACTIVE_LOW:
        return GPIO.LOW if on else GPIO.HIGH
    return GPIO.HIGH if on else GPIO.LOW


def pump_set(on):
    GPIO.output(PUMP, relay_level(on))


def valve_set(closed):
    # In this wiring, closed=True retains cuff pressure; False vents it.
    GPIO.output(VALVE, relay_level(closed))


def raw_to_mmhg(raw):
    return (raw - RAW_OFFSET) / RAW_PER_MMHG


def now_ms():
    return int(time.monotonic() * 1000)


class TM7711:
    """Read signed 24-bit conversions using the existing bptest pinout."""

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


class PulseTracker:
    """Extract candidate cuff pulse peaks from the slow pressure trend."""

    def __init__(self, pressure):
        self.baseline = pressure
        self.filtered = 0.0
        self.previous = 0.0
        self.trough = 0.0
        self.peak = 0.0
        self.peak_pressure = pressure
        self.peak_time = 0
        self.tracking_peak = False
        self.last_beat_time = None

    def update(self, pressure, timestamp):
        self.baseline += BASELINE_ALPHA * (pressure - self.baseline)
        oscillation = pressure - self.baseline
        self.filtered += OSC_FILTER_ALPHA * (oscillation - self.filtered)
        current = self.filtered

        if not self.tracking_peak:
            if current < self.trough:
                self.trough = current
            if current > self.previous:
                self.peak = current
                self.peak_pressure = pressure
                self.peak_time = timestamp
                self.tracking_peak = True
        else:
            if current > self.peak:
                self.peak = current
                self.peak_pressure = pressure
                self.peak_time = timestamp

            if current < self.peak - PEAK_DROP_THRESHOLD:
                amplitude = self.peak - self.trough
                self.trough = current
                self.tracking_peak = False
                self.previous = current

                if amplitude < MIN_PULSE_AMPLITUDE:
                    return None

                if self.last_beat_time is not None:
                    interval = self.peak_time - self.last_beat_time
                    if not MIN_BEAT_INTERVAL_MS <= interval <= MAX_BEAT_INTERVAL_MS:
                        return None

                self.last_beat_time = self.peak_time
                return self.peak_pressure, amplitude

        self.previous = current
        return None


def interpolate_crossing(points, map_pressure, max_amp, target_ratio, systolic_side):
    """Interpolate a ratio crossing from beat-level (pressure, amplitude) data."""
    ordered = sorted(points, key=lambda item: item[0], reverse=True)
    for (p1, a1), (p2, a2) in zip(ordered, ordered[1:]):
        if systolic_side and min(p1, p2) < map_pressure:
            continue
        if not systolic_side and max(p1, p2) > map_pressure:
            continue

        r1, r2 = a1 / max_amp, a2 / max_amp
        if (r1 - target_ratio) * (r2 - target_ratio) > 0 or r1 == r2:
            continue
        fraction = (target_ratio - r1) / (r2 - r1)
        return p1 + fraction * (p2 - p1)
    return None


def run_bp_algorithm():
    adc = TM7711()
    pressure_log = []
    amplitude_log = []
    pump_on = False
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(OUT_PIN, GPIO.IN)
    GPIO.setup(SCK_PIN, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(PUMP, GPIO.OUT, initial=relay_level(False))
    GPIO.setup(VALVE, GPIO.OUT, initial=relay_level(False))

    try:
        pump_set(False)
        valve_set(False)  # Start vented.
        print("RiseCare pressure test (experimental; not for diagnosis)")
        print("Calibration: {:.2f} raw/mmHg, offset {:.1f}".format(
            RAW_PER_MMHG, RAW_OFFSET))

        raw = adc.read_raw()
        if raw is None or raw == -1:
            raise RuntimeError("TM7711 did not return a valid initial sample")
        pressure = raw_to_mmhg(raw)
        if not -5.0 <= pressure <= 250.0:
            raise RuntimeError("Initial pressure is outside expected range: {:.1f}".format(pressure))

        # Inflation: close the exhaust and adapt the target if pulses remain
        # strong near the target. The independent hard ceiling always wins.
        valve_set(True)
        pump_set(True)
        pump_on = True
        target = INITIAL_TARGET
        tracker = PulseTracker(pressure)
        print("Starting inflation toward {:.0f} mmHg...".format(target))

        while pressure < target:
            raw = adc.read_raw()
            if raw is None or raw == -1:
                raise RuntimeError("TM7711 read timeout/invalid sample during inflation")
            pressure = raw_to_mmhg(raw)
            if not 0.0 <= pressure <= HARD_SAFETY_MAX:
                raise RuntimeError("Pressure outside safety range: {:.1f} mmHg".format(pressure))

            beat = tracker.update(pressure, now_ms())
            if (beat is not None and pressure >= target - 10.0
                    and beat[1] > 0.30 and target < HARD_SAFETY_MAX):
                target = min(target + TARGET_STEP, HARD_SAFETY_MAX)
                print("Pulse remains detectable at {:.1f}; target raised to {:.0f} mmHg".format(
                    pressure, target))

        pump_set(False)
        pump_on = False
        print("Pump off at {:.1f} mmHg; beginning natural deflation.".format(pressure))
        time.sleep(0.3)

        # Reset trend extraction at the start of deflation.
        tracker = PulseTracker(pressure)
        max_amp = 0.0
        map_pressure = None
        low_tail_count = 0

        while pressure > ABS_FLOOR_PRESSURE:
            raw = adc.read_raw()
            if raw is None or raw == -1:
                raise RuntimeError("TM7711 read timeout/invalid sample during deflation")
            pressure = raw_to_mmhg(raw)
            if not -5.0 <= pressure <= HARD_SAFETY_MAX:
                raise RuntimeError("Pressure outside expected range: {:.1f} mmHg".format(pressure))

            beat = tracker.update(pressure, now_ms())
            if beat is not None:
                beat_pressure, amplitude = beat
                pressure_log.append(beat_pressure)
                amplitude_log.append(amplitude)
                if amplitude > max_amp:
                    max_amp = amplitude
                    map_pressure = beat_pressure

                ratio = amplitude / max_amp if max_amp else 0.0
                print("Beat: P={:.1f} mmHg, amp={:.3f}, envelope={}".format(
                    beat_pressure, amplitude, len(pressure_log)))

                if beat_pressure < 70.0 and max_amp > 0.0 and ratio < 0.40:
                    low_tail_count += 1
                else:
                    low_tail_count = 0
                if low_tail_count >= 2:
                    print("Low-amplitude tail detected; ending measurement.")
                    break

            time.sleep(0.005)

        valve_set(False)
        print("Cuff vented. Deflation ended at {:.1f} mmHg.".format(pressure))

        if not pressure_log or max_amp <= 0 or map_pressure is None:
            print("RESULT: INVALID (no usable pulse envelope)")
            return

        # Smooth isolated amplitude spikes for finding the maximum envelope.
        smoothed = [statistics.median(amplitude_log[max(0, i - 1):i + 2])
                    for i in range(len(amplitude_log))]
        max_index = max(range(len(smoothed)), key=smoothed.__getitem__)
        max_amp = smoothed[max_index]
        map_pressure = pressure_log[max_index]
        smoothed_points = list(zip(pressure_log, smoothed))

        systolic = interpolate_crossing(smoothed_points, map_pressure, max_amp, 0.60, True)
        diastolic = interpolate_crossing(smoothed_points, map_pressure, max_amp, 0.55, False)

        print("\nPRESSURE,AMPLITUDE")
        for p, amp in zip(pressure_log, amplitude_log):
            print("{:.1f},{:.3f}".format(p, amp))
        print("\n--- EXPERIMENTAL ESTIMATES ---")
        print("SYS: {}".format("{:.1f} mmHg".format(systolic) if systolic is not None else "unavailable"))
        print("DIA: {}".format("{:.1f} mmHg".format(diastolic) if diastolic is not None else "unavailable"))
        print("MAP: {:.1f} mmHg".format(map_pressure))
        if systolic is None or diastolic is None or not systolic > map_pressure > diastolic:
            print("RESULT: INVALID (envelope did not cross both sides of MAP)")
        else:
            print("RESULT: experimental estimate only; not medically validated")

    except KeyboardInterrupt:
        print("\nStopped by user")
    finally:
        pump_set(False)
        valve_set(False)  # Always vent the cuff on normal exit, error, or Ctrl-C.
        GPIO.output(SCK_PIN, GPIO.LOW)
        GPIO.cleanup()


if __name__ == "__main__":
    run_bp_algorithm()
