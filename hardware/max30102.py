import time
import numpy as np
import math

try:
    from smbus2 import SMBus
    smbus_available = True
except ImportError:
    print("Warning: smbus2 not installed. Install with: python -m pip install smbus2")
    smbus_available = False

try:
    from scipy.signal import butter, filtfilt
    scipy_available = True
except ImportError:
    print("Warning: scipy not installed. Falling back to simple moving-average filter.")
    print("Install with: python -m pip install scipy")
    scipy_available = False


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
        self._smoothed_hr = 0
        self._smoothed_spo2 = 0

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
        self.write_reg(self.REG_LED1_PA, 0x1F)
        self.write_reg(self.REG_LED2_PA, 0x1F)
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

    def read_sequential(self, samples=100, delay=0.005):
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

    _BUFFER_MAX = 400

    def clear_buffer(self):
        self._red_buffer = []
        self._ir_buffer = []
        self._smoothed_hr = 0
        self._smoothed_spo2 = 0

    def calc_hr_and_spo2(self, ir_data, red_data):
        SAMPLE_RATE = 100.0

        # --- Signal Quality Index: DC check (no finger / low perfusion) ---
        ir_dc = np.mean(ir_data)
        red_dc = np.mean(red_data)

        if len(ir_data) < 50 or ir_dc < 10000:
            return 0, False, 0, False

        # --- Bandpass filter 0.7 - 4 Hz (42-240 BPM) ---
        if scipy_available and len(ir_data) > 60:
            nyquist = SAMPLE_RATE / 2.0
            b, a = butter(2, [0.7 / nyquist, 4.0 / nyquist], btype="band")
            ir_filt = filtfilt(b, a, ir_data)
            red_filt = filtfilt(b, a, red_data)
        else:
            ir_ac = ir_data - ir_dc
            red_ac = red_data - red_dc
            short_win = 5
            long_win = 30
            ir_short = np.convolve(ir_ac, np.ones(short_win) / short_win, mode="same")
            ir_long  = np.convolve(ir_ac, np.ones(long_win) / long_win,   mode="same")
            ir_filt  = ir_short - ir_long
            red_short = np.convolve(red_ac, np.ones(short_win) / short_win, mode="same")
            red_long  = np.convolve(red_ac, np.ones(long_win) / long_win,   mode="same")
            red_filt  = red_short - red_long

        # --- Signal Quality Index: pulse amplitude check ---
        ir_amplitude = np.std(ir_filt)
        if ir_amplitude < 50:
            return 0, False, 0, False

        # --- Adaptive peak detection using first derivative ---
        threshold = np.mean(ir_filt) + 0.5 * ir_amplitude
        min_distance = int(0.3 * SAMPLE_RATE)

        ir_diff = np.diff(ir_filt)
        sign_changes = np.diff(np.sign(ir_diff))
        zero_crossings = np.where(sign_changes < 0)[0] + 1

        peaks = []
        last_peak = -min_distance
        for i in zero_crossings:
            if i <= 0 or i >= len(ir_filt) - 1:
                continue
            if ir_filt[i] > threshold and i - last_peak >= min_distance:
                peaks.append(i)
                last_peak = i

        if len(peaks) < 2:
            return 0, False, 0, False

        # --- Heart Rate calculation with outlier rejection ---
        beat_intervals = np.diff(peaks)
        median_interval = np.median(beat_intervals)
        valid_intervals = beat_intervals[
            (beat_intervals >= median_interval * 0.6) &
            (beat_intervals <= median_interval * 1.8)
        ]

        if len(valid_intervals) < 1:
            return 0, False, 0, False

        avg_interval = np.mean(valid_intervals)
        heart_rate = (60.0 * SAMPLE_RATE) / avg_interval

        # --- SpO2 calculation with polynomial calibration ---
        ir_ac_rms = np.sqrt(np.mean(ir_filt ** 2))
        red_ac_rms = np.sqrt(np.mean(red_filt ** 2))

        if ir_dc == 0 or ir_ac_rms == 0:
            return int(heart_rate), False, 0, False

        r_ratio = (red_ac_rms / red_dc) / (ir_ac_rms / ir_dc)
        spo2 = -45.060 * r_ratio ** 2 + 30.354 * r_ratio + 94.845

        hr_valid = not math.isnan(heart_rate) and 30 <= heart_rate <= 250
        spo2_valid = 70 <= spo2 <= 100

        return int(heart_rate), hr_valid, int(min(spo2, 100)), spo2_valid

    def get_reading(self):
        red_new, ir_new = self.read_sequential(samples=100, delay=0.005)

        if len(red_new) < 10 or len(ir_new) < 10:
            print("[get_reading] Too few samples:", len(red_new), len(ir_new))
            return 0, False, 0, False

        self._red_buffer.extend(red_new)
        self._ir_buffer.extend(ir_new)

        if len(self._ir_buffer) > self._BUFFER_MAX:
            excess = len(self._ir_buffer) - self._BUFFER_MAX
            self._red_buffer = self._red_buffer[excess:]
            self._ir_buffer = self._ir_buffer[excess:]

        raw_hr, hr_valid, raw_spo2, spo2_valid = self.calc_hr_and_spo2(
            self._ir_buffer, self._red_buffer
        )

        if hr_valid:
            if self._smoothed_hr == 0:
                self._smoothed_hr = raw_hr
            else:
                self._smoothed_hr = int(0.7 * self._smoothed_hr + 0.3 * raw_hr)
            hr = self._smoothed_hr
        else:
            hr = raw_hr

        if spo2_valid:
            if self._smoothed_spo2 == 0:
                self._smoothed_spo2 = raw_spo2
            else:
                self._smoothed_spo2 = int(0.8 * self._smoothed_spo2 + 0.2 * raw_spo2)
            spo2 = self._smoothed_spo2
        else:
            spo2 = raw_spo2

        return hr, hr_valid, spo2, spo2_valid
