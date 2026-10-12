"""Standalone blood-pressure test using a TM7711 24-bit ADC, a pump and a valve.

Wiring (BCM):

    TM7711 DOUT -> GPIO17  (OUT_PIN, input)
    TM7711 SCK  -> GPIO27  (SCK_PIN, output)
    Pump relay  -> GPIO22  (PUMP)
    Valve relay -> GPIO4   (VALVE)

Run a measurement:      python bptest.py
Verify the actuators:   python bptest.py --test

The algorithm is a prototype oscillometric estimator: the cuff is inflated to
PUMP_OFF_PRESSURE, held briefly, then bled down while the pulsatile component of
the pressure signal is tracked. Piezo beat amplitudes form an envelope whose
peak is the MAP; SYS and DIA are interpolated at fixed ratios of that peak.

WARNING: experimental estimates only. Verify calibration against a reference
gauge before any clinical use.
"""

import math
import sys
import time

import RPi.GPIO as GPIO

# ======================================================
# PINS (BCM)
# ======================================================

OUT_PIN = 17
SCK_PIN = 27
PUMP = 22
VALVE = 4

# ======================================================
# CALIBRATION - VERIFY WITH A REFERENCE GAUGE
# ======================================================

RAW_PER_MMHG = 14143.12
RAW_OFFSET = 51409.0

# ======================================================
# PRESSURE CONTROL
# ======================================================

PUMP_OFF_PRESSURE = 170.0
MEASURE_END_PRESSURE = 60.0

# ======================================================
# EXPERIMENTAL OSCILLOMETRIC RATIOS
# ======================================================

SYS_RATIO = 0.50
DIA_RATIO = 0.75

MIN_PULSE_AMPLITUDE = 0.03
MAX_AMP_CHANGE_RATIO = 10.0
MIN_PRESSURE_CHANGE = 0.2

# ======================================================
# TIMING (ms)
# ======================================================

SAMPLE_INTERVAL = 10
SETTLE_TIME = 2000

MIN_BEAT_INTERVAL = 300
MAX_BEAT_INTERVAL = 2000

PEAK_DROP_THRESHOLD = 0.010

# ======================================================
# FILTERING
# ======================================================

BASELINE_ALPHA = 0.05
OSC_FILTER_ALPHA = 0.25

# ======================================================
# TM7711 READY-WAIT / DEBUG
# The TM7711 only runs at 10 Hz or 40 Hz. At 10 Hz a new sample lands about
# every 100 ms, so the ready-wait must be much longer than that or it races the
# converter and always reports SENSOR TIMEOUT on otherwise-good wiring.
# ======================================================

TM7711_READY_TIMEOUT_US = 1000000   # 1 s (10x the 10 Hz period)
DEBUG_SAMPLE_WINDOW = 200           # reads used to classify a stuck line

# ======================================================
# RELAY / ACTUATOR POLARITY
# Most cheap relay modules are ACTIVE-LOW: the GPIO pin must be pulled LOW to
# energise the relay (pump runs / valve closes). Set to False for an
# active-HIGH board or a bare transistor driver. Confirm with `--test`.
# ======================================================

RELAYS_ACTIVE_LOW = True

DEBUG_TIMING = True
DEBUG_ACTUATORS = True


def millis():
    return int(time.monotonic() * 1000)


def micros():
    return int(time.perf_counter() * 1000000)


# ======================================================
# ACTUATORS - PUMP / VALVE
# Pump  : energised = running, released = stopped
# Valve : energised = CLOSED (holds pressure), released = OPEN (vents)
# ======================================================

def relay_level(on):
    if RELAYS_ACTIVE_LOW:
        return GPIO.LOW if on else GPIO.HIGH
    return GPIO.HIGH if on else GPIO.LOW


def pump_set(on):
    GPIO.output(PUMP, relay_level(on))
    if DEBUG_ACTUATORS:
        print(f"DEBUG PUMP {'ON' if on else 'OFF'} (GPIO{PUMP}={GPIO.input(PUMP)})", flush=True)


def valve_set(closed):
    GPIO.output(VALVE, relay_level(closed))
    if DEBUG_ACTUATORS:
        print(f"DEBUG VALVE {'CLOSED' if closed else 'OPEN'} (GPIO{VALVE}={GPIO.input(VALVE)})", flush=True)


def raw_to_mmhg(raw):
    return (raw - RAW_OFFSET) / RAW_PER_MMHG


# ======================================================
# TM7711 DRIVER
# ======================================================

class TM7711:
    """Bit-banged 24-bit reader for the TM7711 load-cell ADC."""

    def __init__(self):
        self.last_ready_time = 0
        self.last_interval_us = 0
        self.last_waited_us = 0

    def read(self):
        """Clock out one sample. Returns (ok, raw_value, waited_us)."""
        start = micros()

        while GPIO.input(OUT_PIN) == GPIO.HIGH:
            elapsed = micros() - start
            if elapsed > TM7711_READY_TIMEOUT_US:
                self.last_waited_us = elapsed
                self._report_timeout(elapsed)
                return False, 0, elapsed

        ready_at = micros()
        waited = ready_at - start

        # Time between successive ready edges reveals the real sample rate:
        # ~100 ms => 10 Hz, ~25 ms => 40 Hz.
        self.last_interval_us = ready_at - self.last_ready_time if self.last_ready_time else 0
        self.last_ready_time = ready_at
        self.last_waited_us = waited

        value = 0
        for _ in range(24):
            GPIO.output(SCK_PIN, GPIO.HIGH)
            time.sleep(0.000001)

            value = (value << 1) | (1 if GPIO.input(OUT_PIN) else 0)

            GPIO.output(SCK_PIN, GPIO.LOW)
            time.sleep(0.000001)

        # 25th pulse selects the gain/channel for the next conversion.
        GPIO.output(SCK_PIN, GPIO.HIGH)
        time.sleep(0.000001)
        GPIO.output(SCK_PIN, GPIO.LOW)

        # Sign-extend the 24-bit two's-complement reading.
        if value & 0x800000:
            value -= 0x1000000

        return True, value, waited

    def _sample_line(self, samples=DEBUG_SAMPLE_WINDOW):
        low = 0
        for _ in range(samples):
            if GPIO.input(OUT_PIN) == GPIO.LOW:
                low += 1
        return low, samples - low

    def _report_timeout(self, elapsed):
        low, high = self._sample_line()
        if high == 0:
            diagnosis = "line now LOW (slow converter, floating/shorted line)"
        elif low == 0:
            diagnosis = "stuck HIGH (no sensor / no power / wrong pin)"
        else:
            diagnosis = f"toggling (low={low} high={high}, floating/noisy line)"

        print(
            f"DEBUG TM7711 TIMEOUT: DOUT(GPIO{OUT_PIN}) stayed HIGH for "
            f"{elapsed} us (timeout={TM7711_READY_TIMEOUT_US} us). "
            f"{diagnosis}. SCK(GPIO{SCK_PIN})={GPIO.input(SCK_PIN)}. "
            f"Check VCC/GND, DOUT->GPIO{OUT_PIN}, SCK->GPIO{SCK_PIN}.",
            flush=True,
        )


# ======================================================
# OSCILLOMETRIC PROCESSOR
# ======================================================

class Oscillometric:
    """Tracks the cuff oscillation envelope and estimates SYS / DIA / MAP."""

    MAX_PEAKS = 80

    def __init__(self):
        self.reset()

    def reset(self):
        self.baseline = 0.0
        self.oscillation = 0.0
        self.filtered = 0.0
        self.previous = 0.0
        self.pulse_amplitude = 0.0

        self.trough = 0.0
        self.peak = 0.0
        self.peak_pressure = 0.0
        self.peak_time = 0
        self.tracking_peak = False
        self.have_trough = False

        self.last_peak_time = 0
        self.last_beat_interval = 0
        self.heart_rate = 0.0
        self.detected_beats = 0
        self.rejected_intervals = 0

        self.peak_pressures = []
        self.peak_amplitudes = []

        self.max_amplitude = 0.0
        self.map_pressure = 0.0
        self.map_amplitude = 0.0

        self.sys = 0.0
        self.dia = 0.0
        self.map = 0.0

    @property
    def peak_count(self):
        return len(self.peak_pressures)

    def start(self, pressure):
        self.reset()
        self.baseline = pressure

    def process(self, pressure):
        self.baseline = self.baseline * (1.0 - BASELINE_ALPHA) + pressure * BASELINE_ALPHA
        self.oscillation = pressure - self.baseline
        self.filtered = (self.filtered * (1.0 - OSC_FILTER_ALPHA) +
                         self.oscillation * OSC_FILTER_ALPHA)

        current = self.filtered
        now = millis()

        if not self.have_trough:
            self.trough = current
            self.peak = current
            self.peak_pressure = pressure
            self.peak_time = now
            self.have_trough = True
            self.previous = current
            return

        if not self.tracking_peak:
            if current < self.trough:
                self.trough = current

            if current > self.previous:
                self.peak = current
                self.peak_pressure = pressure
                self.peak_time = now
                self.tracking_peak = True
        else:
            if current > self.peak:
                self.peak = current
                self.peak_pressure = pressure
                self.peak_time = now

            if current < self.peak - PEAK_DROP_THRESHOLD:
                amplitude = self.peak - self.trough
                self.pulse_amplitude = amplitude
                self._confirm_beat(amplitude, self.peak_pressure, self.peak_time)

                self.trough = current
                self.peak = current
                self.peak_pressure = pressure
                self.peak_time = now
                self.tracking_peak = False

        self.previous = current

    def _confirm_beat(self, amplitude, pressure, peak_time):
        if amplitude < MIN_PULSE_AMPLITUDE:
            return

        self._save_peak(amplitude, pressure)

        if self.last_peak_time == 0:
            self.last_peak_time = peak_time
            self.detected_beats += 1
            return

        interval = peak_time - self.last_peak_time
        self.last_peak_time = peak_time

        if interval < MIN_BEAT_INTERVAL or interval > MAX_BEAT_INTERVAL:
            self.rejected_intervals += 1
            return

        self.last_beat_interval = interval
        self.heart_rate = 60000.0 / interval
        self.detected_beats += 1

    def _save_peak(self, amplitude, pressure):
        if self.peak_count >= self.MAX_PEAKS:
            return
        if not self._valid_pulse(amplitude, pressure):
            return
        if (self.peak_pressures and
                abs(pressure - self.peak_pressures[-1]) < MIN_PRESSURE_CHANGE):
            return

        self.peak_pressures.append(pressure)
        self.peak_amplitudes.append(amplitude)

        if amplitude > self.max_amplitude:
            self.max_amplitude = amplitude
            self.map_pressure = pressure
            self.map_amplitude = amplitude

    def _valid_pulse(self, amplitude, pressure):
        if amplitude < MIN_PULSE_AMPLITUDE:
            return False

        if (pressure <= MEASURE_END_PRESSURE or
                pressure >= PUMP_OFF_PRESSURE + 10.0):
            return False

        if self.peak_amplitudes:
            previous_amp = self.peak_amplitudes[-1]
            if previous_amp > 0.0:
                ratio = amplitude / previous_amp
                if (ratio > MAX_AMP_CHANGE_RATIO or
                        ratio < 1.0 / MAX_AMP_CHANGE_RATIO):
                    return False

        return True

    @staticmethod
    def _interpolate(p1, a1, p2, a2, target):
        if abs(a2 - a1) < 0.0001:
            return 0.0

        fraction = (target - a1) / (a2 - a1)
        if fraction < 0.0 or fraction > 1.0:
            return 0.0

        return p1 + fraction * (p2 - p1)

    def _pressure_at_target(self, target, systolic_side):
        for i in range(self.peak_count - 1):
            p1 = self.peak_pressures[i]
            a1 = self.peak_amplitudes[i]
            p2 = self.peak_pressures[i + 1]
            a2 = self.peak_amplitudes[i + 1]

            if systolic_side:
                if p1 < self.map_pressure or p2 < self.map_pressure:
                    continue
            else:
                if p1 > self.map_pressure or p2 > self.map_pressure:
                    continue

            crosses = (a1 <= target <= a2) or (a1 >= target >= a2)
            if not crosses:
                continue

            result = self._interpolate(p1, a1, p2, a2, target)
            if result > 0.0:
                return result

        return 0.0

    def _has_enough_points(self):
        above = sum(1 for p in self.peak_pressures if p > self.map_pressure)
        below = sum(1 for p in self.peak_pressures if p < self.map_pressure)

        print("POINTS ABOVE MAP:", above)
        print("POINTS BELOW MAP:", below)

        return above >= 4 and below >= 4

    def print_envelope(self):
        print()
        print("PRESSURE,AMPLITUDE")
        for pressure, amplitude in zip(self.peak_pressures, self.peak_amplitudes):
            print(f"{pressure:.1f},{amplitude:.3f}")
        print("============================")

    def compute(self):
        self.sys = 0.0
        self.dia = 0.0
        self.map = 0.0

        print()
        print("========== OSCILLOMETRIC DATA ==========")

        print("ENVELOPE RECORDS:", self.peak_count)
        print("DETECTED BEATS:", self.detected_beats)
        print("REJECTED BEAT INTERVALS:", self.rejected_intervals)

        hr = f"{self.heart_rate:.1f} BPM" if self.heart_rate > 0.0 else "UNAVAILABLE"
        print("ESTIMATED HR: ", hr)
        print(f"MAX AMP: {self.max_amplitude:.3f}")

        if self.peak_count < 5 or self.max_amplitude <= 0.0:
            print("RESULT: INVALID")
            print("REASON: INSUFFICIENT ENVELOPE DATA")
            self.print_envelope()
            return

        self.map = self.map_pressure
        print(f"MAP PRESSURE: {self.map:.1f}")

        if not self._has_enough_points():
            print("RESULT: INVALID")
            print("REASON: INSUFFICIENT DATA AROUND MAP")
            self.print_envelope()
            return

        sys_target = self.max_amplitude * SYS_RATIO
        dia_target = self.max_amplitude * DIA_RATIO

        self.sys = self._pressure_at_target(sys_target, True)
        self.dia = self._pressure_at_target(dia_target, False)

        print(f"SYS TARGET: {sys_target:.3f}")
        print(f"DIA TARGET: {dia_target:.3f}")
        print(f"SYS CROSSING: {self.sys:.1f}")
        print(f"DIA CROSSING: {self.dia:.1f}")

        valid = (self.sys > 0.0 and self.dia > 0.0 and self.map > 0.0 and
                 self.sys > self.map > self.dia and
                 10.0 <= (self.sys - self.dia) <= 150.0)

        print()
        print("========== RESULT ==========")

        if not valid:
            print("RESULT: INVALID")
            print("REASON: POOR OSCILLOMETRIC DATA")
            self.sys = 0.0
            self.dia = 0.0
            self.map = 0.0
        else:
            print(f"SYS: {self.sys:.1f} mmHg")
            print(f"DIA: {self.dia:.1f} mmHg")
            print(f"MAP: {self.map:.1f} mmHg")
            print("WARNING: EXPERIMENTAL ESTIMATES ONLY")

        print("============================")
        self.print_envelope()


# ======================================================
# MEASUREMENT CONTROLLER
# ======================================================

class BloodPressureTest:
    """Runs one inflate-hold-deflate measurement cycle."""

    def __init__(self):
        self.adc = TM7711()
        self.osc = Oscillometric()

        self.pressure = 0.0
        self.raw = 0

        self.pump_running = False
        self.measuring = False
        self.waiting_to_measure = False
        self.finished = False

        self.pump_off_time = 0
        self.last_sample = 0
        self.last_live_print = 0
        self.timing_announced = False

    def start(self):
        GPIO.setmode(GPIO.BCM)

        GPIO.setup(OUT_PIN, GPIO.IN)
        GPIO.setup(SCK_PIN, GPIO.OUT)
        GPIO.setup(PUMP, GPIO.OUT)
        GPIO.setup(VALVE, GPIO.OUT)

        # Force a known-safe idle state before energising anything.
        pump_set(False)
        valve_set(False)
        GPIO.output(SCK_PIN, GPIO.LOW)

        polarity = "ACTIVE-LOW" if RELAYS_ACTIVE_LOW else "ACTIVE-HIGH"
        print(f"DEBUG relay polarity: {polarity} "
              f"(RELAYS_ACTIVE_LOW={RELAYS_ACTIVE_LOW})", flush=True)
        print(f"DEBUG idle levels: DOUT(GPIO{OUT_PIN})={GPIO.input(OUT_PIN)}, "
              f"SCK(GPIO{SCK_PIN})={GPIO.input(SCK_PIN)}", flush=True)

        # Start inflation with the valve closed.
        valve_set(True)
        pump_set(True)
        self.pump_running = True

        now = millis()
        self.last_sample = now
        self.pump_off_time = now
        self.last_live_print = now

        print()
        print("================================")
        print(" BLOOD PRESSURE PROTOTYPE")
        print("================================")
        print("PUMP STARTED")

    def stop(self):
        # De-energise both actuators: pump OFF, valve OPEN (vent).
        pump_set(False)
        valve_set(False)

        self.pump_running = False
        self.measuring = False
        self.waiting_to_measure = False
        self.finished = True

    def _begin_measurement(self):
        self.osc.start(self.pressure)
        self.measuring = True
        print()
        print("STARTING PRESSURE MEASUREMENT...")

    def tick(self):
        if self.finished:
            return

        now = millis()
        if now - self.last_sample < SAMPLE_INTERVAL:
            return
        self.last_sample = now

        ok, self.raw, waited = self.adc.read()

        if not ok:
            print()
            print("ERROR: SENSOR TIMEOUT")
            self.stop()
            return

        self._announce_timing(waited)

        self.pressure = raw_to_mmhg(self.raw)
        if (not math.isfinite(self.pressure) or
                self.pressure < -5.0 or self.pressure > 250.0):
            print("ERROR: INVALID PRESSURE READING")
            self.stop()
            return

        # Stop inflation at the target pressure.
        if self.pump_running and self.pressure >= PUMP_OFF_PRESSURE:
            pump_set(False)
            self.pump_running = False
            self.waiting_to_measure = True
            self.pump_off_time = millis()

            print()
            print("PUMP OFF - WAITING 2 SECONDS")

        # Allow pressure to settle before measuring.
        if self.waiting_to_measure and millis() - self.pump_off_time >= SETTLE_TIME:
            self.waiting_to_measure = False
            self._begin_measurement()

        # Process the deflation phase.
        if not self.pump_running and not self.waiting_to_measure and self.measuring:
            self.osc.process(self.pressure)

            if self.pressure <= MEASURE_END_PRESSURE:
                self.measuring = False
                self.osc.compute()
                self.stop()

                print()
                print("MEASUREMENT FINISHED")
                print("SYSTEM STOPPED")

        self._live_print(waited)

    def _announce_timing(self, waited):
        if not DEBUG_TIMING or self.timing_announced:
            return

        interval = self.adc.last_interval_us
        if interval <= 0:
            return

        self.timing_announced = True
        print(f"DEBUG TM7711 first sample: ready after {waited} us, "
              f"conversion interval {interval} us "
              f"(~{1000000.0 / interval:.1f} Hz)", flush=True)

    def _live_print(self, waited):
        if millis() - self.last_live_print < 100:
            return
        self.last_live_print = millis()

        status = "DONE"
        if self.pump_running:
            status = "ON"
        elif self.waiting_to_measure:
            status = "WAIT"
        elif self.measuring:
            status = "OFF"

        interval = self.adc.last_interval_us
        rate = 1000000.0 / interval if interval > 0 else 0.0
        o = self.osc

        print(f"Raw:{self.raw} | P:{self.pressure:.1f} | SYS:{o.sys:.1f} "
              f"| DIA:{o.dia:.1f} | MAP:{o.map:.1f} | Amp:{o.pulse_amplitude:.3f} "
              f"| HR:{o.heart_rate:.1f} | Beats:{o.detected_beats} "
              f"| Envelope:{o.peak_count} | Pump:{status} "
              f"| Wait:{waited}us | Rate:{rate:.1f}Hz")

    def run(self):
        self.start()
        try:
            while not self.finished:
                self.tick()
                time.sleep(0.001)
        except KeyboardInterrupt:
            print("\nInterrupted.")
        finally:
            self.stop()
            GPIO.cleanup()


# ======================================================
# ACTUATOR SELF-TEST
# ======================================================

def test_actuators():
    """Pulse the pump and valve so wiring and polarity can be verified.

    Prints the pin level for each state so it can be compared against what the
    hardware actually does. If nothing moves, flip RELAYS_ACTIVE_LOW and rerun.
    """
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(PUMP, GPIO.OUT)
    GPIO.setup(VALVE, GPIO.OUT)

    pump_set(False)
    valve_set(False)

    print("================================================")
    print(" ACTUATOR SELF-TEST")
    print(f" Mode: {'ACTIVE-LOW' if RELAYS_ACTIVE_LOW else 'ACTIVE-HIGH'}"
          f" (RELAYS_ACTIVE_LOW={RELAYS_ACTIVE_LOW})")
    print(" Watch/listen to the pump and valve as each one")
    print(" is toggled. If nothing happens, flip")
    print(" RELAYS_ACTIVE_LOW at the top of this file and")
    print(" run `python bptest.py --test` again.")
    print("================================================")

    # Valve only first - safe, no pressure involved.
    print("\n-- VALVE: CLOSED for 3 s (relay energised) --", flush=True)
    valve_set(True)
    time.sleep(3)
    print("-- VALVE: OPEN for 3 s (relay released) --", flush=True)
    valve_set(False)
    time.sleep(3)

    # Pump only, with the valve OPEN so no pressure can build.
    print("\n-- PUMP: ON for 3 s, valve OPEN (no pressure build) --", flush=True)
    pump_set(True)
    time.sleep(3)
    print("-- PUMP: OFF --", flush=True)
    pump_set(False)

    print("\nSelf-test complete.", flush=True)
    GPIO.cleanup()


def main():
    if "--test" in sys.argv[1:]:
        test_actuators()
        return

    BloodPressureTest().run()


if __name__ == "__main__":
    main()
