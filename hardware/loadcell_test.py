#!/usr/bin/env python3
"""Standalone HX711 load-cell diagnostic/calibration for Raspberry Pi.

Usage:
    python3 loadcell_test.py                         stream raw ADC readings
    python3 loadcell_test.py --weight                stream calibrated weight
    python3 loadcell_test.py --stable-weight         stream filtered weight
    python3 loadcell_test.py --calibrate              tare, then calibrate with 1 kg
    python3 loadcell_test.py --calibrate --known-weight-grams 500
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import loadcell


def main():
    parser = argparse.ArgumentParser(description="Test or calibrate the HX711 load cell")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--raw", action="store_true", help="stream raw ADC counts (default)")
    mode.add_argument("--weight", action="store_true", help="stream calibrated weight in kg")
    mode.add_argument("--stable-weight", action="store_true", help="stream noise-filtered weight in kg")
    mode.add_argument("--calibrate", action="store_true", help="tare empty scale and calibrate with a known mass")
    parser.add_argument("--known-weight-grams", type=float, default=1000,
                        help="calibration mass in grams (default: 1000)")
    args = parser.parse_args()

    try:
        if not loadcell.sensor_available or not loadcell.setup():
            print("FAIL: HX711/load-cell sensor is unavailable")
            return 1

        if args.calibrate:
            if args.known_weight_grams <= 0:
                print("Known weight must be greater than zero grams")
                return 2
            print("Remove all weight from the scale.")
            input("Press Enter to tare the empty scale...")
            if loadcell.calibrate_tare() is None:
                return 1
            print(f"Place the {args.known_weight_grams:g} g calibration weight on the scale.")
            input("Press Enter when the weight is settled...")
            factor = loadcell.calibrate_finalize(args.known_weight_grams)
            return 0 if factor is not None else 1

        if args.weight and loadcell.calibration_factor is None:
            print("No calibration loaded. Run with --calibrate first.")
            return 1
        if args.stable_weight and loadcell.calibration_factor is None:
            print("No calibration loaded. Run with --calibrate first.")
            return 1

        label = "Weight (filtered)" if args.stable_weight else "Weight" if args.weight else "Raw"
        print(f"Streaming {label.lower()} readings. Ctrl+C to stop.")
        while True:
            try:
                if args.stable_weight:
                    value = loadcell.get_stable_weight()
                elif args.weight:
                    value = loadcell.get_weight()
                else:
                    value = loadcell._raw()
            except loadcell.SensorBusy:
                value = None

            if value is None:
                print(f"{label}: unavailable", flush=True)
            elif args.weight or args.stable_weight:
                print(f"{label}: {value:.2f} kg", flush=True)
            else:
                print(f"{label}: {value}", flush=True)
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nTest stopped")
        return 0
    except Exception as exc:
        print(f"Load-cell test failed: {exc}")
        return 1
    finally:
        if loadcell.sensor_available:
            loadcell.GPIO.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
