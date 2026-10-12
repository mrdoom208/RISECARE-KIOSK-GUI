
import time
import RPi.GPIO as GPIO

# Raspberry Pi BCM GPIO pins
DOUT_PIN = 17
SCK_PIN = 27

SAMPLES = 30
READY_TIMEOUT = 1.0

GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)

GPIO.setup(DOUT_PIN, GPIO.IN)
GPIO.setup(SCK_PIN, GPIO.OUT, initial=GPIO.LOW)


def wait_ready(timeout=READY_TIMEOUT):
    """Wait until DOUT goes LOW, indicating data is ready."""
    start = time.monotonic()

    while GPIO.input(DOUT_PIN) == GPIO.HIGH:
        if time.monotonic() - start >= timeout:
            return False
        time.sleep(0.0001)

    return True


def read_raw():
    """Read one 24-bit signed ADC value."""
    if not wait_ready():
        return None

    value = 0

    for _ in range(24):
        GPIO.output(SCK_PIN, GPIO.HIGH)
        time.sleep(0.000002)

        value = (value << 1) | GPIO.input(DOUT_PIN)

        GPIO.output(SCK_PIN, GPIO.LOW)
        time.sleep(0.000002)

    # One additional clock pulse for the next conversion.
    GPIO.output(SCK_PIN, GPIO.HIGH)
    time.sleep(0.000002)
    GPIO.output(SCK_PIN, GPIO.LOW)
    time.sleep(0.000002)

    # Convert 24-bit two's complement to signed integer.
    if value & 0x800000:
        value -= 0x1000000

    return value


try:
    print("====================================")
    print(" Raspberry Pi TM7711 Pressure Test")
    print("====================================")
    print(f"DOUT: GPIO {DOUT_PIN}")
    print(f"SCK : GPIO {SCK_PIN}")
    print("Pressurize/release the sensor gradually.")
    print("Press CTRL+C to stop.\n")

    count = 0
    time.sleep(0.1)

    while True:
        raw = read_raw()

        if raw is None:
            print("TIMEOUT: DOUT did not go LOW")
            continue

        count += 1

        print(
            f"Sample {count:04d} | "
            f"Raw: {raw:9d} | "
            f"Hex: 0x{raw & 0xFFFFFF:06X} | "
            f"DOUT idle: {GPIO.input(DOUT_PIN)}"
        )

        time.sleep(0.05)

except KeyboardInterrupt:
    print("\nTest stopped.")

finally:
    GPIO.output(SCK_PIN, GPIO.LOW)
    GPIO.cleanup()
    print("GPIO cleaned up.")
