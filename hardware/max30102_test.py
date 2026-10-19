#!/usr/bin/env python3
"""Quick MAX30102 test script for Raspberry Pi.

Usage:
    python3 max30102_test.py

Copy this file together with max30102.py into the same folder on the Pi.
Requires: smbus2, numpy (scipy optional).
"""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from max30102 import MAX30102

BUS = 1
DURATION = 10  # seconds


def main():
    print("Testing MAX30102...")

    try:
        sensor = MAX30102(bus=BUS)
    except Exception as e:
        print(f"FAIL: {e}")
        print("Check wiring and that I2C is enabled (sudo raspi-config).")
        return

    print(f"OK: sensor found at 0x{sensor.address:02X} on bus {BUS}")

    try:
        print(f"Chip temperature: {sensor.read_temperature():.2f} C")
    except Exception as e:
        print(f"Temperature read failed: {e}")

    print(f"Reading for {DURATION}s - place your finger on the sensor.\n")

    start = time.monotonic()
    while time.monotonic() - start < DURATION:
        reading = sensor.get_reading()

        if "error" in reading:
            print("I2C ERROR:", reading["error"])
            time.sleep(0.2)
            continue

        hr = reading["pulse_rate"] if reading["pulse_rate_valid"] else "--"
        spo2 = reading["spo2"] if reading["spo2_valid"] else "--"
        hand = "YES" if reading.get("hand_present", False) else "NO"

        print(
            f"hand={hand}  PR={hr:>3} BPM  SpO2={spo2:>3}%  "
            f"quality={reading['quality']:.2f}  "
            f"samples={reading['samples']:>3}  "
            f"new={reading.get('new_samples', 0):>2}  "
            f"overflow={reading.get('fifo_overflow', 0)}"
        )
        time.sleep(0.2)

    sensor.close()
    print("\nDone.")

if __name__ == "__main__":
    main()
