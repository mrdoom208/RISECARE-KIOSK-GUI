#!/usr/bin/env python3
"""Standalone VL53L1X TOF distance/height diagnostic for Raspberry Pi on I2C bus 1.

Usage:
    python3 vl53l1x_bus1_test.py                 stream raw distance readings
    python3 vl53l1x_bus1_test.py --height         stream calculated height
    python3 vl53l1x_bus1_test.py --calibrate      calibrate sensor-to-floor distance
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vl53l1x


if __name__ == "__main__":
    # Use I2C bus 1 (hardware I2C on GPIO 2/3)
    vl53l1x.set_bus_number(1)
    raise SystemExit(vl53l1x.main())
