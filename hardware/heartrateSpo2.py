from max30102 import MAX30102
import hrcalc
import time

sensor = None


def setup():
    global sensor
    try:
        sensor = MAX30102()
        print("\u2713 MAX30102 sensor initialized")
    except Exception as e:
        print(f"\u2717 Failed to initialize MAX30102: {e}")
        sensor = None


def enable():
    global sensor
    try:
        if sensor is None:
            sensor = MAX30102()
        else:
            sensor.setup()
    except Exception as e:
        print(f"\u2717 Failed to enable MAX30102: {e}")


def disable():
    global sensor
    if sensor is not None:
        try:
            sensor.shutdown()
        except Exception:
            pass


def get_reading():
    if sensor is None:
        return 0, False, 0, False

    red, ir = sensor.read_sequential(samples=50)

    if len(red) < 10 or len(ir) < 10:
        return 0, False, 0, False

    hr, hr_valid, spo2, spo2_valid = hrcalc.calc_hr_and_spo2(ir, red)

    return hr, hr_valid, spo2, spo2_valid


def read_continuous():
    print("Reading MAX30102... Place your finger on the sensor.")
    try:
        while True:
            hr, hr_valid, spo2, spo2_valid = get_reading()

            if hr_valid and spo2_valid:
                print(f"Heart Rate: {hr:.2f} bpm | SpO2: {spo2:.2f}%")
            else:
                print("No valid reading... Adjust finger.")

            time.sleep(1)

    except KeyboardInterrupt:
        print("Stopped.")
