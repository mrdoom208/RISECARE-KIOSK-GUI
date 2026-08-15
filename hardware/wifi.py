"""WiFi / network management via nmcli for the RISECARE kiosk.

Usage:
  python3 wifi.py status
  python3 wifi.py scan
  python3 wifi.py connect <ssid> [password]
  python3 wifi.py disconnect

Prints a single JSON document to stdout. On failure the document contains
an "error" key and the process exits with a non-zero code.

Requires NetworkManager (nmcli). When the current user lacks permission,
commands are retried with `sudo -n nmcli`.
"""
import json
import subprocess
import sys

NMCliError = RuntimeError


def _unescape(value):
    """Unescape nmcli terse output (e.g. '\\:' -> ':' and '\\\\' -> '\\')."""
    out = []
    i = 0
    while i < len(value):
        if value[i] == "\\" and i + 1 < len(value):
            out.append(value[i + 1])
            i += 2
        else:
            out.append(value[i])
            i += 1
    return "".join(out)


def _split(line):
    """Split one terse nmcli output line into escaped fields."""
    return [_unescape(part) for part in line.split(":")]


def _run(args, timeout=15):
    """Run nmcli, retrying with `sudo -n` when authorization is required."""
    try:
        proc = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout
        )
    except FileNotFoundError:
        return 1, "nmcli not found - is NetworkManager installed?"
    except subprocess.TimeoutExpired:
        return 1, "nmcli timed out"

    if proc.returncode == 0:
        return 0, proc.stdout

    stderr = (proc.stderr or proc.stdout) or ""
    low = stderr.lower()
    if any(
        token in low
        for token in ("permission", "not authorized", "authorization", "access denied")
    ):
        try:
            proc = subprocess.run(
                ["sudo", "-n"] + args, capture_output=True, text=True, timeout=timeout
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        else:
            if proc.returncode == 0:
                return 0, proc.stdout
            stderr = (proc.stderr or proc.stdout) or stderr

    return 1, stderr.strip()


def _active_device():
    """Return (device, type, connection) for the first connected wifi/ethernet device."""
    code, out = _run(
        ["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "dev", "status"]
    )
    if code != 0:
        raise NMCliError(out)
    for line in out.splitlines():
        parts = _split(line)
        if len(parts) < 4:
            continue
        device, dev_type, state, connection = parts[0], parts[1], parts[2], parts[3]
        if state == "connected" and dev_type in ("wifi", "ethernet"):
            return device, dev_type, connection or None
    return None, None, None


def cmd_status():
    device, dev_type, connection = _active_device()
    online = device is not None

    ip = None
    if device:
        code, out = _run(
            ["nmcli", "-t", "-f", "IP4.ADDRESS", "dev", "show", device], timeout=10
        )
        if code == 0:
            for line in out.splitlines():
                if ":" in line:
                    ip = _split(line)[1].split("/")[0]
                    break

    ssid = None
    signal = None
    if dev_type == "wifi" and device:
        code, out = _run(
            ["nmcli", "-t", "-f", "ACTIVE,SIGNAL,SSID", "dev", "wifi", "list"],
            timeout=10,
        )
        if code == 0:
            for line in out.splitlines():
                parts = _split(line)
                if len(parts) >= 3 and parts[0] == "yes":
                    ssid = parts[2] or None
                    try:
                        signal = int(parts[1])
                    except ValueError:
                        signal = None
                    break

    return {
        "online": online,
        "device": device,
        "type": dev_type,
        "ssid": ssid,
        "ip": ip,
        "signal": signal,
    }


def cmd_scan():
    code, out = _run(
        [
            "nmcli",
            "-t",
            "-f",
            "SSID,SIGNAL,SECURITY,IN-USE",
            "dev",
            "wifi",
            "list",
            "--rescan",
            "yes",
        ],
        timeout=25,
    )
    if code != 0:
        raise NMCliError(out)

    networks = []
    seen = set()
    for line in out.splitlines():
        parts = _split(line)
        if len(parts) < 4:
            continue
        ssid, sig, sec, in_use = parts[0], parts[1], parts[2], parts[3]
        if not ssid or ssid in seen:
            continue
        seen.add(ssid)
        try:
            signal = int(sig)
        except ValueError:
            signal = 0
        networks.append(
            {
                "ssid": ssid,
                "signal": signal,
                "security": sec or "Open",
                "inUse": in_use == "*",
            }
        )

    networks.sort(key=lambda n: (not n["inUse"], -n["signal"]))
    return {"networks": networks}


def cmd_connect(args):
    if len(args) < 1:
        raise NMCliError("ssid required")
    ssid = args[0]
    password = args[1] if len(args) > 1 else None

    nmcli_args = ["nmcli", "dev", "wifi", "connect", ssid]
    if password:
        nmcli_args += ["password", password]

    code, out = _run(nmcli_args, timeout=30)
    if code != 0:
        raise NMCliError(out or "Failed to connect to network")

    return {"success": True, "message": out.strip() or "Connected", "ssid": ssid}


def cmd_disconnect():
    device, dev_type, _connection = _active_device()
    if dev_type != "wifi" or not device:
        return {"success": True, "message": "No active Wi-Fi connection to disconnect"}

    code, out = _run(["nmcli", "dev", "disconnect", device], timeout=15)
    if code != 0:
        raise NMCliError(out or "Failed to disconnect")

    return {"success": True, "message": out.strip() or "Disconnected"}


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "status"
    try:
        if command == "status":
            result = cmd_status()
        elif command == "scan":
            result = cmd_scan()
        elif command == "connect":
            result = cmd_connect(sys.argv[2:])
        elif command == "disconnect":
            result = cmd_disconnect()
        else:
            result = {"error": "Unknown command: {}".format(command)}
    except NMCliError as exc:
        result = {"error": str(exc)}
    except Exception as exc:  # pragma: no cover
        result = {"error": str(exc)}

    print(json.dumps(result))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
