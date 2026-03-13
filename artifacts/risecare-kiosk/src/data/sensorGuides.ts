import { SensorGuide } from "@/types/sensorGuide";

export const sensorGuides: SensorGuide[] = [
  {
    name: "Pulse Oximeter Sensor",
    instruction: `1️⃣ Place your finger gently on the sensor.<br/>
    2️⃣ Make sure the tip of your finger fully covers the sensor area.<br/>
    3️⃣ Stay still while the measurement is taking place.<br/>
    4️⃣ Wait 5–10 seconds for the reading to appear on the screen.`,
    avoid: `❌ Do not press too hard on the sensor, as this can affect the accuracy of the reading.<br/>
    ❌ Avoid moving your finger during the measurement, as this can cause fluctuations in the reading.<br/>
    ❌ Ensure your finger is clean and dry before placing it on the sensor for accurate results.`,
    image: "/instructions/Max30102.png",
  },
  {
    name: "Blood Pressure Cuff",
    instruction: `Wrap the blood pressure cuff around your upper arm, ensuring it is snug but not too tight. The cuff should be positioned about an inch above the bend of your elbow. Sit comfortably with your back supported and feet flat on the floor. Rest your arm on a table at heart level and remain still while the measurement is taken.`,
    avoid: `❌ Do not move your arm during the measurement.<br/>❌ Avoid talking while measuring blood pressure.`,
    image: "/images/bp-cuff.png",
  },
  {
    name: "Thermometer",
    instruction: `Place the thermometer under your tongue or on your forehead as instructed. Stay still until the measurement is complete.`,
    avoid: `❌ Do not move the thermometer during measurement.<br/>❌ Do not measure immediately after eating or drinking hot/cold liquids.`,
    image: "/images/thermometer.png",
  },
  {
    name: "Body Weight Scale",
    instruction: `1️⃣ Step onto the center of the platform carefully.<br/>
    2️⃣ Stand still with your weight evenly distributed on both feet.<br/>
    3️⃣ Keep your hands at your sides or on the kiosk handrails if available.<br/>
    4️⃣ Wait a few seconds for the display to show your weight.<br/>
`,
    avoid: `❌ Do not carry bags, backpacks, or heavy items while stepping on the scale.<br/>
    ❌ Remove shoes with thick soles or high heels for accurate readings.<br/>
    ❌ Avoid wearing heavy jackets, coats, or bulky clothing that adds extra weight.<br/>
    ❌ Do not jump, move, or shift your weight while on the platform.<br/>
    ❌ Avoid leaning on the kiosk, walls, or nearby objects.<br/>
    ❌ Do not place wet or dirty items on the platform.`,
    image: "/instructions/weight-scale.png",
  },
  {
    name: "Height Measurement Sensor",
    instruction: `1️⃣ Stand straight with your feet shoulder-width apart.<br/>
    2️⃣ Keep your head level and look straight ahead.<br/>
    3️⃣ Remain still while the measurement is taking place.<br/>
    4️⃣ Wait for the reading to appear on the screen.`,
    avoid: `❌ Do not lean forward or backward while measuring height.<br/>
    ❌ Avoid wearing shoes with thick soles or high heels for accurate readings.<br/>
    ❌ Do not move your body during the measurement.`,
    image: "/instructions/height-scale.png",
  },
  // Add more sensors here
];
