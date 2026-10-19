# MAX30102 Raspberry Pi example

This is a source snapshot of [doug-burrell/max30102](https://github.com/doug-burrell/max30102), cloned at commit `8b3fab09cbd157009e351a6d912a08fa0eea8f3d`.

## Files

- `max30102.py` — sensor I2C and FIFO driver.
- `hrcalc.py` — heart-rate and SpO2 calculation helper.
- `heartrate_monitor.py` — threaded monitor that reads the sensor and calls `hrcalc.py`.
- `main.py` — command-line runner.

## Raspberry Pi setup

The driver imports the system `smbus` module. Install it and NumPy with Raspberry Pi OS packages:

```sh
sudo apt update
sudo apt install python3-smbus python3-numpy
```

Enable I2C, wire the sensor to the Pi I2C pins, then run from this folder:

```sh
python3 main.py
```

For raw readings instead of calculated results:

```sh
python3 main.py --raw
```

The driver expects I2C bus 1 and address `0x57` by default. The upstream repository does not include a LICENSE file; check its reuse terms before redistributing this source publicly.

The HR and SpO2 values are estimates from the upstream hobby project and are not medically validated.
