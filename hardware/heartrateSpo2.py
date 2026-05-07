# install with: pip install max30102
# install with: pip install hrcalc and numpy
from max30102 import MAX30102
import hrcalc
import time

sensor = None


def setup():
    global sensor
    try:
        sensor = MAX30102()
        print("$\checkmark$ MAX30102 sensor initialized")
    except Exception as e:
        print(f"$\times$ Failed to initialize MAX30102: {e}")
        sensor = None

def get_reading():
    if sensor is None:
        print("$\times$ Sensor not initialized.")
        return 0, False, 0, False

    # Collect a window of samples (100 samples ~ 1-2 seconds)
    red, ir = sensor.read_sequential(samples=100)
    
    # Ensure the arrays are not empty
    if len(red) < 10 or len(ir) < 10:
        return 0, False, 0, False

    # This now correctly unpacks 4 values
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
