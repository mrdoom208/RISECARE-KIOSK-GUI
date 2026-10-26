"""Experimental cuff pressure test using an HX710B ADC.

The signal-processing pipeline mirrors the Arduino blood-pressure prototype:
cuff pressure is split into a slow baseline and a pulsatile oscillation, a
trough/peak detector builds an oscillometric envelope, heart rate comes from
confirmed peak intervals, and SYS/DIA are found where the envelope falls to
fixed ratios of its maximum amplitude. Inflation stops on the live envelope
peak instead of a fixed pressure, and deflation ends on the fading envelope
tail with a hard pressure floor.

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
RAW_PER_MMHG = 28943.0
RAW_OFFSET = 472820.0

# Pressure cycle
# Inflation stops dynamically once the live oscillation envelope has clearly
# passed its peak. MAX_INFLATE_PRESSURE is only a hard safety ceiling.
MAX_INFLATE_PRESSURE = 200.0
INFLATION_STOP_RATIO = 0.50
# Stop this far above the live peak-amplitude pressure. The ratio is used as
# a diagnostic; the pulse tail can be too small to detect, so the margin is
# the primary dynamic stop.
INFLATION_PEAK_MARGIN = 100.0
INFLATION_MIN_STOP_PRESSURE = 150.0
INFLATION_TRACK_MIN_PRESSURE = 50.0
INFLATION_MIN_BEATS = 2
# The baseline EMA needs a moment to settle after the pump starts. Beats during
# this window are dominated by the ramp transient, not the pulse.
INFLATION_WARMUP_SECONDS = 1.2

# Deflation ends dynamically once the envelope has faded below the diastolic
# crossing. MIN_MEASURE_PRESSURE is only a hard safety floor. If the pulse tail
# becomes too small to detect, fall back to this distance below MAP.
MIN_MEASURE_PRESSURE = 25.0
DEFLATION_END_RATIO = 0.75
DEFLATION_END_BEATS = 2
# Do not start the tail streak until the cuff is clearly below the MAP
# candidate; this avoids stopping on a noisy early "peak".
DEFLATION_TAIL_MIN_DROP = 20.0
DEFLATION_FALLBACK_MARGIN = 40.0
SETTLE_SECONDS = 0.3
SETTLE_MAX_PRESSURE_DROP = 15.0

# Experimental oscillometric ratios (from the Arduino prototype).
# NOTE: Fixed ratios are approximations; calibrate against reference measurements.
# Commercial devices fit ratios per-cuff/arm; fixed ratios can err by 5-10+ mmHg.
SYS_RATIO = 0.40
DIA_RATIO = 0.85

# Run --noise first. Keep the pulse floor below real cuff oscillations
# (0.5-4 mmHg) and let the amplitude gate reject isolated noise instead.
MIN_PULSE_AMPLITUDE = 0.03      # Minimum accepted pulse amplitude in mmHg.
AMP_FILTER_WINDOW = 5
AMP_OUTLIER_HIGH = 4          # reject isolated beats above 4x recent median
AMP_OUTLIER_LOW = 0.1           # reject isolated beats below 2x recent median
AMP_OUTLIER_CONFIRM_BEATS = 1   # accept a sustained change after two beats
MIN_PRESSURE_CHANGE = 0.2       # was 0.5; 0.2 keeps more envelope points
PRESSURE_SPIKE_LIMIT = 5.0
MAX_CONSECUTIVE_PRESSURE_SPIKES = 4

# Beat detection timing.
MIN_BEAT_INTERVAL = 300
MAX_BEAT_INTERVAL = 2000

PEAK_DROP_THRESHOLD = 0.06

# Filtering.
BASELINE_ALPHA = 0.01
# Inflation pressure ramps much faster than natural deflation, so use a faster
# baseline there to keep the pulsatile component from being swamped by the ramp.
INFLATION_BASELINE_ALPHA = 0.05
OSC_FILTER_ALPHA = 0.45

MAX_PEAKS = 80

# HX710B serial clock is bit-banged directly through GPIO; no software delay is
# inserted between edges, keeping each high pulse as short as possible.
READY_TIMEOUT = 2.0
MAX_CONSECUTIVE_READ_TIMEOUTS = 2
EXTRA_CLOCK_PULSES = 1
PROGRESS_UPDATE_INTERVAL = 0.25

# A conversion can be corrupted when the OS preempts the bit-banged clock.
# Retry before counting it as a bad sample.
INVALID_PRESSURE_MIN = -5.0
INVALID_PRESSURE_MAX = 250.0
BAD_READ_RETRIES = 3
ADC_WARMUP_SAMPLES = 5
MEASUREMENT_WARMUP_SAMPLES = 2

# Writing to a piped stdout can block and stretch the next ADC read, so keep
# periodic diagnostic logging infrequent during a measurement.
LIVE_PRINT_INTERVAL = 0.5
DEFLATION_RATE_LOG_INTERVAL_MS = 1000

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


class HX710B:
    """Read signed 24-bit differential conversions from an HX710B."""

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
            GPIO.output(SCK_PIN, GPIO.LOW)
            # Sample after lowering SCK so the GPIO read does not stretch
            # the HX710B's clock-high pulse.
            value = (value << 1) | GPIO.input(OUT_PIN)

        for _ in range(EXTRA_CLOCK_PULSES):
            GPIO.output(SCK_PIN, GPIO.HIGH)
            GPIO.output(SCK_PIN, GPIO.LOW)

        if value & 0x800000:
            value -= 0x1000000
        return value

    def probe(self):
        """Return whether the ADC has produced a ready conversion."""
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(OUT_PIN, GPIO.IN)
        return self.wait_ready()


class PressureSpikeFilter:
    """Reject isolated jumps without fighting steady inflation/deflation."""

    def __init__(self):
        self.recent = deque(maxlen=5)
        self.rejected_streak = 0

    def reset(self, pressure):
        self.recent.clear()
        self.recent.append(pressure)
        self.rejected_streak = 0

    def expected_next(self):
        values = list(self.recent)

        if len(values) < 2:
            return values[-1]

        deltas = [b - a for a, b in zip(values, values[1:])]
        # Predict from the last reading plus the median slope so a steady
        # inflation/deflation ramp is not mistaken for a sensor spike.
        return values[-1] + statistics.median(deltas)

    def apply(self, pressure):
        if len(self.recent) >= 3:
            reference = self.expected_next()
            if abs(pressure - reference) > PRESSURE_SPIKE_LIMIT:
                self.rejected_streak += 1
                # Never let a jump redefine the live pressure trend. Repeated
                # jumps are handled as an unstable sensor signal by run().
                return reference, True

        self.rejected_streak = 0
        self.recent.append(pressure)
        return pressure, False


class AmplitudeGate:
    """Reject isolated amplitude jumps without blocking real level changes."""

    def __init__(self, window=AMP_FILTER_WINDOW):
        self.recent = deque(maxlen=window)
        self.rejected_streak = 0

    def reset(self):
        self.recent.clear()
        self.rejected_streak = 0

    def stable(self):
        if not self.recent:
            return 0.0
        return statistics.median(self.recent)

    def accept(self, amplitude):
        if amplitude <= 0.0:
            self.rejected_streak = 0
            return False

        if len(self.recent) < 2:
            self.recent.append(amplitude)
            self.rejected_streak = 0
            return True

        reference = statistics.median(self.recent)
        ratio = amplitude / reference if reference > 0.0 else 1.0

        if ratio > AMP_OUTLIER_HIGH or ratio < AMP_OUTLIER_LOW:
            self.rejected_streak += 1

            # A sustained level change is real; accept it after two
            # consecutive outliers and restart the history from that level.
            if self.rejected_streak >= AMP_OUTLIER_CONFIRM_BEATS:
                self.recent.clear()
                self.recent.append(amplitude)
                self.rejected_streak = 0
                return True

            return False

        self.rejected_streak = 0
        self.recent.append(amplitude)
        return True


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

    adc = HX710B()
    recent = deque(maxlen=NOISE_WINDOW)
    valid = []
    invalid = 0
    previous_time = None
    start = time.monotonic()
    print("HX710B noise capture: pump OFF, valve OPEN")
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
        # Keep GPIO channels owned by other sensors (for example HX711 on
        # BCM 5/6) configured; BP only releases the pins it uses.
        GPIO.cleanup([OUT_PIN, SCK_PIN, PUMP, VALVE])

    print(f"Samples: valid={len(valid)}, invalid/timeouts={invalid}")
    if len(valid) > 1:
        print(f"Raw summary: min={min(valid)}, max={max(valid)}, "
              f"range={max(valid) - min(valid)}, stdev={statistics.stdev(valid):.1f}")
    if invalid:
        print("Invalid readings occurred; those are ADC/interface errors, not noise.")


class InflationTracker:
    """Track pulses during inflation so pump-off pressure can be dynamic."""

    def __init__(self, pressure):
        self.amplitude_gate = AmplitudeGate()
        self.last_beat_time = 0
        self.reset(pressure)

    def reset(self, pressure):
        self.baseline = pressure
        self.oscillation = 0.0
        self.filtered_oscillation = 0.0
        self.previous_oscillation = 0.0

        self.cycle_trough = 0.0
        self.cycle_peak = 0.0
        self.cycle_peak_pressure = pressure
        self.cycle_peak_time = 0

        self.tracking_peak = False
        self.have_trough = False
        self.last_beat_time = 0
        self.start_time = None
        self.warmup_complete = False
        self.amplitude_gate.reset()

    def update(self, pressure, now):
        if self.start_time is None:
            self.start_time = now

        self.baseline = (self.baseline * (1.0 - INFLATION_BASELINE_ALPHA)
                         + pressure * INFLATION_BASELINE_ALPHA)

        self.oscillation = pressure - self.baseline

        self.filtered_oscillation = (self.filtered_oscillation
                                     * (1.0 - OSC_FILTER_ALPHA)
                                     + self.oscillation * OSC_FILTER_ALPHA)

        current = self.filtered_oscillation

        if not self.warmup_complete:
            if now - self.start_time < INFLATION_WARMUP_SECONDS * 1000.0:
                self.previous_oscillation = current
                return None

            # Discard the ramp transient and start the detector cleanly.
            self.warmup_complete = True
            self.have_trough = False
            self.tracking_peak = False
            self.last_beat_time = 0
            self.amplitude_gate.reset()

        if not self.have_trough:
            self.cycle_trough = current
            self.cycle_peak = current
            self.cycle_peak_pressure = pressure
            self.cycle_peak_time = now

            self.have_trough = True
            self.previous_oscillation = current
            return None

        beat = None

        if not self.tracking_peak:
            if current < self.cycle_trough:
                self.cycle_trough = current

            if current > self.previous_oscillation:
                self.cycle_peak = current
                self.cycle_peak_pressure = pressure
                self.cycle_peak_time = now
                self.tracking_peak = True
        else:
            if current > self.cycle_peak:
                self.cycle_peak = current
                self.cycle_peak_pressure = pressure
                self.cycle_peak_time = now

            if current < self.cycle_peak - PEAK_DROP_THRESHOLD:
                amplitude = self.cycle_peak - self.cycle_trough
                beat_pressure = self.cycle_peak_pressure
                beat_time = self.cycle_peak_time

                self.cycle_trough = current
                self.cycle_peak = current
                self.cycle_peak_pressure = pressure
                self.cycle_peak_time = now
                self.tracking_peak = False

                if amplitude >= MIN_PULSE_AMPLITUDE:
                    if self.last_beat_time == 0:
                        self.last_beat_time = beat_time
                        if self.amplitude_gate.accept(amplitude):
                            # Return the current beat, not the lagging median,
                            # so the live envelope/stop decision is current.
                            beat = (amplitude, beat_pressure)
                    else:
                        interval = beat_time - self.last_beat_time
                        if MIN_BEAT_INTERVAL <= interval <= MAX_BEAT_INTERVAL:
                            self.last_beat_time = beat_time
                            if self.amplitude_gate.accept(amplitude):
                                beat = (amplitude, beat_pressure)
                        elif interval > MAX_BEAT_INTERVAL:
                            self.last_beat_time = beat_time
                            self.amplitude_gate.reset()

        self.previous_oscillation = current
        return beat


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
        self.amplitude_gate = AmplitudeGate()

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
        self.rejected_low_amplitude = 0
        self.rejected_amplitude_outliers = 0

        self.low_amplitude_streak = 0
        self.measurement_start_pressure = None

        self.peak_pressures = []
        self.peak_amplitudes = []

        self.max_amplitude = 0.0
        self.map_pressure = 0.0
        self.map_amplitude = 0.0

        self.SYS = 0.0
        self.DIA = 0.0
        self.MAP = 0.0

        self.current_pressure = 0.0
        self.deflation_end_reason = ""
        self.valid_envelope_result = None
        self.invalid_reason = None

    @property
    def peak_count(self):
        return len(self.peak_pressures)

    def start_measurement(self, pressure):
        self.reset()
        self.baseline = pressure
        self.measurement_start_pressure = pressure
        self.current_pressure = pressure

    def process_pressure(self, p, now):
        self.current_pressure = p

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
                beat_pressure = self.cycle_peak_pressure
                beat_time = self.cycle_peak_time

                if self.confirm_beat(amplitude, beat_pressure, beat_time):
                    self.update_deflation_tail(
                        self.pulse_amplitude, beat_pressure)

                # Start searching for the next cycle.
                self.cycle_trough = current
                self.cycle_peak = current
                self.cycle_peak_pressure = p
                self.cycle_peak_time = now

                self.tracking_peak = False

        self.previous_oscillation = current

    def update_deflation_tail(self, amplitude, cuff_pressure):
        if amplitude < MIN_PULSE_AMPLITUDE:
            return

        if (self.max_amplitude <= 0.0
                or cuff_pressure
                >= self.map_pressure - DEFLATION_TAIL_MIN_DROP
                or amplitude > self.max_amplitude * DEFLATION_END_RATIO):
            self.low_amplitude_streak = 0
            return

        self.low_amplitude_streak += 1

    def pulse_is_valid(self, amplitude, cuff_pressure):
        if amplitude < MIN_PULSE_AMPLITUDE:
            return False

        if (cuff_pressure <= MIN_MEASURE_PRESSURE
                or (self.measurement_start_pressure is not None
                    and cuff_pressure
                    >= self.measurement_start_pressure + 10.0)):
            return False

        return True

    def save_oscillation(self, amplitude, stable_amplitude, cuff_pressure):
        if self.peak_count >= MAX_PEAKS:
            return

        # Envelope crossings must use the same gated amplitude that updates
        # MAP. Storing the raw beat here lets rejected/noisy variation leak
        # into SYS/DIA even though the beat passed the stability gate.
        if not self.pulse_is_valid(stable_amplitude, cuff_pressure):
            return

        # Require pressure separation between records.
        if (self.peak_count > 0
                and abs(cuff_pressure - self.peak_pressures[-1])
                < MIN_PRESSURE_CHANGE):
            return

        self.peak_pressures.append(cuff_pressure)
        self.peak_amplitudes.append(stable_amplitude)

        if stable_amplitude > self.max_amplitude:
            self.max_amplitude = stable_amplitude
            self.map_pressure = cuff_pressure
            self.map_amplitude = stable_amplitude

    def confirm_beat(self, amplitude, cuff_pressure, peak_time):
        if amplitude < MIN_PULSE_AMPLITUDE:
            self.rejected_low_amplitude += 1
            print(
                f"REJECTED LOW AMPLITUDE: P={cuff_pressure:.1f} mmHg, "
                f"amp={amplitude:.6f} mmHg, "
                f"minimum={MIN_PULSE_AMPLITUDE:.6f} mmHg",
                flush=True,
            )
            return False

        # First peak establishes the timing reference.
        if self.last_confirmed_peak_time == 0:
            self.last_confirmed_peak_time = peak_time

            if not self.amplitude_gate.accept(amplitude):
                self.rejected_amplitude_outliers += 1
                return False

            self.pulse_amplitude = self.amplitude_gate.stable()
            self.save_oscillation(
                amplitude, self.pulse_amplitude, cuff_pressure)
            self.detected_beat_count += 1
            return True

        interval = peak_time - self.last_confirmed_peak_time

        if interval < MIN_BEAT_INTERVAL:
            # Ignore extra peaks/noise without shifting the last real beat.
            self.rejected_beat_intervals += 1
            return False

        if interval > MAX_BEAT_INTERVAL:
            # Re-anchor after a long gap so later beats can recover.
            self.last_confirmed_peak_time = peak_time
            self.rejected_beat_intervals += 1
            self.amplitude_gate.reset()
            return False

        self.last_confirmed_peak_time = peak_time

        amplitude_reference = self.amplitude_gate.stable()
        if not self.amplitude_gate.accept(amplitude):
            self.rejected_amplitude_outliers += 1
            ratio = amplitude / amplitude_reference if amplitude_reference > 0.0 else 0.0
            print(
                f"REJECTED AMPLITUDE OUTLIER: P={cuff_pressure:.1f} mmHg, "
                f"amp={amplitude:.6f} mmHg, recent={amplitude_reference:.6f} mmHg, "
                f"ratio={ratio:.3f}",
                flush=True,
            )
            return False

        self.pulse_amplitude = self.amplitude_gate.stable()
        # Only timing-validated, amplitude-stable beats enter the envelope.
        self.save_oscillation(amplitude, self.pulse_amplitude, cuff_pressure)
        self.last_beat_interval = interval
        self.heart_rate_bpm = 60000.0 / interval
        self.detected_beat_count += 1
        return True

    @staticmethod
    def interpolate_pressure(p1, a1, p2, a2, target):
        if abs(a2 - a1) < 0.0001:
            return 0.0

        fraction = (target - a1) / (a2 - a1)

        if fraction < 0.0 or fraction > 1.0:
            return 0.0

        return p1 + fraction * (p2 - p1)

    @staticmethod
    def find_envelope_crossing(pressures, amplitudes, map_pressure, target, systolic_side):
        for i in range(len(pressures) - 1):
            p1 = pressures[i]
            a1 = amplitudes[i]

            p2 = pressures[i + 1]
            a2 = amplitudes[i + 1]

            # Systolic crossing must be above MAP.
            if systolic_side:
                if p1 < map_pressure or p2 < map_pressure:
                    continue
            else:
                # Diastolic crossing must be below MAP.
                if p1 > map_pressure or p2 > map_pressure:
                    continue

            crosses = ((a1 <= target <= a2) or (a2 <= target <= a1))

            if not crosses:
                continue

            result = OscillometricAnalyzer.interpolate_pressure(p1, a1, p2, a2, target)

            if result > 0.0:
                return result

        return 0.0

    def find_pressure_at_target(self, target, systolic_side):
        return self.find_envelope_crossing(
            self.peak_pressures,
            self.peak_amplitudes,
            self.map_pressure,
            target,
            systolic_side,
        )

    def envelope_point_counts(self):
        above_map = sum(1 for p in self.peak_pressures if p > self.map_pressure)
        below_map = sum(1 for p in self.peak_pressures if p < self.map_pressure)
        return above_map, below_map

    def filtered_envelope_points(self):
        """Return the same ordered, smoothed envelope used for BP crossings."""
        ordered_points = sorted(
            zip(self.peak_pressures, self.peak_amplitudes),
            key=lambda point: point[0],
            reverse=True,
        )
        pressures = [pressure for pressure, _ in ordered_points]
        raw_amplitudes = [amplitude for _, amplitude in ordered_points]
        filtered_amplitudes = []

        for i, amplitude in enumerate(raw_amplitudes):
            neighbors = (raw_amplitudes[max(0, i - 2):i]
                         + raw_amplitudes[i + 1:i + 3])
            if neighbors:
                reference = statistics.median(neighbors)
                if (reference > 0.0
                        and amplitude > reference * AMP_OUTLIER_HIGH):
                    amplitude = reference
            filtered_amplitudes.append(amplitude)

        amplitudes = [
            statistics.median(filtered_amplitudes[max(0, i - 2):i + 3])
            for i in range(len(filtered_amplitudes))
        ]
        return pressures, amplitudes

    def envelope_has_enough_points(self):
        above_map, below_map = self.envelope_point_counts()

        print(f"POINTS ABOVE MAP: {above_map}")
        print(f"POINTS BELOW MAP: {below_map}")

        # Three distinct beats on either side provide a usable crossing span
        # while allowing for slower natural-leak pressure changes.
        return above_map >= 3 and below_map >= 3

    def deflation_complete(self):
        if self.peak_count < 5 or self.max_amplitude <= 0.0:
            return False

        envelope_pressures, envelope_amplitudes = self.filtered_envelope_points()
        map_index = max(range(len(envelope_amplitudes)),
                        key=envelope_amplitudes.__getitem__)
        envelope_map_pressure = envelope_pressures[map_index]
        envelope_max_amplitude = envelope_amplitudes[map_index]
        above_map = sum(1 for p in envelope_pressures if p > envelope_map_pressure)
        below_map = sum(1 for p in envelope_pressures if p < envelope_map_pressure)
        if above_map < 3 or below_map < 3:
            return False

        # Stop only once both configured BP crossings pass the same checks as
        # calculate_bp(). A diastolic crossing alone is not enough to produce
        # a valid result.
        sys_target = envelope_max_amplitude * SYS_RATIO
        dia_target = envelope_max_amplitude * DIA_RATIO
        systolic = self.find_envelope_crossing(
            envelope_pressures, envelope_amplitudes, envelope_map_pressure,
            sys_target, systolic_side=True,
        )
        diastolic = self.find_envelope_crossing(
            envelope_pressures, envelope_amplitudes, envelope_map_pressure,
            dia_target, systolic_side=False,
        )
        pulse_pressure = systolic - diastolic
        if (systolic > 0.0 and diastolic > 0.0
                and systolic > envelope_map_pressure > diastolic
                and 10.0 <= pulse_pressure <= 150.0
                and self.heart_rate_bpm > 0.0):
            # Freeze the exact envelope and crossings that justified ending
            # deflation. calculate_bp() consumes this snapshot so its final
            # DIA cannot diverge from the successful stop check.
            self.valid_envelope_result = (
                envelope_pressures,
                envelope_amplitudes,
                envelope_map_pressure,
                systolic,
                diastolic,
            )
            self.deflation_end_reason = "valid envelope crossings"
            return True

        return False

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
        self.invalid_reason = None

        print()
        print("========== OSCILLOMETRIC DATA ==========")
        print(f"ENVELOPE RECORDS: {self.peak_count}")
        print(f"DETECTED BEATS: {self.detected_beat_count}")
        print(f"REJECTED BEAT INTERVALS: {self.rejected_beat_intervals}")
        print(f"REJECTED LOW AMPLITUDE: {self.rejected_low_amplitude}")
        print(f"REJECTED AMPLITUDE OUTLIERS: "
              f"{self.rejected_amplitude_outliers}")
        print(f"MIN PULSE AMPLITUDE: {MIN_PULSE_AMPLITUDE:.3f}")

        if self.heart_rate_bpm > 0.0:
            print(f"CUFF PULSE: {self.heart_rate_bpm:.1f} BPM")
        else:
            print("CUFF PULSE: UNAVAILABLE")

        print(f"MAX AMP: {self.max_amplitude:.3f}")

        if self.peak_count < 5 or self.max_amplitude <= 0.0:
            print("RESULT: INVALID")
            print("REASON: INSUFFICIENT ENVELOPE DATA")
            self.invalid_reason = "Insufficient oscillometric envelope data"
            self.print_envelope()
            return

        # Use the same pressure-ordered, smoothed envelope as the early-stop
        # check. Keep the raw beat records intact so this calculation cannot
        # accidentally smooth the envelope a second time on a later call.
        if self.valid_envelope_result is not None:
            (envelope_pressures, envelope_amplitudes, self.map_pressure,
             self.SYS, self.DIA) = self.valid_envelope_result
            map_index = max(range(len(envelope_amplitudes)),
                            key=envelope_amplitudes.__getitem__)
            self.max_amplitude = envelope_amplitudes[map_index]
            print("USING VALIDATED ENVELOPE SNAPSHOT")
        else:
            envelope_pressures, envelope_amplitudes = self.filtered_envelope_points()
            map_index = max(range(len(envelope_amplitudes)),
                            key=envelope_amplitudes.__getitem__)
            self.max_amplitude = envelope_amplitudes[map_index]
            self.map_pressure = envelope_pressures[map_index]
        self.map_amplitude = self.max_amplitude

        self.MAP = self.map_pressure
        print(f"MAP PRESSURE: {self.MAP:.1f}")

        above_map = sum(1 for pressure in envelope_pressures
                        if pressure > self.map_pressure)
        below_map = sum(1 for pressure in envelope_pressures
                        if pressure < self.map_pressure)
        print(f"POINTS ABOVE MAP: {above_map}")
        print(f"POINTS BELOW MAP: {below_map}")
        if above_map < 3 or below_map < 3:
            print("RESULT: INVALID")
            print("REASON: INSUFFICIENT DATA AROUND MAP")
            self.invalid_reason = "Insufficient envelope points above and below MAP"
            self.print_envelope()
            return

        sys_target = self.max_amplitude * SYS_RATIO
        dia_target = self.max_amplitude * DIA_RATIO

        if self.valid_envelope_result is None:
            self.SYS = self.find_envelope_crossing(
                envelope_pressures, envelope_amplitudes, self.map_pressure,
                sys_target, systolic_side=True,
            )
            self.DIA = self.find_envelope_crossing(
                envelope_pressures, envelope_amplitudes, self.map_pressure,
                dia_target, systolic_side=False,
            )

        print(f"SYS TARGET: {sys_target:.3f}")
        print(f"DIA TARGET: {dia_target:.3f}")
        print(f"SYS CROSSING: {self.SYS:.1f}")
        print(f"DIA CROSSING: {self.DIA:.1f}")

        valid = True
        validation_errors = []

        print("--- VALIDATION DIAGNOSTICS ---")

        if self.SYS <= 0.0 or self.DIA <= 0.0 or self.MAP <= 0.0:
            print("FAIL: Missing pressure crossing")
            validation_errors.append("missing SYS/DIA crossing")
            valid = False

        if not (self.SYS > self.MAP > self.DIA):
            print("FAIL: SYS > MAP > DIA is not satisfied")
            validation_errors.append("SYS, MAP, and DIA are out of order")
            valid = False

        pulse_pressure = self.SYS - self.DIA
        print(f"Pulse pressure: {pulse_pressure:.1f}")

        if pulse_pressure < 10.0 or pulse_pressure > 150.0:
            print("FAIL: Pulse pressure outside code limits")
            validation_errors.append(f"pulse pressure {pulse_pressure:.1f} mmHg outside 10-150")
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
            self.invalid_reason = "; ".join(validation_errors)
            self.SYS = 0.0
            self.DIA = 0.0
            self.MAP = 0.0
        else:
            print(f"SYS: {self.SYS:.1f} mmHg")
            print(f"DIA: {self.DIA:.1f} mmHg")
            print(f"MAP: {self.MAP:.1f} mmHg")
            if self.heart_rate_bpm > 0.0:
                print(f"PULSE: {self.heart_rate_bpm:.1f} BPM")
            print("WARNING: EXPERIMENTAL ESTIMATES ONLY")

        print("============================")
        self.print_envelope()


class BloodPressureTest:
    def __init__(self):
        self.adc = HX710B()
        self.analyzer = OscillometricAnalyzer()
        self.pressure_filter = PressureSpikeFilter()
        self.pump_running = False
        self.measuring = False
        self.settle_started = None
        self.last_live_print = 0.0
        self._last_pressure = None
        self._last_time = None
        self._last_rate_log = 0.0

        self.inflation_tracker = None
        self.pump_off_pressure = None
        self.measurement_start_pressure = None
        self.inflation_peak_amplitude = 0.0
        self.inflation_peak_pressure = 0.0
        self.inflation_beat_count = 0
        self.inflation_low_amplitude_seen = False
        self.failure_reason = None

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

    def read_pressure(self):
        """Return (raw, mmHg), retrying transient out-of-range conversions."""
        raw = None
        pressure = 0.0
        for _ in range(BAD_READ_RETRIES + 1):
            raw = self.adc.read_raw()
            if raw is None:
                return None, 0.0
            pressure = raw_to_mmhg(raw)
            if (math.isfinite(pressure)
                    and INVALID_PRESSURE_MIN <= pressure <= INVALID_PRESSURE_MAX):
                return raw, pressure
        return raw, pressure

    def update_inflation(self, pressure, now, raw_pressure=None):
        """Return (stop, reason) using live oscillation tracking."""
        # Enforce the ceiling on the raw reading so filter lag cannot overshoot.
        safety_pressure = pressure if raw_pressure is None else raw_pressure
        if safety_pressure >= MAX_INFLATE_PRESSURE:
            return True, "safety ceiling"

        if self.inflation_tracker is None:
            self.inflation_tracker = InflationTracker(pressure)
            return False, ""

        beat = self.inflation_tracker.update(pressure, now)

        if beat is not None:
            amplitude, beat_pressure = beat

            if beat_pressure >= INFLATION_TRACK_MIN_PRESSURE:
                self.inflation_beat_count += 1

                if amplitude > self.inflation_peak_amplitude:
                    self.inflation_peak_amplitude = amplitude
                    self.inflation_peak_pressure = beat_pressure
                    self.inflation_low_amplitude_seen = False
                elif (self.inflation_peak_amplitude > 0.0
                      and beat_pressure >= self.inflation_peak_pressure
                      and amplitude
                      <= self.inflation_peak_amplitude * INFLATION_STOP_RATIO):
                    self.inflation_low_amplitude_seen = True

        # The pulse tail can fall below the detector while the cuff is still
        # climbing. Once the peak margin is reached, stop even if that last
        # low-amplitude beat was not detectable; the live peak is the anchor.
        # This check runs every sample, not only on detected beats.
        if (self.inflation_peak_amplitude > 0.0
                and self.inflation_beat_count >= INFLATION_MIN_BEATS
                and pressure >= INFLATION_MIN_STOP_PRESSURE
                and pressure
                >= self.inflation_peak_pressure + INFLATION_PEAK_MARGIN):
            if self.inflation_low_amplitude_seen:
                detail = (f"amplitude fell to "
                          f"{INFLATION_STOP_RATIO:.0%} of peak "
                          f"{self.inflation_peak_amplitude:.3f}")
            else:
                detail = "no accepted low tail beat"

            return True, (f"peak margin at {pressure:.1f} mmHg, "
                          f"{pressure - self.inflation_peak_pressure:.1f} "
                          f"mmHg above peak {self.inflation_peak_pressure:.1f} "
                          f"({detail})")

        return False, ""

    def run(self, progress_callback=None, stop_event=None):
        self.setup()
        print("RiseCare pressure test (experimental; not for diagnosis)")
        print(f"Calibration: {RAW_PER_MMHG} raw/mmHg, offset {RAW_OFFSET}")
        result = None
        self.failure_reason = None
        last_progress_at = 0.0

        # Fewer thread switches during a bit-banged conversion means fewer
        # corrupted samples when this runs alongside the other kiosk threads.
        previous_switch_interval = None
        try:
            previous_switch_interval = sys.setswitchinterval(0.05)
        except (AttributeError, ValueError):
            pass

        def report_progress(stage, percent, pressure):
            nonlocal last_progress_at
            now = time.monotonic()
            if progress_callback and now - last_progress_at >= PROGRESS_UPDATE_INTERVAL:
                progress_callback(stage, max(0, min(99, round(percent))), pressure)
                last_progress_at = now

        try:
            self.inflation_tracker = None
            self.pump_off_pressure = None
            self.measurement_start_pressure = None
            self.inflation_peak_amplitude = 0.0
            self.inflation_peak_pressure = 0.0
            self.inflation_beat_count = 0
            self.inflation_low_amplitude_seen = False
            self.pressure_filter = PressureSpikeFilter()

            # Close the exhaust valve, then inflate.
            valve_set(True)
            pump_set(True)
            self.pump_running = True
            consecutive_invalid = 0
            consecutive_read_timeouts = 0
            consecutive_pressure_spikes = 0
            warmup_remaining = ADC_WARMUP_SAMPLES
            measurement_warmup_remaining = 0
            while True:
                if stop_event is not None and stop_event.is_set():
                    print("BP measurement stopped by operator")
                    self.failure_reason = "Measurement stopped by operator"
                    break

                raw_reading, cuff_pressure = self.read_pressure()
                if stop_event is not None and stop_event.is_set():
                    print("BP measurement stopped by operator")
                    self.failure_reason = "Measurement stopped by operator"
                    break

                if raw_reading is None:
                    consecutive_read_timeouts += 1
                    print(
                        "WARNING: HX710B ready timeout "
                        f"({consecutive_read_timeouts}/"
                        f"{MAX_CONSECUTIVE_READ_TIMEOUTS}); skipping sample"
                    )
                    if consecutive_read_timeouts >= MAX_CONSECUTIVE_READ_TIMEOUTS:
                        print("ERROR: repeated HX710B timeouts; aborting safely")
                        self.failure_reason = "Pressure sensor timed out repeatedly"
                        break
                    continue

                consecutive_read_timeouts = 0

                pressure = cuff_pressure
                if (not math.isfinite(pressure)
                        or pressure < INVALID_PRESSURE_MIN
                        or pressure > INVALID_PRESSURE_MAX):
                    consecutive_invalid += 1
                    print(f"Invalid pressure {pressure:.1f} mmHg "
                          f"({consecutive_invalid}/3 consecutive)")
                    if consecutive_invalid >= 3:
                        print("ERROR: 3 consecutive invalid readings; aborting")
                        self.failure_reason = "Pressure sensor returned three invalid readings"
                        break
                    continue
                consecutive_invalid = 0

                if warmup_remaining > 0:
                    warmup_remaining -= 1
                    # Even discarded warm-up samples must honor the safety
                    # ceiling so a pre-pressurized cuff cannot overshoot.
                    if cuff_pressure >= MAX_INFLATE_PRESSURE:
                        pump_set(False)
                        self.pump_running = False
                        self.pump_off_pressure = cuff_pressure
                        self.settle_started = time.monotonic()
                        print(f"Pump off at {cuff_pressure:.1f} mmHg "
                              "(safety ceiling); allowing pressure to settle")
                    continue

                measured_pressure = cuff_pressure
                pressure, was_spike = self.pressure_filter.apply(cuff_pressure)
                if was_spike:
                    consecutive_pressure_spikes += 1
                    print(f"Ignored pressure outlier: raw={measured_pressure:.1f} mmHg, "
                          f"filtered={pressure:.1f} mmHg")
                    if consecutive_pressure_spikes >= MAX_CONSECUTIVE_PRESSURE_SPIKES:
                        self.failure_reason = (
                            "Pressure signal unstable: "
                            f"{consecutive_pressure_spikes} consecutive pressure jumps"
                        )
                        print(f"ERROR: {self.failure_reason}", flush=True)
                        break
                else:
                    consecutive_pressure_spikes = 0

                if self.pump_running:
                    report_progress(
                        "inflating",
                        5 + 40 * min(max(pressure, 0.0) / MAX_INFLATE_PRESSURE, 1.0),
                        pressure,
                    )
                    stop, reason = self.update_inflation(
                        pressure, now_ms(), raw_pressure=measured_pressure)
                    if stop:
                        pump_set(False)
                        self.pump_running = False
                        self.pump_off_pressure = pressure
                        self.settle_started = time.monotonic()
                        print(f"Pump off at {pressure:.1f} mmHg ({reason}); "
                              f"allowing pressure to settle")

                if self.measuring and self.measurement_start_pressure is not None:
                    # During deflation pressure only goes down; reject readings
                    # above the measurement start as invalid sensor spikes.
                    if (pressure > self.measurement_start_pressure
                            + PRESSURE_SPIKE_LIMIT):
                        print(f"Rejected deflation sample above measurement start: "
                              f"{pressure:.1f} mmHg")
                        continue

                if (not self.pump_running and not self.measuring
                        and self.settle_started is not None
                        and time.monotonic() - self.settle_started >= SETTLE_SECONDS):
                    if (self.pump_off_pressure is not None
                            and self.pump_off_pressure - pressure
                            > SETTLE_MAX_PRESSURE_DROP):
                        self.failure_reason = (
                            "Cuff pressure dropped unexpectedly after inflation "
                            f"({self.pump_off_pressure:.1f} to {pressure:.1f} mmHg); "
                            "check Pi power, pressure sensor wiring, and cuff tubing"
                        )
                        print(f"ERROR: {self.failure_reason}", flush=True)
                        break

                    self.pressure_filter.reset(pressure)
                    consecutive_pressure_spikes = 0
                    self.measuring = True
                    self.measurement_start_pressure = pressure
                    self.analyzer.start_measurement(pressure)
                    self._last_pressure = None
                    self._last_time = None
                    self._last_rate_log = 0.0
                    measurement_warmup_remaining = MEASUREMENT_WARMUP_SAMPLES
                    print(f"Measuring from {pressure:.1f} mmHg "
                          f"(inflation peak {self.inflation_peak_amplitude:.3f} "
                          f"at {self.inflation_peak_pressure:.1f} mmHg); "
                          f"valve closed, natural leakage ~6 mmHg/s")

                if not self.pump_running and self.measuring:
                    if measurement_warmup_remaining > 0:
                        measurement_warmup_remaining -= 1
                        continue
                    self.analyzer.process_pressure(pressure, now_ms())
                    deflation_span = max(
                        self.measurement_start_pressure - MIN_MEASURE_PRESSURE, 1.0
                    )
                    deflation_progress = 45 + 50 * (
                        self.measurement_start_pressure - pressure
                    ) / deflation_span
                    report_progress("deflating", deflation_progress, pressure)

                    end_reason = ""
                    if self.analyzer.deflation_complete():
                        end_reason = (self.analyzer.deflation_end_reason
                                      or "oscillation tail")
                    elif pressure <= MIN_MEASURE_PRESSURE:
                        end_reason = "safety floor"

                    if end_reason:
                        self.measuring = False
                        self.analyzer.calculate_bp()
                        if (self.analyzer.SYS > 0.0 and self.analyzer.DIA > 0.0
                                and self.analyzer.heart_rate_bpm > 0.0):
                            result = {
                                "systolic": round(self.analyzer.SYS),
                                "diastolic": round(self.analyzer.DIA),
                                "map": round(self.analyzer.MAP, 1),
                                "pulseRate": round(self.analyzer.heart_rate_bpm),
                            }
                        valve_set(False)  # open only after SYS/DIA/HR calculation
                        print(f"Deflation ended at {pressure:.1f} mmHg "
                              f"({end_reason})")
                        print("Exhaust valve opened; cuff venting")
                        print("Measurement complete")
                        break

                # Log deflation rate during measurement (target: 2-3 mmHg/s).
                if (self.measuring and self._last_time is not None
                        and now_ms() - self._last_rate_log
                        > DEFLATION_RATE_LOG_INTERVAL_MS):
                    dt = (now_ms() - self._last_time) / 1000.0
                    if dt > 0:
                        rate = (self._last_pressure - pressure) / dt
                        self._last_rate_log = now_ms()
                        print(f"DEFLATION RATE: {rate:.2f} mmHg/s")
                if self.measuring:
                    self._last_pressure = pressure
                    self._last_time = now_ms()

                current = time.monotonic()
                if current - self.last_live_print >= LIVE_PRINT_INTERVAL:
                    self.last_live_print = current
                    if self.pump_running:
                        phase = "ON"
                    elif self.measuring:
                        phase = "OFF"
                    else:
                        phase = "WAIT"
                    print(
                        f"Raw:{raw_reading:9d} | P:{pressure:6.1f} | "
                        f"SYS:{self.analyzer.SYS:5.1f} | DIA:{self.analyzer.DIA:5.1f} | "
                        f"MAP:{self.analyzer.MAP:5.1f} | "
                        f"Amp:{self.analyzer.pulse_amplitude:.3f} | "
                        f"Pulse:{self.analyzer.heart_rate_bpm:5.1f} | "
                        f"Beats:{self.analyzer.detected_beat_count} | "
                        f"Envelope:{self.analyzer.peak_count} | Pump:{phase}")

        except KeyboardInterrupt:
            print("\nStopped by user")
        finally:
            self.safe_stop()
            GPIO.output(SCK_PIN, GPIO.LOW)
            # GPIO.cleanup() without channels resets every pin, which breaks
            # the load-cell HX711 configured on BCM 5/6 after a BP run.
            GPIO.cleanup([OUT_PIN, SCK_PIN, PUMP, VALVE])
            if previous_switch_interval is not None:
                try:
                    sys.setswitchinterval(previous_switch_interval)
                except (AttributeError, ValueError):
                    pass

        if result is None and self.failure_reason is None:
            self.failure_reason = self.analyzer.invalid_reason or (
                "No valid SYS/DIA result; "
                f"accepted beats={self.analyzer.detected_beat_count}, "
                f"envelope points={self.analyzer.peak_count}, "
                f"peak amplitude={self.analyzer.max_amplitude:.3f} mmHg"
            )
            print(f"BP measurement failed: {self.failure_reason}")

        return result


if __name__ == "__main__":
    if "--noise" in sys.argv[1:]:
        debug_noise()
    else:
        BloodPressureTest().run()
