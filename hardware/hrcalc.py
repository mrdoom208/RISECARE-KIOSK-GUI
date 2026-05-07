import numpy as np

def calc_hr_and_spo2(ir_data, red_data):
    """
    Calculates Heart Rate (BPM) and SpO2 (%) from raw sensor data.
    Returns: (hr, hr_valid, spo2, spo2_valid)
    """
    # 1. Remove DC Component
    ir_ac = ir_data - np.mean(ir_data)
    red_ac = red_data - np.mean(red_data)

    # 2. Filter Noise (Moving average)
    ir_smooth = np.convolve(ir_ac, np.ones(5)/5, mode='same')
    red_smooth = np.convolve(red_ac, np.ones(5)/5, mode='same')

    # 3. Peak Detection
    peaks = []
    for i in range(1, len(ir_smooth) - 1):
        if ir_smooth[i] > ir_smooth[i-1] and ir_smooth[i] > ir_smooth[i+1] and ir_smooth[i] > 0:
            peaks.append(i)

    # Check if we have enough data
    if len(peaks) < 2:
        return 0, False, 0, False

    # Calculate Heart Rate (BPM)
    # Frequency is 100Hz as set in REG_SPO2_CONFIG
    beat_intervals = np.diff(peaks)
    avg_interval = np.mean(beat_intervals)
    heart_rate = (60.0 * 100.0) / avg_interval

    # Calculate SpO2 (%) using "Ratio of Ratios"
    ir_dc = np.mean(ir_data)
    red_dc = np.mean(red_data)
    
    ir_ac_rms = np.sqrt(np.mean(ir_smooth**2))
    red_ac_rms = np.sqrt(np.mean(red_smooth**2))

    # Avoid division by zero
    if ir_dc == 0 or ir_ac_rms == 0:
        return int(heart_rate), False, 0, False

    r_ratio = (red_ac_rms / red_dc) / (ir_ac_rms / ir_dc)
    spo2 = 110 - 25 * r_ratio

    # Determine Validity (Basic heuristic)
    hr_valid = 40 <= heart_rate <= 200
    spo2_valid = 70 <= spo2 <= 100

    return int(heart_rate), hr_valid, int(min(spo2, 100)), spo2_valid