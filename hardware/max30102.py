import time
import numpy as np
import math

try:
    from smbus2 import SMBus
    smbus_available = True
except ImportError:
    print("Warning: smbus2 not installed. Install with: python -m pip install smbus2")
    smbus_available = False


class MAX30102:
    REG_INTR_STATUS_1 = 0x00
    REG_FIFO_WR_PTR = 0x04
    REG_FIFO_RD_PTR = 0x06
    REG_FIFO_DATA = 0x07
    REG_MODE_CONFIG = 0x09
    REG_SPO2_CONFIG = 0x0A
    REG_LED1_PA = 0x0C
    REG_LED2_PA = 0x0D

    def __init__(self, bus=1, address=0x57, i2c_bus=None):
        self.address = address
        self.handle = None
        self.bus = None
        self._red_buffer = []
        self._ir_buffer = []

        if not smbus_available:
            print("❌ smbus2 not available")
            return

        try:
            self.bus = i2c_bus if i2c_bus is not None else SMBus(bus)
            self.handle = bus
            self.read_reg(self.REG_INTR_STATUS_1)
        except Exception as e:
            self.close()
            print(f"❌ MAX30102 not reachable on I2C bus {bus} at 0x{address:02X}: {e}")
            return

        self.reset()
        self.setup()

    def _write(self, reg, data):
        self.bus.write_byte_data(self.address, reg, data)

    def _read(self, reg, count=1):
        return self.bus.read_i2c_block_data(self.address, reg, count)

    def write_reg(self, reg, value):
        if self.handle is None:
            return
        self._write(reg, value)

    def read_reg(self, reg):
        if self.handle is None:
            return 0
        data = self._read(reg, 1)
        return data[0] if data else 0

    def reset(self):
        self.write_reg(self.REG_MODE_CONFIG, 0x40)
        time.sleep(0.1)

    def setup(self):
        self.write_reg(self.REG_MODE_CONFIG, 0x03)
        self.write_reg(self.REG_SPO2_CONFIG, 0x27)
        self.write_reg(self.REG_LED1_PA, 0x24)
        self.write_reg(self.REG_LED2_PA, 0x24)
        self.write_reg(self.REG_FIFO_WR_PTR, 0x00)
        self.write_reg(self.REG_FIFO_RD_PTR, 0x00)

    def shutdown(self):
        self.write_reg(self.REG_MODE_CONFIG, 0x00)
        time.sleep(0.01)

    def read_fifo(self):
        data = self._read(self.REG_FIFO_DATA, 6)
        if len(data) >= 6:
            red = (data[0] << 16 | data[1] << 8 | data[2]) & 0x3FFFF
            ir = (data[3] << 16 | data[4] << 8 | data[5]) & 0x3FFFF
            return red, ir
        return 0, 0

    def read_sequential(self, samples=50, delay=0.01):
        red_samples = []
        ir_samples = []

        for _ in range(samples):
            red, ir = self.read_fifo()
            red_samples.append(red)
            ir_samples.append(ir)
            time.sleep(delay)

        return red_samples, ir_samples

    def close(self):
        self.handle = None
        if self.bus is not None:
            try:
                self.bus.close()
            except Exception:
                pass
            self.bus = None

    _BUFFER_MAX = 200

    def clear_buffer(self):
        self._red_buffer = []
        self._ir_buffer = []

    def calc_hr_and_spo2(self, ir_data, red_data):
        ir_ac = ir_data - np.mean(ir_data)
        red_ac = red_data - np.mean(red_data)

        short_win = 5
        long_win = 30

        ir_short = np.convolve(ir_ac, np.ones(short_win)/short_win, mode='same')
        ir_long = np.convolve(ir_ac, np.ones(long_win)/long_win, mode='same')
        ir_bp = ir_short - ir_long

        red_short = np.convolve(red_ac, np.ones(short_win)/short_win, mode='same')
        red_long = np.convolve(red_ac, np.ones(long_win)/long_win, mode='same')
        red_bp = red_short - red_long

        ir_amplitude = np.std(ir_bp[long_win:-long_win]) if len(ir_bp) > 2*long_win else np.std(ir_bp)
        if ir_amplitude < 30:
            return 0, False, 0, False

        threshold = ir_amplitude * 0.5
        min_distance = 30
        peaks = []
        last_peak = -min_distance
        search_start = long_win
        search_end = len(ir_bp) - long_win
        for i in range(search_start, search_end):
            if (ir_bp[i] > ir_bp[i-1] and
                ir_bp[i] > ir_bp[i+1] and
                ir_bp[i] > threshold and
                i - last_peak >= min_distance):
                peaks.append(i)
                last_peak = i

        if len(peaks) < 2:
            return 0, False, 0, False

        beat_intervals = np.diff(peaks)
        median_interval = np.median(beat_intervals)
        valid_intervals = beat_intervals[
            (beat_intervals >= median_interval * 0.6) &
            (beat_intervals <= median_interval * 1.8)
        ]

        if len(valid_intervals) < 1:
            return 0, False, 0, False

        avg_interval = np.mean(valid_intervals)
        heart_rate = (60.0 * 100.0) / avg_interval

        ir_dc = np.mean(ir_data)
        red_dc = np.mean(red_data)

        ir_ac_rms = np.sqrt(np.mean(ir_bp**2))
        red_ac_rms = np.sqrt(np.mean(red_bp**2))

        if ir_dc == 0 or ir_ac_rms == 0:
            return int(heart_rate), False, 0, False

        r_ratio = (red_ac_rms / red_dc) / (ir_ac_rms / ir_dc)
        spo2 = 110 - 25 * r_ratio

        hr_valid = not math.isnan(heart_rate) and 30 <= heart_rate <= 250
        spo2_valid = 70 <= spo2 <= 100

        if not hr_valid and spo2_valid:
            print(f"[calc_hr_and_spo2] peaks={len(peaks)}, intervals={len(beat_intervals)}, valid={len(valid_intervals)}, avg_int={avg_interval:.2f}, hr={heart_rate:.2f}")

        return int(heart_rate), hr_valid, int(min(spo2, 100)), spo2_valid

    def get_reading(self):
        red_new, ir_new = self.read_sequential(samples=50)

        if len(red_new) < 10 or len(ir_new) < 10:
            print("[get_reading] Too few samples:", len(red_new), len(ir_new))
            return 0, False, 0, False

        self._red_buffer.extend(red_new)
        self._ir_buffer.extend(ir_new)

        if len(self._ir_buffer) > self._BUFFER_MAX:
            excess = len(self._ir_buffer) - self._BUFFER_MAX
            self._red_buffer = self._red_buffer[excess:]
            self._ir_buffer = self._ir_buffer[excess:]

        return self.calc_hr_and_spo2(self._ir_buffer, self._red_buffer)
