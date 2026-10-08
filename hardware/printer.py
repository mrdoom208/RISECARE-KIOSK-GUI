import time
import threading
import textwrap
import unicodedata
from datetime import datetime

try:
    from escpos.printer import Usb
    from escpos.exceptions import DeviceNotFoundError
    printer_available = True
except ImportError:
    print("Warning: python-escpos not installed. Install with: pip install python-escpos")
    printer_available = False

try:
    import usb.core
    import usb.util
    usb_available = True
except ImportError:
    usb_available = False

USB_VENDOR_ID = 0x0416
USB_PRODUCT_ID = 0x5011

_printer = None
_status_readable = True

# The escpos device is not safe for concurrent USB traffic. Status checks run
# on the background probe thread while printing runs on the command thread.
_lock = threading.Lock()


def _receipt_text(value, width=32):
    normalized = unicodedata.normalize("NFKD", str(value))
    normalized = normalized.replace("\u2014", "-").replace("\u2013", "-")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    lines = []
    for paragraph in ascii_text.splitlines():
        if not paragraph.strip():
            lines.append("")
        else:
            lines.extend(textwrap.wrap(paragraph, width=width) or [""])
    return "\n".join(lines) + "\n"


def _detect_endpoints():
    """Return (in_ep, out_ep, detected) for the printer's configuration.

    python-escpos assumes in_ep=0x82 / out_ep=0x01. When the printer exposes
    different addresses, paper_status() raises "Invalid endpoint address 0x82".
    """
    if not usb_available:
        return None, None, False
    try:
        dev = usb.core.find(idVendor=USB_VENDOR_ID, idProduct=USB_PRODUCT_ID)
    except Exception as e:
        print(f"⚠️ USB endpoint scan failed: {e}")
        return None, None, False
    if dev is None:
        return None, None, False

    try:
        try:
            cfg = dev.get_active_configuration()
        except usb.core.USBError:
            cfg = dev[0]
        interfaces = sorted(
            list(cfg), key=lambda i: (i.bInterfaceClass != 7, i.bInterfaceNumber)
        )
        in_ep = out_ep = None
        for intf in interfaces:
            for ep in intf:
                addr = ep.bEndpointAddress
                if usb.util.endpoint_direction(addr) == usb.util.ENDPOINT_IN:
                    if in_ep is None:
                        in_ep = addr
                elif out_ep is None:
                    out_ep = addr
            if in_ep is not None and out_ep is not None:
                break
        return in_ep, out_ep, True
    except Exception as e:
        print(f"⚠️ USB endpoint scan failed: {e}")
        return None, None, False
    finally:
        try:
            usb.util.dispose_resources(dev)
        except Exception:
            pass


def _is_disconnected(exc):
    """True when the printer is physically gone, not just unreadable."""
    text = str(exc).lower()
    if "not found" in text or "no such device" in text or "entity not found" in text:
        return True
    return getattr(exc, "errno", None) in (19, 6, -4)


def find_printer():
    global _printer, _status_readable
    if not printer_available:
        print("❌ python-escpos not available")
        return None
    if _printer is not None:
        return _printer
    in_ep, out_ep, detected = _detect_endpoints()
    _status_readable = not detected or in_ep is not None
    kwargs = {}
    if in_ep is not None:
        kwargs["in_ep"] = in_ep
    if out_ep is not None:
        kwargs["out_ep"] = out_ep
    try:
        p = Usb(USB_VENDOR_ID, USB_PRODUCT_ID, **kwargs)
        # python-escpos 3.x opens the device lazily, so Usb() succeeds even with
        # no printer attached. Force it open now so "connected" is truthful.
        if hasattr(p, "open"):
            p.open()
        _printer = p
        print(
            "✅ Thermal printer connected via USB "
            f"(in=0x{in_ep:02x}, out=0x{out_ep:02x})"
            if detected and in_ep is not None and out_ep is not None
            else "✅ Thermal printer connected via USB"
        )
        return _printer
    except DeviceNotFoundError:
        print("❌ Thermal printer not found via USB")
        return None
    except Exception as e:
        print(f"❌ Thermal printer init error: {e}")
        return None


def close_printer():
    global _printer, _status_readable
    if _printer is not None:
        try:
            _printer.close()
        except Exception:
            pass
        _printer = None
    _status_readable = True


def printer_status():
    with _lock:
        return _printer_status()


def _printer_status():
    p = find_printer()
    if p is None:
        return {"connected": False, "paper": False, "paperStatus": "unknown"}
    if not _status_readable:
        return {"connected": True, "paper": True, "paperStatus": "unknown"}
    try:
        status = p.paper_status()
        value = getattr(status, "value", status)
        if value == 0:
            return {"connected": True, "paper": False, "paperStatus": "empty"}
        if value == 1:
            return {"connected": True, "paper": True, "paperStatus": "low"}
        if value == 2:
            return {"connected": True, "paper": True, "paperStatus": "ok"}
        return {"connected": True, "paper": True, "paperStatus": "unknown"}
    except Exception as e:
        if _is_disconnected(e):
            print(f"❌ Thermal printer disconnected: {e}")
            close_printer()
            return {"connected": False, "paper": False, "paperStatus": "unknown"}
        print(f"⚠️ Printer paper status check failed: {e}")
        return {"connected": True, "paper": True, "paperStatus": "unknown"}


def print_receipt(data):
    with _lock:
        return _print_receipt(data)


def _print_receipt(data):
    p = find_printer()
    if p is None:
        print("⚠️ No printer available, skipping receipt")
        return False

    try:
        patient_name = data.get("patientName", "Patient")
        patient_phone = data.get("patientPhone")
        patient_age = data.get("patientAge")
        patient_gender = data.get("patientGender")
        session_token = data.get("token", "")
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        vitals = data.get("vitals", {})
        recommendation = data.get("recommendation", "")

        p.set(align="center", width=2, height=2, font="b")
        p.text("RiseCare Health\n")
        p.set(align="center", width=1, height=1, font="a")
        p.text("Health Kiosk Report\n")
        p.text("=" * 32 + "\n")

        p.set(align="left", width=1, height=1, font="a")
        p.text(f"Name:  {patient_name}\n")
        if patient_phone:
            p.text(f"Phone: {patient_phone}\n")
        if patient_age:
            p.text(f"Age:   {patient_age}\n")
        if patient_gender:
            label = patient_gender.replace("_", " ").title() if isinstance(patient_gender, str) else str(patient_gender)
            p.text(f"Sex:   {label}\n")
        if session_token:
            p.text(f"Token: {session_token}\n")
        p.text(f"Date:  {date_str}\n")
        p.text("-" * 32 + "\n")

        p.set(align="center", width=1, height=1, font="b")
        p.text("VITAL SIGNS\n")
        p.set(align="left", width=1, height=1, font="a")

        hr = vitals.get("heartRate")
        if hr is not None:
            p.text(f"Heart Rate:      {hr} bpm\n")

        bp_sys = vitals.get("bloodPressureSystolic")
        bp_dia = vitals.get("bloodPressureDiastolic")
        if bp_sys is not None and bp_dia is not None:
            p.text(f"Blood Pressure:  {bp_sys}/{bp_dia} mmHg\n")

        spo2 = vitals.get("oxygenSaturation")
        if spo2 is not None:
            p.text(f"SpO2:            {spo2}%\n")

        temp = vitals.get("temperature")
        if temp is not None:
            p.text(f"Temperature:     {temp} C\n")

        weight = vitals.get("weight")
        if weight is not None:
            p.text(f"Weight:          {weight} kg\n")

        height = vitals.get("height")
        if height is not None:
            p.text(f"Height:          {height} cm\n")

        bmi = vitals.get("bmi")
        if bmi is not None:
            p.text(f"BMI:             {bmi} kg/m2\n")

        p.text("-" * 32 + "\n")

        if recommendation:
            p.set(align="center", width=1, height=1, font="b")
            p.text("ASSESSMENT\n")
            p.set(align="left", width=1, height=1, font="a")
            p.text(_receipt_text(recommendation))

        p.text("=" * 32 + "\n")
        p.set(align="center", width=1, height=1, font="b")
        p.text("DISCLAIMER\n")
        p.set(align="left", width=1, height=1, font="a")
        p.text(_receipt_text(
            "This report is a screening summary, not a diagnosis. General adult screening thresholds are shown for all ages; pediatric readings need age-specific clinical interpretation. The SpO2 value is an unvalidated screening estimate. Confirm concerning readings with a qualified healthcare professional."
        ))
        p.text("-" * 32 + "\n")
        p.set(align="center", width=1, height=1, font="a")
        p.text("Thank you for using RiseCare!\n")
        p.text(f"{date_str}\n")
        p.text("\n\n\n")

        p.cut()
        print("✅ Receipt printed successfully")
        return True

    except Exception as e:
        print(f"❌ Print error: {e}")
        return False


def test_print():
    test_data = {
        "patientName": "Test Patient",
        "patientPhone": "639123456789",
        "patientAge": 30,
        "patientGender": "male",
        "token": "ABC123",
        "vitals": {
            "heartRate": 72,
            "bloodPressureSystolic": 120,
            "bloodPressureDiastolic": 80,
            "oxygenSaturation": 98,
            "temperature": 36.6,
            "weight": 70.5,
            "height": 175,
            "bmi": 23.0
        },
        "recommendation": "All vitals are within normal ranges."
    }
    return print_receipt(test_data)
