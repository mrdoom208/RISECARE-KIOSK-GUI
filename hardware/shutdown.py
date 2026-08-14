import os
import sys
import subprocess
import mqtt_client

COMMAND_TOPIC = "risecare/command/+"


def run(cmd):
    try:
        subprocess.run(cmd, check=False)
    except Exception as e:
        print(f"Failed to run {cmd}: {e}")


def on_command(sensor, session_id, value, payload):
    if sensor == "shutdown":
        print("Shutdown command received. Shutting down system...")
        run(["sudo", "shutdown", "-h", "now"])
    elif sensor == "restart":
        print("Restart command received. Restarting system...")
        run(["sudo", "shutdown", "-r", "now"])
    elif sensor == "lock":
        print("Lock command received. Locking screen...")
        run(["loginctl", "lock-session"])
    else:
        print(f"Unknown power command: {sensor}")


def main():
    print("Starting power command listener...")
    mqtt_client.connect()
    if not mqtt_client.wait_for_connection(timeout=10):
        print("Failed to connect to MQTT broker.")
        sys.exit(1)

    mqtt_client.set_command_callback(on_command)
    print(f"Listening for power commands on {COMMAND_TOPIC}")

    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down listener...")
    finally:
        mqtt_client.disconnect()


if __name__ == "__main__":
    main()
