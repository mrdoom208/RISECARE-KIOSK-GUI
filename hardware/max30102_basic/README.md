# Basic MAX30102 Raspberry Pi example

This folder is a standalone copy of the project MAX30102 driver and its basic calculation helper. It does not depend on files outside this folder.

## Files

- `max30102.py` — I2C driver, FIFO reader, signal processing, and hand-presence logic.
- `hrcalc.py` — small helper for estimating pulse rate and SpO2 from raw IR/red samples.
- `max30102_test.py` — terminal test for the driver's pulse rate, SpO2, signal quality, and hand detection.
- `requirements.txt` — Python packages needed to run the example.

## Requirements

Use this on a Raspberry Pi with I2C enabled and the MAX30102 connected to bus 1 at address `0x57`. SDA, SCL, power, and ground must be wired correctly for your specific breakout board.

Install the Python packages in an environment that can access the Raspberry Pi I2C device:

```sh
python3 -m pip install -r requirements.txt
```

Then run:

```sh
python3 max30102_test.py
```

The test uses `max30102.py`. `hrcalc.py` is included as a separate simple algorithm helper and is not called by that test script.

## Limitations

The pulse-rate and SpO2 results are experimental estimates from this project code. They are not medically validated and should not be used for diagnosis or treatment.
