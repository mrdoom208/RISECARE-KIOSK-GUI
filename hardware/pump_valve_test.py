"""Standalone pump/valve relay test.

Toggles the BP pump and valve relays so wiring and polarity can be verified
without running a pressure cycle.

Wiring (BCM):
    Pump relay  -> GPIO22  (energised = running)
    Valve relay -> GPIO4   (energised = CLOSED)

Usage:
    python pump_valve_test.py                 pulse each relay once
    python pump_valve_test.py --active-high   invert polarity
    python pump_valve_test.py --loops 3       repeat the sequence
    python pump_valve_test.py --hold 5        seconds each state is held

If a relay never moves, flip the polarity (or pass --active-high) and rerun.
"""

import sys
import time

import RPi.GPIO as GPIO


# BCM pins (must match PINS.txt / bptest.py)
PUMP = 22
VALVE = 4

# Relay modules commonly energize on LOW. Change only if your board is active-high.
RELAYS_ACTIVE_LOW = True

HOLD_SECONDS = 3.0
LOOPS = 1


def relay_level(on, active_low):
    if active_low:
        return GPIO.LOW if on else GPIO.HIGH
    return GPIO.HIGH if on else GPIO.LOW


def pump_set(on, active_low):
    GPIO.output(PUMP, relay_level(on, active_low))


def valve_set(closed, active_low):
    GPIO.output(VALVE, relay_level(closed, active_low))


def run(active_low, hold, loops):
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(PUMP, GPIO.OUT, initial=relay_level(False, active_low))
    GPIO.setup(VALVE, GPIO.OUT, initial=relay_level(False, active_low))

    polarity = "ACTIVE-LOW" if active_low else "ACTIVE-HIGH"
    print("================================================")
    print(" PUMP / VALVE RELAY TEST")
    print(f" Polarity: {polarity}")
    print(f" PUMP=GPIO{PUMP}  VALVE=GPIO{VALVE}  hold={hold:.1f}s")
    print(" Watch/listen as each relay is toggled. If one never")
    print(" moves, rerun with --active-high (or flip the default).")
    print("================================================")

    try:
        for loop in range(1, loops + 1):
            print(f"\n=== loop {loop}/{loops} ===")

            print(f"-- VALVE: CLOSED for {hold:.1f}s "
                  f"(GPIO{VALVE}={relay_level(True, active_low)})", flush=True)
            valve_set(True, active_low)
            time.sleep(hold)

            print(f"-- VALVE: OPEN for {hold:.1f}s "
                  f"(GPIO{VALVE}={relay_level(False, active_low)})", flush=True)
            valve_set(False, active_low)
            time.sleep(hold)

            print(f"-- PUMP: ON for {hold:.1f}s, valve OPEN "
                  f"(GPIO{PUMP}={relay_level(True, active_low)})", flush=True)
            pump_set(True, active_low)
            time.sleep(hold)

            print(f"-- PUMP: OFF for {hold:.1f}s "
                  f"(GPIO{PUMP}={relay_level(False, active_low)})", flush=True)
            pump_set(False, active_low)
            time.sleep(hold)

        print("\nRelay test complete.", flush=True)
    except KeyboardInterrupt:
        print("\nStopped by user", flush=True)
    finally:
        pump_set(False, active_low)
        valve_set(False, active_low)
        GPIO.cleanup()


def _float_arg(args, name, default):
    if name in args:
        index = args.index(name)
        if index + 1 < len(args):
            try:
                return float(args[index + 1])
            except ValueError:
                pass
    return default


if __name__ == "__main__":
    args = sys.argv[1:]
    active_low = RELAYS_ACTIVE_LOW and "--active-high" not in args
    hold = _float_arg(args, "--hold", HOLD_SECONDS)
    loops = int(_float_arg(args, "--loops", LOOPS))
    run(active_low, hold, loops)
