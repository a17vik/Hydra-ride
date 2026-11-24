# HydraRide — Smart Hydration & Heat-Safety Dashboard for Delivery Riders

**HydraRide** is an occupational health and hydration dashboard designed for food delivery riders navigating extreme urban summer heat. The system monitors fluid intake, ambient temperatures, and biothermal core heat stress through a smart hydration backpack (**hydrapack**).

> **Jury Presentation Demo**: The physical hardware vest is currently in prototyping. All data displayed in this dashboard is generated via a synchronized, real-time biothermal simulation engine.

---

## 🚀 How to Run the Website

HydraRide is built with **plain HTML, CSS, and modern JavaScript**. It requires **no build step, no Node.js runtime, and no backend server**.

### Option 1: Direct File Opening (Fastest)
1. Double-click or open `index.html` in any modern web browser (Google Chrome, Edge, Safari, Firefox).
2. All styling, charts, sounds, and map layers work out-of-the-box.

### Option 2: Local HTTP Server (Recommended for Audio & Notifications)
Run a local static web server in the project folder:
```bash
# Using Python 3
python -m http.server 8000

# OR using Node.js / npx
npx serve .
```
Then navigate to: **`http://localhost:8000`**

---

## 📱 Pages & Features Overview

### 1. Dashboard (`index.html`)
* **Water Intake & Graphic Bladder**: Displays total ml consumed against the dynamic goal. An animated hydration pack reservoir visual fills up in real time, accompanied by a floating dashed **target pace line** that indicates where the rider should be right now.
* **Heat-Based Daily Goal**: Dynamically calculates required intake using the medical formula:  
  $$\text{Goal} = 2000\text{ ml} + 100\text{ ml per }^\circ\text{C above } 30^\circ\text{C (rounded to 100 ml)}$$  
  *(e.g., at 38°C ambient heat, goal = 2,800 ml).*
* **Hourly Hydration Reminders**: Alerts the courier if no sip is detected for **60 minutes** (shortened automatically to **30 minutes** when ambient heat exceeds 40°C). Features an alert banner, synthesized audio chimes via the Web Audio API, browser notifications, and a 10-minute snooze button.
* **1.5 L Hydrapack Tank Monitoring**: Tracks reservoir volume from 1,500 ml down to 0 ml with every sip. Triggers a low-water warning below 20% (300 ml), estimates remaining minutes of water, and provides a direct shortcut to the nearest refill point. Includes a **Refill Tank** button.
* **Core Body Temperature & Heat Stress**: Simulates physiological core temperatures (36.5°C to 38.5°C) based on ambient heat exposure and fluid loss. Renders a live Canvas trend spline graph. Triggers a **Heat Stress** alert at $\ge 38.0^\circ\text{C}$ and escalates to a **Severe Heat Strain** alarm if the rider is also running behind their hydration pace.
* **Interactive Jury Simulation Controls**: Play/Pause toggle, manual "Log a 200 ml sip" button, shift reset, and an **Outside Temperature Slider (30°C to 45°C)** to demonstrate real-time behavioral adaptation.

### 2. Water Points Map (`map.html`)
* Interactive **Leaflet + OpenStreetMap** view (zero API keys required).
* Features **9 curated sample free water points across Gurugram** (Gurdwara Chabeels, Metro Station RO dispensers, Municipal Pyaaus, Gig Partner Hubs, and Petrol Pump RO taps).
* Tracks Rider #214's simulated GPS position.
* Automatically calculates distances using the Haversine formula and spotlights the **nearest verified water point** with estimated riding time and a 1-click **Refill Here** action.

### 3. Shift Summary (`summary.html`)
* Reads shift telemetry saved in `localStorage`.
* Computes an overall **Hydration Score (0 – 100)** and letter grade based on volume adherence, thermal regulation, and pacing regularity.
* Summarizes total fluid drunk, heat goal %, peak body temperature, and missed reminders.
* Renders an **8-hour water intake bar chart (11:00 AM to 07:00 PM)** comparing hourly consumption against target pace.
* Features an **Instant Full Shift Demo** button for jury evaluation without waiting for the 100-second playback cycle.

---

## 🔌 Where & How to Plug in Real Hydrapack Hardware

All telemetry in the application is decoupled through one central telemetry function: **`getReading()`**, located in [`js/hydra-core.js`](js/hydra-core.js).

To replace the simulation with live data from an actual hydrapack vest, update `getReading()`:

```javascript
/**
 * js/hydra-core.js
 * Replace the simulated return object inside getReading() with your live hardware feed:
 */
function getReading() {
  // If hardware is connected, return real sensor readings:
  if (window.hardwareBridge && window.hardwareBridge.isConnected) {
    const raw = window.hardwareBridge.getLatestPacket();
    return {
      timestamp: raw.timestamp,
      riderId: raw.riderId,                   // e.g. "Rider #214"
      outsideTempC: raw.ambientTempC,         // from vest DS18B20 / SHT31 sensor
      bodyTempC: raw.skinTempC,               // from infrared contact sensor (e.g. MLX90614)
      peakBodyTempC: raw.peakSkinTempC,
      tankLevelMl: raw.tankLevelRemainingMl,  // from ultrasonic / hydrostatic level sensor
      totalWaterDrunkMl: raw.totalDrunkMl,    // from inline hall-effect flowmeter (YF-S401)
      lastSipMl: raw.lastSipVolumeMl,
      minutesSinceLastSip: raw.minutesSinceLastSip,
      // ... pass remaining calculated fields using existing helper methods:
      dailyGoalMl: calculateHeatGoal(raw.ambientTempC),
      // ...
    };
  }

  // Fallback to simulation engine if hardware is offline
  return fallbackSimulatedReading();
}
```

### Supported Hardware Integration Channels:

1. **Web Bluetooth API (BLE GATT)**:
   * Connects the browser directly to an **ESP32** or **Nordic nRF52** onboard the hydration pack over Bluetooth Low Energy.
   * Characteristic UUIDs:
     * `0x2A6E` (Temperature - Ambient & Skin)
     * Custom UUID `0x0001` (Flowmeter Pulse Counter)
     * Custom UUID `0x0002` (Reservoir Ultrasonic Sensor)
2. **Local WebSocket / MQTT Gateway**:
   * If the rider's bike mounts a 4G/LTE cellular telemetry unit, stream JSON packets to `ws://localhost:8080/telemetry` and feed incoming payloads into `window.hardwareBridge`.

---

## 🎨 Design & Accessibility Highlights
* **Theme Support**: Seamless Light and Dark modes with instant toggle and `prefers-color-scheme` detection.
* **Palette**: Water cyan `#0284c7` / `#0ea5e9` for hydration, warning amber `#f59e0b` for pacing alerts, and coral red `#ef4444` for biothermal heat strain.
* **Audio**: Zero-asset, zero-network Web Audio synthesizer chimes (works completely offline).
* **Responsive**: Optimized for presentation projectors, laptops, tablets, and courier smartphones.

---

*HydraRide Demo — Built for jury presentation.*
