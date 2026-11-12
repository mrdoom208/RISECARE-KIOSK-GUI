#!/usr/bin/env python3
"""Exclusively grab every /dev/input/event* device for a few seconds.

Meant to run at kiosk launch so the keyboard, mouse and touchscreen are dead
while the server boots. The user running it must be able to read /dev/input,
e.g. be in the "input" group.
"""

import argparse
import fcntl
import glob
import os
import sys
import time

EVIOCGRAB = 0x40044590  # _IOW('E', 0x90, int)


def _name(path):
    try:
        with open(f"/sys/class/input/{os.path.basename(path)}/device/name", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return "unknown"


def _grab(path):
    """Grab the device and return its fd, or None when it cannot be grabbed."""
    try:
        fd = os.open(path, os.O_RDONLY)
    except OSError as exc:
        print(f"skip {path}: {exc}", file=sys.stderr, flush=True)
        return None
    try:
        fcntl.ioctl(fd, EVIOCGRAB, 1)
    except OSError as exc:
        os.close(fd)
        print(f"skip {path}: {exc}", file=sys.stderr, flush=True)
        return None
    return fd


def main():
    parser = argparse.ArgumentParser(description="Block Linux input devices for a few seconds.")
    parser.add_argument("seconds", nargs="?", type=float, default=10.0, help="hold time (default: 10)")
    parser.add_argument("--check", action="store_true", help="list the devices without holding them")
    args = parser.parse_args()

    fds = {}
    try:
        for path in sorted(glob.glob("/dev/input/event*")):
            fd = _grab(path)
            if fd is None:
                continue
            if args.check:
                fcntl.ioctl(fd, EVIOCGRAB, 0)
                os.close(fd)
                print(f"would grab {path} ({_name(path)})")
            else:
                fds[path] = fd
                print(f"grabbed {path} ({_name(path)})", flush=True)

        if args.check:
            return
        if not fds:
            sys.exit("no input devices could be grabbed; is the user in the input group?")
        print(f"holding {len(fds)} device(s) for {args.seconds:g}s", flush=True)
        time.sleep(max(args.seconds, 0))
    finally:
        for fd in fds.values():
            try:
                fcntl.ioctl(fd, EVIOCGRAB, 0)
            except OSError:
                pass
            os.close(fd)
        if fds:
            print("released", flush=True)


if __name__ == "__main__":
    main()
