#!/usr/bin/env python3
"""Standalone VL53L1X TOF distance/height diagnostic for Raspberry Pi on I2C bus 5.

The Adafruit driver used by vl53l1x.py talks to the Raspberry Pi hardware I2C
bus (bus 1) only, so this script reports that the requested bus is not
supported instead of failing with a traceback.

Usage:
    python3 vl53l1x_bus5_test.py                 stream raw distance readings
    python3 vl53l1x_bus5_test.py --height         stream calculated height
    python3 vl53l1x_bus5_test.py --calibrate      calibrate sensor-to-floor distance
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vl53l1x


if __name__ == "__main__":
    try:
        vl53l1x.set_bus_number(5)
    except ValueError as exc:
        print(f"FAIL: {exc}")
        raise SystemExit(1)
    raise SystemExit(vl53l1x.main())
