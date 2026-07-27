import RPi.GPIO as GPIO
import time

# Use GPIO 17 as a safe test pin
TEST_PIN = 17

GPIO.setmode(GPIO.BCM)
GPIO.setup(TEST_PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

print("Monitoring TX pin level... Press START on the Indoplas monitor.")

try:
    high_detected = False
    for _ in range(50):  # Monitor for ~5 seconds
        pin_state = GPIO.input(TEST_PIN)
        if pin_state == GPIO.HIGH:
            high_detected = True
            print("Signal Detected: HIGH (Logic '1')")
        time.sleep(0.1)

    if not high_detected:
        print("No HIGH signal detected. Try pressing START or check solder joint.")

finally:
    GPIO.cleanup()