import os
import sys
import subprocess
import mqtt_client

COMMAND_TOPIC = "risecare/command/+"


def run(commands):
    """Run the first power command that succeeds."""
    for cmd in commands:
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        except Exception as e:
            print(f"Failed to run {cmd}: {e}")
            continue
        if result.returncode == 0:
            return True
        detail = (result.stderr or result.stdout or "").strip()
        print(f"Command {cmd} failed ({result.returncode}): {detail}")
    return False


def on_command(sensor, session_id, value, payload):
    if sensor == "shutdown":
        print("Shutdown command received. Shutting down system...")
        run((["sudo", "shutdown", "-h", "now"],
             ["sudo", "systemctl", "poweroff"],
             ["sudo", "poweroff"]))
    elif sensor == "restart":
        print("Restart command received. Restarting system...")
        # The sudoers rule that allows `shutdown` may not allow `reboot`, so
        # reuse the working shutdown binary and fall back to systemd/reboot.
        run((["sudo", "shutdown", "-r", "now"],
             ["sudo", "systemctl", "reboot"],
             ["sudo", "reboot"]))
    elif sensor == "lock":
        print("Lock command received. Locking screen...")
        run((["loginctl", "lock-session"],))
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
