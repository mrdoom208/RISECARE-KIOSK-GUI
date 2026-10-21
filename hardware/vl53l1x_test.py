#!/usr/bin/env python3
"""Standalone VL53L1X TOF distance/height diagnostic for Raspberry Pi.

Usage:
    python3 vl53l1x_test.py                 stream raw distance readings
    python3 vl53l1x_test.py --height         stream calculated height
    python3 vl53l1x_test.py --calibrate      calibrate sensor-to-floor distance
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import vl53l1x


if __name__ == "__main__":
    raise SystemExit(vl53l1x.main())
