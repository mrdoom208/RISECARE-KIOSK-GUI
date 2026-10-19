import time
import json
import os
import threading

VL53L1X_I2C_ADDR = 0x29
VL53L1X_DEFAULT_ADDRESS = 0x29

VL53L1X_SOFT_RESET = 0x0000
VL53L1X_VHV_CONFIG__TIMEOUT_MACROP_LOOP_BOUND = 0x0008
VL53L1X_ALGO__CROSSTALK_COMPENSATION_PLANE_OFFSET_KCPS = 0x0016
VL53L1X_ALGO__CROSSTALK_COMPENSATION_X_PLANE_GRADIENT_KCPS = 0x0018
VL53L1X_ALGO__CROSSTALK_COMPENSATION_Y_PLANE_GRADIENT_KCPS = 0x001A
VL53L1X_ALGO__PART_TO_PART_RANGE_OFFSET_MM = 0x001E
VL53L1X_MM_CONFIG__INNER_OFFSET_MM = 0x0020
VL53L1X_MM_CONFIG__OUTER_OFFSET_MM = 0x0022
VL53L1X_GPIO_HV_MUX__CTRL = 0x0030
VL53L1X_GPIO__TIO_HV_STATUS = 0x0031
VL53L1X_SYSTEM__INTERRUPT_CONFIG_GPIO = 0x0046
VL53L1X_PHASECAL_CONFIG__TIMEOUT_MACROP = 0x004B
VL53L1X_RANGE_CONFIG__TIMEOUT_MACROP_A_HI = 0x005E
VL53L1X_RANGE_CONFIG__VCSEL_PERIOD_A = 0x0060
VL53L1X_RANGE_CONFIG__VCSEL_PERIOD_B = 0x0063
VL53L1X_RANGE_CONFIG__VALID_PHASE_HIGH = 0x0069
VL53L1X_SD_CONFIG__WOI_SD0 = 0x0078
VL53L1X_SD_CONFIG__WOI_SD1 = 0x0079
VL53L1X_SD_CONFIG__INITIAL_PHASE_SD0 = 0x007A
VL53L1X_SD_CONFIG__INITIAL_PHASE_SD1 = 0x007B
VL53L1X_ROI_CONFIG__USER_ROI_CENTRE_SPAD = 0x007F
VL53L1X_ROI_CONFIG__USER_ROI_REQUESTED_GLOBAL_XY_SIZE = 0x0080
VL53L1X_SYSTEM__SEQUENCE_CONFIG = 0x0081
VL53L1X_SYSTEM__GROUPED_PARAMETER_HOLD = 0x0082
VL53L1X_SYSTEM__INTERRUPT_CLEAR = 0x0086
VL53L1X_SYSTEM__MODE_START = 0x0087
VL53L1X_VL53L1X_RESULT__RANGE_STATUS = 0x0089
VL53L1X_RESULT__DSS_ACTUAL_EFFECTIVE_SPADS_SD0 = 0x008C
VL53L1X_RESULT__AMBIENT_COUNT_RATE_MCPS_SD = 0x0090
VL53L1X_RESULT__FINAL_CROSSTALK_CORRECTED_RANGE_MM_SD0 = 0x0096
VL53L1X_RESULT__PEAK_SIGNAL_COUNT_RATE_CROSSTALK_CORRECTED_MCPS_SD0 = 0x0098
VL53L1X_RESULT__RANGE_MM = 0x009E
VL53L1X_IDENTIFICATION__MODEL_ID = 0x010F
VL53L1X_IDENTIFICATION__MODULE_TYPE = 0x0110
VL53L1X_IDENTIFICATION__REVISION_ID = 0x0111

MIN_DISTANCE_CM = 2
MAX_DISTANCE_CM = 400
CALIBRATION_SAMPLES = 11
MIN_CALIBRATION_READINGS = 7

TOTAL_HEIGHT = None
i2c_available = False
sensor_available = False
bus = None
_bus_number = 1

hw_lock = threading.Lock()

try:
    from smbus2 import SMBus
    i2c_available = True
except ImportError:
    print("Warning: smbus2 not available, VL53L1X sensor disabled")

CALIBRATION_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "calibration.json"
)


def set_bus_number(bus_num):
    global _bus_number, bus
    _bus_number = bus_num
    if bus is not None:
        try:
            bus.close()
        except Exception:
            pass
        bus = None


def _ensure_bus():
    global bus
    if not i2c_available:
        return False
    if bus is None:
        try:
            bus = SMBus(_bus_number)
            print(f"✅ I2C bus {_bus_number} initialized (VL53L1X)")
        except Exception as e:
            print(f"❌ I2C bus {_bus_number} init failed: {e}")
            bus = None
            return False
    return True


def _write_reg(reg, value):
    if bus is None:
        return False
    try:
        bus.write_word_data(VL53L1X_I2C_ADDR, reg, value)
        return True
    except Exception as e:
        print(f"⚠️ Write reg 0x{reg:04X} failed: {e}")
        return False


def _read_reg(reg):
    if bus is None:
        return None
    try:
        return bus.read_word_data(VL53L1X_I2C_ADDR, reg)
    except Exception as e:
        print(f"⚠️ Read reg 0x{reg:04X} failed: {e}")
        return None


def _read_byte(reg):
    if bus is None:
        return None
    try:
        return bus.read_byte_data(VL53L1X_I2C_ADDR, reg)
    except Exception as e:
        print(f"⚠️ Read byte reg 0x{reg:02X} failed: {e}")
        return None


def _write_byte(reg, value):
    if bus is None:
        return False
    try:
        bus.write_byte_data(VL53L1X_I2C_ADDR, reg, value)
        return True
    except Exception as e:
        print(f"⚠️ Write byte reg 0x{reg:02X} failed: {e}")
        return False


def _init_sensor():
    if not _ensure_bus():
        return False

    model_id = _read_byte(VL53L1X_IDENTIFICATION__MODEL_ID)
    print(f"Debug: Read model_id from 0x{VL53L1X_IDENTIFICATION__MODEL_ID:04X} = 0x{model_id:02X if model_id is not None else 'None'}")
    
    module_type = _read_byte(VL53L1X_IDENTIFICATION__MODULE_TYPE)
    print(f"Debug: Read module_type from 0x{VL53L1X_IDENTIFICATION__MODULE_TYPE:04X} = 0x{module_type:02X if module_type is not None else 'None'}")
    
    revision_id = _read_byte(VL53L1X_IDENTIFICATION__REVISION_ID)
    print(f"Debug: Read revision_id from 0x{VL53L1X_IDENTIFICATION__REVISION_ID:04X} = 0x{revision_id:02X if revision_id is not None else 'None'}")

    if model_id != 0xEA:
        print(f"⚠️ VL53L1X not detected (model_id=0x{model_id:02X}, expected 0xEA)")
        return False

    print(f"✅ VL53L1X detected (model_id=0xEA, revision=0x{revision_id:02X})")

    _write_byte(VL53L1X_SOFT_RESET, 0x00)
    time.sleep(0.01)
    _write_byte(VL53L1X_SOFT_RESET, 0x01)
    time.sleep(0.1)

    for _ in range(100):
        if _read_byte(0x0000) == 0x01:
            break
        time.sleep(0.01)
    else:
        print("⚠️ Boot timeout")
        return False

    _write_byte(0x002D, 0x01)
    _write_byte(0x002E, 0x01)
    _write_byte(0x002F, 0x01)
    _write_byte(0x0030, 0x01)
    _write_byte(0x0031, 0x01)
    _write_byte(0x0032, 0x01)
    _write_byte(0x0033, 0x01)
    _write_byte(0x0034, 0x01)
    _write_byte(0x0035, 0x01)
    _write_byte(0x0036, 0x01)
    _write_byte(0x0037, 0x01)

    _write_byte(0x004A, 0x08)
    _write_byte(0x004B, 0x06)
    _write_byte(0x004C, 0x06)
    _write_byte(0x004D, 0x0A)
    _write_byte(0x004E, 0x0A)

    _write_byte(VL53L1X_RANGE_CONFIG__VCSEL_PERIOD_A, 0x07)
    _write_byte(VL53L1X_RANGE_CONFIG__VCSEL_PERIOD_B, 0x05)
    _write_byte(VL53L1X_RANGE_CONFIG__VALID_PHASE_HIGH, 0x38)

    _write_word(VL53L1X_SD_CONFIG__WOI_SD0, 0x0705)
    _write_word(VL53L1X_SD_CONFIG__WOI_SD1, 0x0705)
    _write_word(VL53L1X_SD_CONFIG__INITIAL_PHASE_SD0, 0x0606)
    _write_word(VL53L1X_SD_CONFIG__INITIAL_PHASE_SD1, 0x0606)

    _write_byte(VL53L1X_SYSTEM__SEQUENCE_CONFIG, 0x01)
    _write_byte(VL53L1X_SYSTEM__GROUPED_PARAMETER_HOLD, 0x01)
    _write_byte(VL53L1X_ROI_CONFIG__USER_ROI_CENTRE_SPAD, 0x7F)
    _write_byte(VL53L1X_ROI_CONFIG__USER_ROI_REQUESTED_GLOBAL_XY_SIZE, 0x0F)

    _write_byte(0x0080, 0x01)
    _write_byte(0x0081, 0x00)
    _write_byte(0x0082, 0x00)
    _write_byte(0x0083, 0x00)

    _write_byte(VL53L1X_SYSTEM__MODE_START, 0x40)
    time.sleep(0.1)

    return True


def _write_word(reg, value):
    if bus is None:
        return False
    try:
        bus.write_word_data(VL53L1X_I2C_ADDR, reg, value)
        return True
    except Exception as e:
        print(f"⚠️ Write word reg 0x{reg:04X} failed: {e}")
        return False


def probe(samples=5):
    if not _ensure_bus():
        return False
    for _ in range(samples):
        d = measure_distance()
        if _is_valid_distance(d):
            return True
        time.sleep(0.1)
    return False


def setup():
    global sensor_available
    if not _init_sensor():
        sensor_available = False
        raise RuntimeError("VL53L1X initialization failed")
    sensor_available = probe()
    if not sensor_available:
        print("⚠️ VL53L1X sensor not responding — sensor may not be connected")
        return False
    print("✅ VL53L1X sensor initialized")
    return True


def measure_distance():
    global bus
    if not i2c_available or not _ensure_bus():
        return None
    if not hw_lock.acquire(blocking=False):
        return None
    try:
        _write_byte(VL53L1X_SYSTEM__MODE_START, 0x40)
        time.sleep(0.05)

        for _ in range(50):
            status = _read_byte(VL53L1X_VL53L1X_RESULT__RANGE_STATUS)
            if status is not None and (status & 0x07) == 0:
                break
            time.sleep(0.01)
        else:
            return None

        range_mm = _read_word(VL53L1X_RESULT__RANGE_MM)
        if range_mm is None:
            return None

        _write_byte(VL53L1X_SYSTEM__INTERRUPT_CLEAR, 0x01)

        distance_cm = range_mm / 10.0
        return round(distance_cm, 2)
    finally:
        hw_lock.release()


def _read_word(reg):
    if bus is None:
        return None
    try:
        return bus.read_word_data(VL53L1X_I2C_ADDR, reg)
    except Exception as e:
        print(f"⚠️ Read word reg 0x{reg:04X} failed: {e}")
        return None


def _is_valid_distance(distance):
    return distance is not None and MIN_DISTANCE_CM <= distance <= MAX_DISTANCE_CM


def _average_readings(readings):
    sorted_readings = sorted(readings)
    if len(sorted_readings) >= 3:
        sorted_readings = sorted_readings[1:-1]
    return sum(sorted_readings) / len(sorted_readings)


def _median_readings(readings):
    sorted_readings = sorted(readings)
    middle = len(sorted_readings) // 2
    if len(sorted_readings) % 2:
        return sorted_readings[middle]
    return (sorted_readings[middle - 1] + sorted_readings[middle]) / 2


def calibrate_height(progress_callback=None):
    global TOTAL_HEIGHT
    message = "Calibrating height... Make sure nothing is under the sensor."
    print(message)
    if progress_callback:
        progress_callback(message)

    time.sleep(2)
    readings = []

    for _ in range(CALIBRATION_SAMPLES):
        d = measure_distance()
        if _is_valid_distance(d):
            readings.append(d)
            message = f"Reading {len(readings)}/{CALIBRATION_SAMPLES}: {d} cm"
            print(message)
            if progress_callback:
                progress_callback(message)
        else:
            message = f"Ignored invalid reading: {d} cm"
            print(message)
            if progress_callback:
                progress_callback(message)
        time.sleep(0.2)

    if len(readings) < MIN_CALIBRATION_READINGS:
        message = (
            f"Calibration failed: only {len(readings)} valid readings; "
            f"at least {MIN_CALIBRATION_READINGS} are required"
        )
        print(message)
        if progress_callback:
            progress_callback(message)
        return None

    TOTAL_HEIGHT = _median_readings(readings)

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
    else:
        data = {}

    data["vl53l1x"] = {"total_height": TOTAL_HEIGHT}

    with open(CALIBRATION_FILE, "w") as f:
        json.dump(data, f)

    message = f"Saved height calibration: {TOTAL_HEIGHT:.2f} cm"
    print(f"\n{message}\n")
    if progress_callback:
        progress_callback(message)

    return TOTAL_HEIGHT


def get_height():
    if TOTAL_HEIGHT is None or not _is_valid_distance(TOTAL_HEIGHT):
        return None

    readings = []
    for _ in range(3):
        d = measure_distance()
        if _is_valid_distance(d):
            readings.append(d)
        time.sleep(0.05)

    if not readings:
        return None

    avg_distance = _average_readings(readings)
    height = TOTAL_HEIGHT - avg_distance

    if height < 0:
        print(f"Ignored invalid height: calibrated={TOTAL_HEIGHT:.2f} cm, measured={avg_distance:.2f} cm")
        return None

    return round(height, 2)


def reset_calibration():
    global TOTAL_HEIGHT
    TOTAL_HEIGHT = None
    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
        data.pop("vl53l1x", None)
        with open(CALIBRATION_FILE, "w") as f:
            json.dump(data, f)
        print("VL53L1X calibration reset")


def load_calibration():
    global TOTAL_HEIGHT

    if os.path.exists(CALIBRATION_FILE):
        with open(CALIBRATION_FILE, "r") as f:
            data = json.load(f)
            TOTAL_HEIGHT = data.get("vl53l1x", {}).get("total_height")

        if _is_valid_distance(TOTAL_HEIGHT):
            print(f"📂 Loaded VL53L1X Calibration: {TOTAL_HEIGHT:.2f} cm")
        else:
            TOTAL_HEIGHT = None
            print("⚠️ No VL53L1X calibration found. Please calibrate.")
    else:
        print("⚠️ No calibration file found. Please calibrate.")


def close():
    global bus
    if bus is not None:
        try:
            bus.close()
        except Exception:
            pass
        bus = None