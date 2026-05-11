import time
from datetime import datetime

try:
    from escpos.printer import Usb
    from escpos.exceptions import DeviceNotFoundError
    printer_available = True
except ImportError:
    print("Warning: python-escpos not installed. Install with: pip install python-escpos")
    printer_available = False

USB_VENDOR_ID = 0x0FE6
USB_PRODUCT_ID = 0x811E

_printer = None


def find_printer():
    global _printer
    if not printer_available:
        print("❌ python-escpos not available")
        return None
    if _printer is not None:
        return _printer
    try:
        _printer = Usb(USB_VENDOR_ID, USB_PRODUCT_ID)
        print("✅ Thermal printer connected via USB")
        return _printer
    except DeviceNotFoundError:
        print("❌ Thermal printer not found via USB")
        return None
    except Exception as e:
        print(f"❌ Thermal printer init error: {e}")
        return None


def close_printer():
    global _printer
    if _printer is not None:
        try:
            _printer.close()
        except Exception:
            pass
        _printer = None


def print_receipt(data):
    p = find_printer()
    if p is None:
        print("⚠️ No printer available, skipping receipt")
        return False

    try:
        patient_name = data.get("patientName", "Patient")
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
        vitals = data.get("vitals", {})
        recommendation = data.get("recommendation", "")

        p.set(align="center", width=2, height=2, font="b")
        p.text("RiseCare Health\n")
        p.set(align="center", width=1, height=1, font="a")
        p.text("Health Kiosk Report\n")
        p.text("=" * 32 + "\n")

        p.set(align="left", width=1, height=1, font="a")
        p.text(f"Patient: {patient_name}\n")
        p.text(f"Date:    {date_str}\n")
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

        glucose = vitals.get("bloodGlucose")
        if glucose is not None:
            p.text(f"Blood Glucose:   {glucose} mmol/L\n")

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
            p.text(f"{recommendation}\n")

        p.text("=" * 32 + "\n")
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
        "vitals": {
            "heartRate": 72,
            "bloodPressureSystolic": 120,
            "bloodPressureDiastolic": 80,
            "oxygenSaturation": 98,
            "temperature": 36.6,
            "bloodGlucose": 5.2,
            "weight": 70.5,
            "height": 175,
            "bmi": 23.0
        },
        "recommendation": "All vitals are within normal ranges."
    }
    return print_receipt(test_data)
