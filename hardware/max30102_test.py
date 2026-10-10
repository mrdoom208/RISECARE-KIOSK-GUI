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
    sensor = MAX30102(bus=BUS)

    if sensor.handle is None:
        print("FAIL: sensor not found. Check wiring and I2C is enabled.")
        return

    print(f"OK: sensor found at 0x{sensor.address:02X} on bus {BUS}")
    print(f"Reading for {DURATION}s - place your finger on the sensor.\n")

    start = time.monotonic()
    while time.monotonic() - start < DURATION:
        hr, hr_valid, spo2, spo2_valid = sensor.get_reading()
        diag = sensor.get_signal_diagnostics()
        print(
            f"IR={diag['ir'] or 0:>7} Red={diag['red'] or 0:>7} "
            f"samples={diag['samples']:>3} | "
            f"HR={hr:>3} {'OK ' if hr_valid else '-- '} "
            f"SpO2={spo2:>3} {'OK' if spo2_valid else '--'}"
        )
        time.sleep(0.5)

    sensor.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
