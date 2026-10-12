import math
import sys
import time

import RPi.GPIO as GPIO

# ======================================================
# PINS - RASPBERRY PI (BCM)
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
# TIMING
# ======================================================

SAMPLE_INTERVAL = 10       # ms
SETTLE_TIME = 2000         # ms

MIN_BEAT_INTERVAL = 300    # ms
MAX_BEAT_INTERVAL = 2000   # ms

PEAK_DROP_THRESHOLD = 0.010

# ======================================================
# TM7711 READY-WAIT / DEBUG
# The TM7711 only runs at 10 Hz or 40 Hz. At 10 Hz a new
# sample lands about every 100 ms, so the ready-wait must be
# much longer than that or it races the converter and always
# reports SENSOR TIMEOUT on otherwise-good wiring.
# ======================================================

TM7711_READY_TIMEOUT_US = 1000000   # 1 s (10x the 10 Hz period)
DEBUG_TIMING = True                 # print ready-wait / sample-rate info
DEBUG_SAMPLE_WINDOW = 200           # reads used to classify a stuck line

# ======================================================
# RELAY / ACTUATOR POLARITY
# Most cheap relay modules are ACTIVE-LOW: the GPIO pin must be
# pulled LOW to energise the relay (pump runs / valve closes).
# Set to False for an active-HIGH board or a bare transistor driver.
# Run `python bptest.py --test` to confirm which one your hardware uses.
# ======================================================

RELAYS_ACTIVE_LOW = True
DEBUG_ACTUATORS = True

# ======================================================
# FILTERING - INITIAL EXPERIMENTAL VALUES
# ======================================================

BASELINE_ALPHA = 0.05
OSC_FILTER_ALPHA = 0.25

# ======================================================
# PRESSURE AND SIGNAL VARIABLES
# ======================================================

pressure = 0.0
baseline = 0.0

oscillation = 0.0
filtered_oscillation = 0.0
previous_oscillation = 0.0

pulse_amplitude = 0.0

# ======================================================
# HEARTBEAT DETECTION
# ======================================================

last_beat_time = 0
last_confirmed_peak_time = 0
last_beat_interval = 0

heart_rate_bpm = 0.0

detected_beat_count = 0
rejected_beat_intervals = 0

# Track a trough and the following peak.
cycle_trough = 0.0
cycle_peak = 0.0

cycle_peak_pressure = 0.0
cycle_peak_time = 0

tracking_peak = False
have_trough = False

# ======================================================
# OSCILLOMETRIC ENVELOPE
# ======================================================

MAX_PEAKS = 80

peak_pressures = [0.0] * MAX_PEAKS
peak_amplitudes = [0.0] * MAX_PEAKS

peak_count = 0

max_amplitude = 0.0
map_pressure = 0.0
map_amplitude = 0.0

# ======================================================
# FINAL BP ESTIMATES
# ======================================================

SYS = 0.0
DIA = 0.0
MAP = 0.0

# ======================================================
# SYSTEM STATE
# ======================================================

pump_running = True
measuring = False
waiting_to_measure = False
finished = False

last_sample = 0
pump_off_time = 0
last_live_print = 0

# TM7711 ready-timing diagnostics.
last_ready_time = 0
last_ready_interval = 0
last_waited_us = 0
timing_announced = False


def millis():
    return int(time.monotonic() * 1000)


def micros():
    return int(time.perf_counter() * 1000000)


# ======================================================
# ACTUATORS - PUMP / VALVE
# Pump  : energised = running, released = stopped
# Valve : energised = CLOSED (holds pressure), released = OPEN (vents)
# The relay level is derived from RELAYS_ACTIVE_LOW so callers only
# deal in on/off, not HIGH/LOW.
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


# ======================================================
# SAFE STOP
# De-energise both actuators: pump OFF, valve OPEN (vent).
# ======================================================

def stop_system():
    global pump_running, measuring, waiting_to_measure, finished
    pump_set(False)
    valve_set(False)

    pump_running = False
    measuring = False
    waiting_to_measure = False
    finished = True


# ======================================================
# TM7711 READ WITH TIMEOUT
# ======================================================

def sample_out_line(samples=DEBUG_SAMPLE_WINDOW):
    """Read OUT_PIN repeatedly to tell a stuck line from a toggling one."""
    low = 0
    for _ in range(samples):
        if GPIO.input(OUT_PIN) == GPIO.LOW:
            low += 1
    return low, samples - low


def print_timeout_debug(elapsed):
    low, high = sample_out_line()
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
        "Check sensor VCC/GND, DOUT->OUT_PIN, SCK->SCK_PIN wiring, "
        "and that SCK is idle LOW.",
        flush=True,
    )


def read_tm7711():
    global last_ready_time, last_ready_interval, last_waited_us

    start = micros()

    while GPIO.input(OUT_PIN) == GPIO.HIGH:
        elapsed = micros() - start
        if elapsed > TM7711_READY_TIMEOUT_US:
            last_waited_us = elapsed
            print_timeout_debug(elapsed)
            return False, 0, elapsed

    ready_at = micros()
    waited = ready_at - start

    # Time between successive ready edges reveals the real sample rate:
    # ~100 ms => 10 Hz, ~25 ms => 40 Hz.
    last_ready_interval = ready_at - last_ready_time if last_ready_time else 0
    last_ready_time = ready_at
    last_waited_us = waited

    value = 0

    for _ in range(24):
        GPIO.output(SCK_PIN, GPIO.HIGH)
        time.sleep(0.000001)

        value = (value << 1) | (1 if GPIO.input(OUT_PIN) else 0)

        GPIO.output(SCK_PIN, GPIO.LOW)
        time.sleep(0.000001)

    # Extra clock pulse.
    GPIO.output(SCK_PIN, GPIO.HIGH)
    time.sleep(0.000001)
    GPIO.output(SCK_PIN, GPIO.LOW)

    # Convert 24-bit signed reading to signed 32-bit.
    if value & 0x800000:
        value |= 0xFF000000
    if value >= 0x80000000:
        value -= 0x100000000

    return True, value, waited


# ======================================================
# RAW READING TO mmHg
# ======================================================

def raw_to_mmhg(raw):
    return (raw - RAW_OFFSET) / RAW_PER_MMHG


# ======================================================
# RESET PROCESSING
# ======================================================

def reset_oscillation_processing():
    global oscillation, filtered_oscillation, previous_oscillation
    global pulse_amplitude, cycle_trough, cycle_peak
    global cycle_peak_pressure, cycle_peak_time, tracking_peak, have_trough
    global last_beat_time, last_confirmed_peak_time, last_beat_interval
    global heart_rate_bpm, detected_beat_count, rejected_beat_intervals
    global peak_count, max_amplitude, map_pressure, map_amplitude
    global SYS, DIA, MAP

    oscillation = 0.0
    filtered_oscillation = 0.0
    previous_oscillation = 0.0
    pulse_amplitude = 0.0

    cycle_trough = 0.0
    cycle_peak = 0.0
    cycle_peak_pressure = 0.0
    cycle_peak_time = 0

    tracking_peak = False
    have_trough = False

    last_beat_time = 0
    last_confirmed_peak_time = 0
    last_beat_interval = 0
    heart_rate_bpm = 0.0

    detected_beat_count = 0
    rejected_beat_intervals = 0

    peak_count = 0

    max_amplitude = 0.0
    map_pressure = 0.0
    map_amplitude = 0.0

    SYS = 0.0
    DIA = 0.0
    MAP = 0.0


# ======================================================
# START MEASUREMENT
# ======================================================

def start_measurement():
    global baseline, measuring
    reset_oscillation_processing()

    baseline = pressure
    measuring = True

    print()
    print("STARTING PRESSURE MEASUREMENT...")


# ======================================================
# VALIDATE ENVELOPE CANDIDATE
# ======================================================

def pulse_is_valid(amplitude, cuff_pressure):
    if amplitude < MIN_PULSE_AMPLITUDE:
        return False

    if (cuff_pressure <= MEASURE_END_PRESSURE or
            cuff_pressure >= PUMP_OFF_PRESSURE + 10.0):
        return False

    # Reject extreme amplitude changes.
    if peak_count > 0:
        previous_amp = peak_amplitudes[peak_count - 1]

        if previous_amp > 0.0:
            ratio = amplitude / previous_amp

            if (ratio > MAX_AMP_CHANGE_RATIO or
                    ratio < 1.0 / MAX_AMP_CHANGE_RATIO):
                return False

    return True


# ======================================================
# SAVE ENVELOPE RECORD
# ======================================================

def save_oscillation(amplitude, cuff_pressure):
    global peak_count, max_amplitude, map_pressure, map_amplitude

    if peak_count >= MAX_PEAKS:
        return

    if not pulse_is_valid(amplitude, cuff_pressure):
        return

    # Require pressure separation between records.
    if (peak_count > 0 and
            abs(cuff_pressure - peak_pressures[peak_count - 1])
            < MIN_PRESSURE_CHANGE):
        return

    peak_pressures[peak_count] = cuff_pressure
    peak_amplitudes[peak_count] = amplitude
    peak_count += 1

    if amplitude > max_amplitude:
        max_amplitude = amplitude
        map_pressure = cuff_pressure
        map_amplitude = amplitude


# ======================================================
# CONFIRM CANDIDATE HEARTBEAT
# ======================================================

def confirm_beat(amplitude, cuff_pressure, peak_time):
    global last_confirmed_peak_time, detected_beat_count
    global last_beat_interval, heart_rate_bpm, rejected_beat_intervals

    if amplitude < MIN_PULSE_AMPLITUDE:
        return

    # Record the oscillation independently of HR validation.
    save_oscillation(amplitude, cuff_pressure)

    # First peak establishes the timing reference.
    if last_confirmed_peak_time == 0:
        last_confirmed_peak_time = peak_time
        detected_beat_count += 1
        return

    interval = peak_time - last_confirmed_peak_time

    # Re-anchor even if this interval is rejected.
    last_confirmed_peak_time = peak_time

    if interval < MIN_BEAT_INTERVAL or interval > MAX_BEAT_INTERVAL:
        rejected_beat_intervals += 1
        return

    last_beat_interval = interval
    heart_rate_bpm = 60000.0 / interval
    detected_beat_count += 1


# ======================================================
# PROCESS PRESSURE AND DETECT OSCILLATIONS
# ======================================================

def process_pressure(p):
    global baseline, oscillation, filtered_oscillation, previous_oscillation
    global cycle_trough, cycle_peak, cycle_peak_pressure, cycle_peak_time
    global tracking_peak, have_trough, pulse_amplitude

    # Estimate the changing cuff-pressure trend.
    baseline = baseline * (1.0 - BASELINE_ALPHA) + p * BASELINE_ALPHA

    # Extract the pulsatile component.
    oscillation = p - baseline

    filtered_oscillation = (filtered_oscillation * (1.0 - OSC_FILTER_ALPHA) +
                            oscillation * OSC_FILTER_ALPHA)

    current = filtered_oscillation
    now = millis()

    # Initialize the first trough.
    if not have_trough:
        cycle_trough = current
        cycle_peak = current
        cycle_peak_pressure = p
        cycle_peak_time = now

        have_trough = True
        previous_oscillation = current
        return

    if not tracking_peak:
        # Find the lowest point before the next rise.
        if current < cycle_trough:
            cycle_trough = current

        # Begin tracking a candidate peak.
        if current > previous_oscillation:
            cycle_peak = current
            cycle_peak_pressure = p
            cycle_peak_time = now
            tracking_peak = True
    else:
        # Update the peak and its corresponding cuff pressure.
        if current > cycle_peak:
            cycle_peak = current
            cycle_peak_pressure = p
            cycle_peak_time = now

        # Confirm after the signal drops below the peak.
        if current < cycle_peak - PEAK_DROP_THRESHOLD:
            amplitude = cycle_peak - cycle_trough

            pulse_amplitude = amplitude

            confirm_beat(amplitude, cycle_peak_pressure, cycle_peak_time)

            # Start searching for the next cycle.
            cycle_trough = current
            cycle_peak = current
            cycle_peak_pressure = p
            cycle_peak_time = now

            tracking_peak = False

    previous_oscillation = current


# ======================================================
# INTERPOLATE PRESSURE AT TARGET AMPLITUDE
# ======================================================

def interpolate_pressure(p1, a1, p2, a2, target):
    if abs(a2 - a1) < 0.0001:
        return 0.0

    fraction = (target - a1) / (a2 - a1)

    if fraction < 0.0 or fraction > 1.0:
        return 0.0

    return p1 + fraction * (p2 - p1)


# ======================================================
# FIND A GENUINE TARGET CROSSING
# ======================================================

def find_pressure_at_target(target, systolic_side):
    for i in range(peak_count - 1):
        p1 = peak_pressures[i]
        a1 = peak_amplitudes[i]

        p2 = peak_pressures[i + 1]
        a2 = peak_amplitudes[i + 1]

        # Systolic crossing must be above MAP.
        if systolic_side:
            if p1 < map_pressure or p2 < map_pressure:
                continue
        else:
            # Diastolic crossing must be below MAP.
            if p1 > map_pressure or p2 > map_pressure:
                continue

        crosses = ((a1 <= target and a2 >= target) or
                   (a1 >= target and a2 <= target))

        if not crosses:
            continue

        result = interpolate_pressure(p1, a1, p2, a2, target)

        if result > 0.0:
            return result

    return 0.0


# ======================================================
# CHECK ENVELOPE DISTRIBUTION
# ======================================================

def envelope_has_enough_points():
    above_map = 0
    below_map = 0

    for i in range(peak_count):
        if peak_pressures[i] > map_pressure:
            above_map += 1
        elif peak_pressures[i] < map_pressure:
            below_map += 1

    print("POINTS ABOVE MAP:", above_map)
    print("POINTS BELOW MAP:", below_map)

    return above_map >= 4 and below_map >= 4


# ======================================================
# PRINT ENVELOPE DATA
# ======================================================

def print_envelope():
    print()
    print("PRESSURE,AMPLITUDE")

    for i in range(peak_count):
        print(f"{peak_pressures[i]:.1f},{peak_amplitudes[i]:.3f}")

    print("============================")


# ======================================================
# CALCULATE EXPERIMENTAL BP ESTIMATES
# ======================================================

def calculate_bp():
    global SYS, DIA, MAP, max_amplitude

    SYS = 0.0
    DIA = 0.0
    MAP = 0.0

    print()
    print("========== OSCILLOMETRIC DATA ==========")

    print("ENVELOPE RECORDS:", peak_count)
    print("DETECTED BEATS:", detected_beat_count)
    print("REJECTED BEAT INTERVALS:", rejected_beat_intervals)

    print("ESTIMATED HR: ", end="")
    if heart_rate_bpm > 0.0:
        print(f"{heart_rate_bpm:.1f} BPM")
    else:
        print("UNAVAILABLE")

    print(f"MAX AMP: {max_amplitude:.3f}")

    if peak_count < 5 or max_amplitude <= 0.0:
        print("RESULT: INVALID")
        print("REASON: INSUFFICIENT ENVELOPE DATA")
        print_envelope()
        return

    MAP = map_pressure

    print(f"MAP PRESSURE: {MAP:.1f}")

    if not envelope_has_enough_points():
        print("RESULT: INVALID")
        print("REASON: INSUFFICIENT DATA AROUND MAP")
        print_envelope()
        return

    sys_target = max_amplitude * SYS_RATIO
    dia_target = max_amplitude * DIA_RATIO

    SYS = find_pressure_at_target(sys_target, True)
    DIA = find_pressure_at_target(dia_target, False)

    print(f"SYS TARGET: {sys_target:.3f}")
    print(f"DIA TARGET: {dia_target:.3f}")
    print(f"SYS CROSSING: {SYS:.1f}")
    print(f"DIA CROSSING: {DIA:.1f}")

    valid = True

    if SYS <= 0.0 or DIA <= 0.0 or MAP <= 0.0:
        valid = False

    if not (SYS > MAP > DIA):
        valid = False

    if (SYS - DIA) < 10.0 or (SYS - DIA) > 150.0:
        valid = False

    print()
    print("========== RESULT ==========")

    if not valid:
        print("RESULT: INVALID")
        print("REASON: POOR OSCILLOMETRIC DATA")

        SYS = 0.0
        DIA = 0.0
        MAP = 0.0
    else:
        print(f"SYS: {SYS:.1f} mmHg")
        print(f"DIA: {DIA:.1f} mmHg")
        print(f"MAP: {MAP:.1f} mmHg")

        print("WARNING: EXPERIMENTAL ESTIMATES ONLY")

    print("============================")
    print_envelope()


# ======================================================
# SETUP
# ======================================================

def setup():
    global pump_running, last_sample, pump_off_time, last_live_print

    GPIO.setmode(GPIO.BCM)

    GPIO.setup(OUT_PIN, GPIO.IN)
    GPIO.setup(SCK_PIN, GPIO.OUT)
    GPIO.setup(PUMP, GPIO.OUT)
    GPIO.setup(VALVE, GPIO.OUT)

    # Force a known-safe idle state before energising anything.
    pump_set(False)
    valve_set(False)

    GPIO.output(SCK_PIN, GPIO.LOW)

    print(
        f"DEBUG relay polarity: "
        f"{'ACTIVE-LOW' if RELAYS_ACTIVE_LOW else 'ACTIVE-HIGH'} "
        f"(RELAYS_ACTIVE_LOW={RELAYS_ACTIVE_LOW})",
        flush=True,
    )
    print(
        f"DEBUG idle levels: DOUT(GPIO{OUT_PIN})="
        f"{GPIO.input(OUT_PIN)}, SCK(GPIO{SCK_PIN})={GPIO.input(SCK_PIN)}",
        flush=True,
    )

    # Start inflation with the valve closed.
    valve_set(True)
    pump_set(True)

    pump_running = True

    now = millis()
    last_sample = now
    pump_off_time = now
    last_live_print = now

    print()
    print("================================")
    print(" BLOOD PRESSURE PROTOTYPE")
    print("================================")
    print("PUMP STARTED")


# ======================================================
# MAIN LOOP
# ======================================================

def loop():
    global pressure, pump_running, waiting_to_measure, pump_off_time
    global measuring, last_sample, last_live_print, timing_announced

    if finished:
        return

    now = millis()

    if now - last_sample < SAMPLE_INTERVAL:
        return

    last_sample = now

    ok, raw, waited = read_tm7711()

    if not ok:
        print()
        print("ERROR: SENSOR TIMEOUT")

        stop_system()
        return

    # Announce the measured TM7711 sample rate once, so the operator can
    # confirm 10 Hz (~100 ms) vs 40 Hz (~25 ms) without guessing.
    if DEBUG_TIMING and not timing_announced and last_ready_interval > 0:
        timing_announced = True
        print(
            f"DEBUG TM7711 first sample: ready after {waited} us, "
            f"conversion interval {last_ready_interval} us "
            f"(~{1000000.0 / last_ready_interval:.1f} Hz)",
            flush=True,
        )

    pressure = raw_to_mmhg(raw)
    if (not math.isfinite(pressure) or pressure < -5.0 or pressure > 250.0):
        print("ERROR: INVALID PRESSURE READING")
        stop_system()
        return

    # Stop inflation at the target pressure.
    if pump_running and pressure >= PUMP_OFF_PRESSURE:
        pump_set(False)

        pump_running = False
        waiting_to_measure = True
        pump_off_time = millis()

        print()
        print("PUMP OFF - WAITING 2 SECONDS")

    # Allow pressure to settle before measurement.
    if waiting_to_measure and millis() - pump_off_time >= SETTLE_TIME:
        waiting_to_measure = False
        start_measurement()

    # Process the deflation phase.
    if not pump_running and not waiting_to_measure and measuring:
        process_pressure(pressure)

        if pressure <= MEASURE_END_PRESSURE:
            measuring = False

            calculate_bp()

            # Stop the pump and open the valve.
            stop_system()

            print()
            print("MEASUREMENT FINISHED")
            print("SYSTEM STOPPED")

    # Print live diagnostics at approximately 10 Hz,
    # rather than on every pressure sample.
    if millis() - last_live_print >= 100:
        last_live_print = millis()

        status = "DONE"
        if pump_running:
            status = "ON"
        elif waiting_to_measure:
            status = "WAIT"
        elif measuring:
            status = "OFF"

        rate = 1000000.0 / last_ready_interval if last_ready_interval > 0 else 0.0

        print(f"Raw:{raw} | P:{pressure:.1f} | SYS:{SYS:.1f} | DIA:{DIA:.1f} "
              f"| MAP:{MAP:.1f} | Amp:{pulse_amplitude:.3f} "
              f"| HR:{heart_rate_bpm:.1f} | Beats:{detected_beat_count} "
              f"| Envelope:{peak_count} | Pump:{status} "
              f"| Wait:{waited}us | Rate:{rate:.1f}Hz")


def test_actuators():
    """Pulse the pump and valve so wiring and polarity can be verified.

    Prints the pin level for each state, so you can compare it against what the
    hardware actually does. If nothing moves, flip RELAYS_ACTIVE_LOW at the top
    of this file and run the test again.
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

    setup()
    try:
        while not finished:
            loop()
            time.sleep(0.001)
    except KeyboardInterrupt:
        print("\nInterrupted.")
    finally:
        stop_system()
        GPIO.cleanup()


if __name__ == "__main__":
    main()
