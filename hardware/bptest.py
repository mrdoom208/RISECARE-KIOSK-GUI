"""Experimental cuff pressure test using a TM7711 ADC.

The signal-processing pipeline mirrors the Arduino blood-pressure prototype:
cuff pressure is split into a slow baseline and a pulsatile oscillation, a
trough/peak detector builds an oscillometric envelope, heart rate comes from
confirmed peak intervals, and SYS/DIA are found where the envelope falls to
fixed ratios of its maximum amplitude.

The pressure conversion values below are the calibration retained from the
previous bptest.py. Check them against a reference gauge before use.

Usage:
    python bptest.py            run one inflate/deflate cycle
    python bptest.py --noise    capture raw ADC samples with actuators idle

Pump/valve relay test: python pump_valve_test.py
"""

from collections import deque
import math
import statistics
import sys
import time

import RPi.GPIO as GPIO


# BCM pins
OUT_PIN = 17
SCK_PIN = 27
PUMP = 22
VALVE = 4

# Retained pressure calibration (raw ADC counts per mmHg, then zero offset).
RAW_PER_MMHG = 14143.12
RAW_OFFSET = 59409.0

# Pressure cycle
PUMP_OFF_PRESSURE = 170.0
# Deflate well below MAP so the envelope has enough points on both sides.
MEASURE_END_PRESSURE = 40.0
SETTLE_SECONDS = 0.3

# Experimental oscillometric ratios (from the Arduino prototype).
# NOTE: Fixed ratios are approximations; calibrate against reference measurements.
# Commercial devices fit ratios per-cuff/arm; fixed ratios can err by 5-10+ mmHg.
SYS_RATIO = 0.55
DIA_RATIO = 0.75

# Thresholds: set ~3-5x measured ADC noise (run --noise first).
# Real cuff oscillations: 0.5-4 mmHg. Typical ADC noise at 40 Hz: ~0.03-0.05 mmHg.
MIN_PULSE_AMPLITUDE = 0.15      # was 0.005; noise floor ~0.0024 mmHg
MAX_AMP_CHANGE_RATIO = 6.0      # was 20; 6x allows normal envelope slope
MIN_PRESSURE_CHANGE = 0.2       # was 0.5; 0.2 keeps more envelope points
PRESSURE_SPIKE_LIMIT = 4.0      # mmHg; single-sample jump this large is implausible

# Beat detection timing.
MIN_BEAT_INTERVAL = 300
MAX_BEAT_INTERVAL = 2000

PEAK_DROP_THRESHOLD = 0.10      # was 0.002; must exceed noise to confirm peak

# Filtering.
BASELINE_ALPHA = 0.01
OSC_FILTER_ALPHA = 0.35

MAX_PEAKS = 80

# TM7711 timing copied from hardware/tm7711.py.
READY_TIMEOUT = 2.0
CLOCK_HALF_PERIOD = 0.000002
EXTRA_CLOCK_PULSES = 3

# Relay modules commonly energize on LOW. Change only if your board is active-high.
RELAYS_ACTIVE_LOW = True

# Debug capture runs with the pump off and cuff vented.
NOISE_DEBUG_SECONDS = 15.0
NOISE_WINDOW = 20


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


def now_ms():
    return int(time.monotonic() * 1000)


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


class PressureSpikeFilter:
    """Reject isolated pressure jumps without smoothing away pulse shape."""

    def __init__(self):
        self.recent = deque(maxlen=5)

    def reset(self, pressure):
        self.recent.clear()
        self.recent.append(pressure)

    def apply(self, pressure):
        if len(self.recent) >= 3:
            reference = statistics.median(self.recent)
            if abs(pressure - reference) > PRESSURE_SPIKE_LIMIT:
                # Let a sustained level change enter the reference gradually;
                # an isolated spike will roll out without moving the median.
                self.recent.append(pressure)
                return reference, True

        self.recent.append(pressure)
        return pressure, False


def debug_noise():
    """Capture raw ADC samples with the actuators safely idle."""
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(OUT_PIN, GPIO.IN)
    GPIO.setup(SCK_PIN, GPIO.OUT, initial=GPIO.LOW)
    GPIO.setup(PUMP, GPIO.OUT, initial=relay_level(False))
    GPIO.setup(VALVE, GPIO.OUT, initial=relay_level(False))
    pump_set(False)
    valve_set(False)  # keep the cuff vented during diagnostics

    adc = TM7711()
    recent = deque(maxlen=NOISE_WINDOW)
    valid = []
    invalid = 0
    previous_time = None
    start = time.monotonic()
    print("TM7711 noise capture: pump OFF, valve OPEN")
    print("time_s,interval_ms,raw,hex,pressure_mmhg,window_stddev,window_range")
    try:
        while time.monotonic() - start < NOISE_DEBUG_SECONDS:
            raw = adc.read_raw()
            now = time.monotonic()
            interval_ms = (now - previous_time) * 1000 if previous_time else 0.0
            previous_time = now

            if raw is None:
                invalid += 1
                print(f"{now - start:.3f},{interval_ms:.1f},TIMEOUT,,,,", flush=True)
                continue

            # 0xFFFFFF is the all-bits-high read; do not treat it as sensor noise.
            if raw == -1:
                invalid += 1
                print(f"{now - start:.3f},{interval_ms:.1f},-1,0xFFFFFF,INVALID,,",
                      flush=True)
                continue

            valid.append(raw)
            recent.append(raw)
            stddev = statistics.stdev(recent) if len(recent) > 1 else 0.0
            span = max(recent) - min(recent)
            pressure = raw_to_mmhg(raw)
            print(f"{now - start:.3f},{interval_ms:.1f},{raw},0x{raw & 0xFFFFFF:06X},"
                  f"{pressure:.3f},{stddev:.1f},{span}", flush=True)
    except KeyboardInterrupt:
        print("\nNoise capture stopped")
    finally:
        pump_set(False)
        valve_set(False)
        GPIO.output(SCK_PIN, GPIO.LOW)
        GPIO.cleanup()

    print(f"Samples: valid={len(valid)}, invalid/timeouts={invalid}")
    if len(valid) > 1:
        print(f"Raw summary: min={min(valid)}, max={max(valid)}, "
              f"range={max(valid) - min(valid)}, stdev={statistics.stdev(valid):.1f}")
    if invalid:
        print("Invalid readings occurred; those are ADC/interface errors, not noise.")


class OscillometricAnalyzer:
    """Port of the Arduino oscillometric envelope and BP estimation code."""

    def __init__(self):
        self.reset()
        self.baseline = 0.0

    def reset(self):
        self.baseline = 0.0

        self.oscillation = 0.0
        self.filtered_oscillation = 0.0
        self.previous_oscillation = 0.0
        self.pulse_amplitude = 0.0

        self.cycle_trough = 0.0
        self.cycle_peak = 0.0
        self.cycle_peak_pressure = 0.0
        self.cycle_peak_time = 0

        self.tracking_peak = False
        self.have_trough = False

        self.last_confirmed_peak_time = 0
        self.last_beat_interval = 0
        self.heart_rate_bpm = 0.0

        self.detected_beat_count = 0
        self.rejected_beat_intervals = 0

        self.peak_pressures = []
        self.peak_amplitudes = []

        self.max_amplitude = 0.0
        self.map_pressure = 0.0
        self.map_amplitude = 0.0

        self.SYS = 0.0
        self.DIA = 0.0
        self.MAP = 0.0

    @property
    def peak_count(self):
        return len(self.peak_pressures)

    def start_measurement(self, pressure):
        self.reset()
        self.baseline = pressure

    def process_pressure(self, p, now):
        # Estimate the changing cuff-pressure trend.
        self.baseline = (self.baseline * (1.0 - BASELINE_ALPHA)
                         + p * BASELINE_ALPHA)

        # Extract the pulsatile component.
        self.oscillation = p - self.baseline

        self.filtered_oscillation = (self.filtered_oscillation
                                     * (1.0 - OSC_FILTER_ALPHA)
                                     + self.oscillation * OSC_FILTER_ALPHA)

        current = self.filtered_oscillation

        # Initialize the first trough.
        if not self.have_trough:
            self.cycle_trough = current
            self.cycle_peak = current
            self.cycle_peak_pressure = p
            self.cycle_peak_time = now

            self.have_trough = True
            self.previous_oscillation = current
            return

        if not self.tracking_peak:
            # Find the lowest point before the next rise.
            if current < self.cycle_trough:
                self.cycle_trough = current

            # Begin tracking a candidate peak.
            if current > self.previous_oscillation:
                self.cycle_peak = current
                self.cycle_peak_pressure = p
                self.cycle_peak_time = now
                self.tracking_peak = True
        else:
            # Update the peak and its corresponding cuff pressure.
            if current > self.cycle_peak:
                self.cycle_peak = current
                self.cycle_peak_pressure = p
                self.cycle_peak_time = now

            # Confirm after the signal drops below the peak.
            if current < self.cycle_peak - PEAK_DROP_THRESHOLD:
                amplitude = self.cycle_peak - self.cycle_trough

                self.pulse_amplitude = amplitude

                self.confirm_beat(amplitude, self.cycle_peak_pressure,
                                  self.cycle_peak_time)

                # Start searching for the next cycle.
                self.cycle_trough = current
                self.cycle_peak = current
                self.cycle_peak_pressure = p
                self.cycle_peak_time = now

                self.tracking_peak = False

        self.previous_oscillation = current

    def pulse_is_valid(self, amplitude, cuff_pressure):
        if amplitude < MIN_PULSE_AMPLITUDE:
            return False

        if (cuff_pressure <= MEASURE_END_PRESSURE
                or cuff_pressure >= PUMP_OFF_PRESSURE + 10.0):
            return False

        # Reject extreme amplitude changes.
        if self.peak_count > 0:
            previous_amp = self.peak_amplitudes[-1]

            if previous_amp > 0.0:
                ratio = amplitude / previous_amp

                if (ratio > MAX_AMP_CHANGE_RATIO
                        or ratio < 1.0 / MAX_AMP_CHANGE_RATIO):
                    return False

        return True

    def save_oscillation(self, amplitude, cuff_pressure):
        if self.peak_count >= MAX_PEAKS:
            return

        if not self.pulse_is_valid(amplitude, cuff_pressure):
            return

        # Require pressure separation between records.
        if (self.peak_count > 0
                and abs(cuff_pressure - self.peak_pressures[-1])
                < MIN_PRESSURE_CHANGE):
            return

        self.peak_pressures.append(cuff_pressure)
        self.peak_amplitudes.append(amplitude)

        if amplitude > self.max_amplitude:
            self.max_amplitude = amplitude
            self.map_pressure = cuff_pressure
            self.map_amplitude = amplitude

    def confirm_beat(self, amplitude, cuff_pressure, peak_time):
        if amplitude < MIN_PULSE_AMPLITUDE:
            return

        # First peak establishes the timing reference.
        if self.last_confirmed_peak_time == 0:
            self.last_confirmed_peak_time = peak_time
            self.save_oscillation(amplitude, cuff_pressure)
            self.detected_beat_count += 1
            return

        interval = peak_time - self.last_confirmed_peak_time

        if interval < MIN_BEAT_INTERVAL:
            # Ignore extra peaks/noise without shifting the last real beat.
            self.rejected_beat_intervals += 1
            return

        if interval > MAX_BEAT_INTERVAL:
            # Re-anchor after a long gap so later beats can recover.
            self.last_confirmed_peak_time = peak_time
            self.rejected_beat_intervals += 1
            return

        self.last_confirmed_peak_time = peak_time
        # Only timing-validated beats belong in the oscillometric envelope.
        self.save_oscillation(amplitude, cuff_pressure)
        self.last_beat_interval = interval
        self.heart_rate_bpm = 60000.0 / interval
        self.detected_beat_count += 1

    @staticmethod
    def interpolate_pressure(p1, a1, p2, a2, target):
        if abs(a2 - a1) < 0.0001:
            return 0.0

        fraction = (target - a1) / (a2 - a1)

        if fraction < 0.0 or fraction > 1.0:
            return 0.0

        return p1 + fraction * (p2 - p1)

    def find_pressure_at_target(self, target, systolic_side):
        for i in range(self.peak_count - 1):
            p1 = self.peak_pressures[i]
            a1 = self.peak_amplitudes[i]

            p2 = self.peak_pressures[i + 1]
            a2 = self.peak_amplitudes[i + 1]

            # Systolic crossing must be above MAP.
            if systolic_side:
                if p1 < self.map_pressure or p2 < self.map_pressure:
                    continue
            else:
                # Diastolic crossing must be below MAP.
                if p1 > self.map_pressure or p2 > self.map_pressure:
                    continue

            crosses = ((a1 <= target <= a2) or (a2 <= target <= a1))

            if not crosses:
                continue

            result = self.interpolate_pressure(p1, a1, p2, a2, target)

            if result > 0.0:
                return result

        return 0.0

    def envelope_has_enough_points(self):
        above_map = sum(1 for p in self.peak_pressures if p > self.map_pressure)
        below_map = sum(1 for p in self.peak_pressures if p < self.map_pressure)

        print(f"POINTS ABOVE MAP: {above_map}")
        print(f"POINTS BELOW MAP: {below_map}")

        # Three distinct beats on either side provide a usable crossing span
        # while allowing for slower natural-leak pressure changes.
        return above_map >= 3 and below_map >= 3

    def print_envelope(self):
        print()
        print("PRESSURE,AMPLITUDE")
        for pressure, amplitude in zip(self.peak_pressures, self.peak_amplitudes):
            print(f"{pressure:.1f},{amplitude:.3f}")
        print("============================")

    def calculate_bp(self):
        self.SYS = 0.0
        self.DIA = 0.0
        self.MAP = 0.0

        print()
        print("========== OSCILLOMETRIC DATA ==========")
        print(f"ENVELOPE RECORDS: {self.peak_count}")
        print(f"DETECTED BEATS: {self.detected_beat_count}")
        print(f"REJECTED BEAT INTERVALS: {self.rejected_beat_intervals}")

        if self.heart_rate_bpm > 0.0:
            print(f"ESTIMATED HR: {self.heart_rate_bpm:.1f} BPM")
        else:
            print("ESTIMATED HR: UNAVAILABLE")

        print(f"MAX AMP: {self.max_amplitude:.3f}")

        if self.peak_count < 5 or self.max_amplitude <= 0.0:
            print("RESULT: INVALID")
            print("REASON: INSUFFICIENT ENVELOPE DATA")
            self.print_envelope()
            return

        # A pulse's pressure coordinate can jitter slightly with cuff motion
        # and the pulse itself. Crossing search expects a monotonic deflation
        # envelope, so order records by pressure before examining neighbors.
        ordered_points = sorted(
            zip(self.peak_pressures, self.peak_amplitudes),
            key=lambda point: point[0],
            reverse=True,
        )
        self.peak_pressures = [pressure for pressure, _ in ordered_points]
        raw_amplitudes = [amplitude for _, amplitude in ordered_points]
        # A single oversized beat should not define MAP or shift both crossings.
        self.peak_amplitudes = [
            statistics.median(raw_amplitudes[max(0, i - 2):i + 3])
            for i in range(len(raw_amplitudes))
        ]
        map_index = max(range(len(self.peak_amplitudes)),
                        key=self.peak_amplitudes.__getitem__)
        self.max_amplitude = self.peak_amplitudes[map_index]
        self.map_pressure = self.peak_pressures[map_index]
        self.map_amplitude = self.max_amplitude

        self.MAP = self.map_pressure
        print(f"MAP PRESSURE: {self.MAP:.1f}")

        if not self.envelope_has_enough_points():
            print("RESULT: INVALID")
            print("REASON: INSUFFICIENT DATA AROUND MAP")
            self.print_envelope()
            return

        sys_target = self.max_amplitude * SYS_RATIO
        dia_target = self.max_amplitude * DIA_RATIO

        self.SYS = self.find_pressure_at_target(sys_target, True)
        self.DIA = self.find_pressure_at_target(dia_target, False)

        print(f"SYS TARGET: {sys_target:.3f}")
        print(f"DIA TARGET: {dia_target:.3f}")
        print(f"SYS CROSSING: {self.SYS:.1f}")
        print(f"DIA CROSSING: {self.DIA:.1f}")

        valid = True

        print("--- VALIDATION DIAGNOSTICS ---")

        if self.SYS <= 0.0 or self.DIA <= 0.0 or self.MAP <= 0.0:
            print("FAIL: Missing pressure crossing")
            valid = False

        if not (self.SYS > self.MAP > self.DIA):
            print("FAIL: SYS > MAP > DIA is not satisfied")
            valid = False

        pulse_pressure = self.SYS - self.DIA
        print(f"Pulse pressure: {pulse_pressure:.1f}")

        if pulse_pressure < 10.0 or pulse_pressure > 150.0:
            print("FAIL: Pulse pressure outside code limits")
            valid = False

        if valid:
            print("Validation checks passed")
        else:
            print("Validation checks failed")

        print()
        print("========== RESULT ==========")

        if not valid:
            print("RESULT: INVALID")
            print("REASON: POOR OSCILLOMETRIC DATA")
            self.SYS = 0.0
            self.DIA = 0.0
            self.MAP = 0.0
        else:
            print(f"SYS: {self.SYS:.1f} mmHg")
            print(f"DIA: {self.DIA:.1f} mmHg")
            print(f"MAP: {self.MAP:.1f} mmHg")
            print("WARNING: EXPERIMENTAL ESTIMATES ONLY")

        print("============================")
        self.print_envelope()


class BloodPressureTest:
    def __init__(self):
        self.adc = TM7711()
        self.analyzer = OscillometricAnalyzer()
        self.pressure_filter = PressureSpikeFilter()
        self.pump_running = False
        self.measuring = False
        self.settle_started = None
        self.last_live_print = 0.0
        self._last_pressure = None
        self._last_time = None
        self._last_rate_log = 0.0

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

                pressure = raw_to_mmhg(raw)
                if not math.isfinite(pressure) or pressure < -5 or pressure > 250:
                    print(f"ERROR: invalid pressure {pressure:.1f} mmHg")
                    break

                if self.pump_running and pressure >= PUMP_OFF_PRESSURE:
                    pump_set(False)
                    self.pump_running = False
                    self.settle_started = time.monotonic()
                    print("Pump off; allowing pressure to settle")

                if self.measuring:
                    measured_pressure = pressure
                    pressure, was_spike = self.pressure_filter.apply(pressure)
                    if was_spike:
                        print(f"Ignored pressure outlier: raw={measured_pressure:.1f} mmHg, "
                              f"filtered={pressure:.1f} mmHg")

                if (not self.pump_running and not self.measuring
                        and self.settle_started is not None
                        and time.monotonic() - self.settle_started >= SETTLE_SECONDS):
                    self.pressure_filter.reset(pressure)
                    self.measuring = True
                    self.analyzer.start_measurement(pressure)
                    self._last_pressure = None
                    self._last_time = None
                    self._last_rate_log = 0.0
                    print(f"Measuring from {pressure:.1f} mmHg; "
                          f"valve closed, natural leakage ~6 mmHg/s")

                if not self.pump_running and self.measuring:
                    self.analyzer.process_pressure(pressure, now_ms())

                    if pressure <= MEASURE_END_PRESSURE:
                        self.measuring = False
                        self.analyzer.calculate_bp()
                        valve_set(False)  # open only after SYS/DIA/HR calculation
                        print("Exhaust valve opened; cuff venting")
                        print("Measurement complete")
                        break

                # Log deflation rate during measurement (target: 2-3 mmHg/s).
                if (self.measuring and self._last_time is not None
                        and now_ms() - self._last_rate_log > 500):
                    dt = (now_ms() - self._last_time) / 1000.0
                    if dt > 0:
                        rate = (self._last_pressure - pressure) / dt
                        self._last_rate_log = now_ms()
                        print(f"DEFLATION RATE: {rate:.2f} mmHg/s", flush=True)
                if self.measuring:
                    self._last_pressure = pressure
                    self._last_time = now_ms()

                current = time.monotonic()
                if current - self.last_live_print >= 0.1:
                    self.last_live_print = current
                    if self.pump_running:
                        phase = "ON"
                    elif self.measuring:
                        phase = "OFF"
                    else:
                        phase = "WAIT"
                    print(
                        f"Raw:{raw:9d} | P:{pressure:6.1f} | "
                        f"SYS:{self.analyzer.SYS:5.1f} | DIA:{self.analyzer.DIA:5.1f} | "
                        f"MAP:{self.analyzer.MAP:5.1f} | "
                        f"Amp:{self.analyzer.pulse_amplitude:.3f} | "
                        f"HR:{self.analyzer.heart_rate_bpm:5.1f} | "
                        f"Beats:{self.analyzer.detected_beat_count} | "
                        f"Envelope:{self.analyzer.peak_count} | Pump:{phase}",
                        flush=True)

        except KeyboardInterrupt:
            print("\nStopped by user")
        finally:
            self.safe_stop()
            GPIO.output(SCK_PIN, GPIO.LOW)
            GPIO.cleanup()


if __name__ == "__main__":
    if "--noise" in sys.argv[1:]:
        debug_noise()
    else:
        BloodPressureTest().run()
