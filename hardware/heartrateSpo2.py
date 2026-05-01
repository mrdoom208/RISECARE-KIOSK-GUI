# install with: pip install max30102
# install with: pip install hrcalc and numpy
import max30102
import hrcalc
import time

sensor = None


def setup():
    global sensor
    # GPIO pins are set to default (SDA=2, SCL=3).
    # 3.3 volts is recommended for the sensor. If using 5 volts, ensure to use a level shifter.
    sensor = max30102.MAX30102()
    print("✓ MAX30102 sensor initialized")


def get_reading():
    if sensor is None:
        print("❌ Sensor not initialized. Call setup() first!")
        return None, None, None, None

    red, ir = sensor.read_sequential()
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
