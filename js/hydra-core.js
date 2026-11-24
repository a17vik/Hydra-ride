/**
 * HydraRide - Core Simulation & Telemetry Engine
 * 
 * IMPORTANT ARCHITECTURAL REQUIREMENT:
 * "Put all data in one function, getReading(), so the simulated source
 * can later be replaced by real hydrapack data."
 * 
 * In production hardware:
 * - getReading() will interface with Web Bluetooth API (BLE GATT characteristics),
 *   onboard ESP32 MQTT telemetry, or a local WebSocket.
 * In this demo:
 * - getReading() generates biothermal & hydrapack telemetry synchronized
 *   across pages via localStorage.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'hydraride_shift_state_v1';
  const SETTINGS_KEY = 'hydraride_settings_v1';

  // Simulation Timing Configuration:
  // 1 shift = 8 hours (480 minutes), from 11:00 AM to 07:00 PM.
  // Full shift runs in ~100 real seconds.
  // 480 shift minutes / 100 seconds = 4.8 shift minutes per real second.
  // We tick every 250ms (4 times/sec), so each tick = 1.2 shift minutes.
  const SHIFT_START_MINUTES = 11 * 60; // 660 mins (11:00 AM)
  const SHIFT_END_MINUTES = 19 * 60;   // 1140 mins (07:00 PM)
  const TOTAL_SHIFT_MINUTES = 480;      // 8 hours
  const TICK_INTERVAL_MS = 250;
  const SHIFT_MINUTES_PER_TICK = 1.2;

  // Initial / Default State
  function createInitialState() {
    return {
      version: 1,
      riderId: 'Rider #214',
      riderName: 'Aarav Sharma',
      shiftDate: new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }),
      
      // Simulation Progress
      elapsedShiftMinutes: 0, // 0 to 480
      isSimulating: false,
      speedMultiplier: 1.0,
      
      // Ambient & Biothermal Conditions
      outsideTempC: 38,       // Slider 30 - 45 °C
      bodyTempC: 36.8,        // Simulated 36.5 to 38.5 °C
      peakBodyTempC: 36.8,

      // Hydration Pack Tank (1.5 L = 1500 ml)
      tankCapacityMl: 1500,
      tankLevelMl: 1500,      // Each sip lowers it, Refill resets it

      // Hydration Totals & Logs
      totalWaterDrunkMl: 0,
      lastSipMl: 0,
      minutesSinceLastSip: 0,
      nextAutoSipAtMinute: Math.floor(25 + Math.random() * 30), // first auto sip around min 25-55

      // Reminders & Alerts
      reminderDismissedUntil: 0,
      missedRemindersCount: 0,
      lastReminderTriggeredAt: -999,

      // Historical Series
      sipsLog: [],             // { shiftMinute, clockStr, ml, bodyTempC, outsideTempC }
      bodyTempHistory: [       // for trend graph: sample every ~10 shift minutes
        { shiftMinute: 0, clockStr: '11:00 AM', bodyTempC: 36.8, outsideTempC: 38 }
      ],
      hourlyIntake: [0, 0, 0, 0, 0, 0, 0, 0], // 8 hours of shift

      // Rider GPS location in Gurugram (Sector 29 Delivery Hub)
      riderLocation: {
        lat: 28.4682,
        lng: 77.0645,
        area: 'Sector 29 / Leisure Valley, Gurugram'
      }
    };
  }

  // Load from localStorage or initialize
  let state = loadState();

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.version === 1) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('HydraRide: Failed to load state from localStorage', e);
    }
    return createInitialState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('HydraRide: Failed to save state to localStorage', e);
    }
  }

  // Settings: Audio & Notifications
  let settings = {
    soundEnabled: true,
    notificationsEnabled: false
  };

  try {
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
      settings = Object.assign(settings, JSON.parse(savedSettings));
    }
  } catch (e) {}

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  // Web Audio API Synthesizer (Zero external dependencies)
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!settings.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === 'sip') {
        // Cheerful dual water droplet chime (440Hz -> 880Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'reminder') {
        // Two-pulse hydration attention alert
        [0, 0.18].forEach(delay => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(659.25, now + delay); // E5
          gain.gain.setValueAtTime(0.22, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + delay);
          osc.stop(now + delay + 0.15);
        });
      } else if (type === 'refill') {
        // Ascending harmonic chord for tank replenishment
        [329.63, 440, 554.37, 659.25].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.07);
          gain.gain.setValueAtTime(0.14, now + i * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.07);
          osc.stop(now + i * 0.07 + 0.3);
        });
      } else if (type === 'heat_alert') {
        // Deeper warning tone for heat stress
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(370, now + 0.25);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Browser Notifications
  function requestNotificationPermission() {
    if ('Notification' in window) {
      Notification.requestPermission().then(perm => {
        settings.notificationsEnabled = (perm === 'granted');
        saveSettings();
        if (perm === 'granted') {
          new Notification('HydraRide Notifications Enabled', {
            body: 'You will receive heat and hydration safety reminders.',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%230ea5e9"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
          });
        }
      });
    }
  }

  function triggerSystemNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted' && settings.notificationsEnabled) {
      try {
        new Notification(title, {
          body: body,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%230ea5e9"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
        });
      } catch (e) {}
    }
  }

  // Time & Math Helper Utilities
  function minutesToClockStr(shiftMinutes) {
    const totalMins = SHIFT_START_MINUTES + Math.min(TOTAL_SHIFT_MINUTES, Math.max(0, shiftMinutes));
    const h24 = Math.floor(totalMins / 60);
    const m = Math.floor(totalMins % 60);
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // Heat-Based Daily Goal Formula:
  // "goal = 2000 ml + 100 ml for every °C above 30 (rounded to 100 ml)"
  function calculateHeatGoal(outsideTempC) {
    const baseGoal = 2000;
    const excessTemp = Math.max(0, outsideTempC - 30);
    const addedWater = excessTemp * 100;
    const rawGoal = baseGoal + addedWater;
    return Math.round(rawGoal / 100) * 100;
  }

  // Simulated Rider Location wandering in Gurugram
  function getRiderCurrentLocation(progressRatio) {
    // Delivery route between Cyber Hub (28.4952, 77.0887), Sector 29 (28.4682, 77.0645),
    // and IFFCO Chowk / Galleria (28.4673, 77.0864).
    const routeWaypoints = [
      { lat: 28.4682, lng: 77.0645, area: 'Sector 29 Market' },
      { lat: 28.4721, lng: 77.0726, area: 'IFFCO Chowk Crossing' },
      { lat: 28.4818, lng: 77.0927, area: 'MG Road Metro Stretch' },
      { lat: 28.4952, lng: 77.0887, area: 'DLF Cyber City Hub' },
      { lat: 28.4802, lng: 77.0812, area: 'Heritage City / MG Road' },
      { lat: 28.4673, lng: 77.0864, area: 'Galleria Market Phase 4' },
      { lat: 28.4593, lng: 77.0725, area: 'Millennium City Centre' },
      { lat: 28.4682, lng: 77.0645, area: 'Sector 29 Leisure Valley' }
    ];

    const idx = (progressRatio * (routeWaypoints.length - 1));
    const lowerIdx = Math.floor(idx);
    const upperIdx = Math.min(routeWaypoints.length - 1, lowerIdx + 1);
    const fraction = idx - lowerIdx;

    const p1 = routeWaypoints[lowerIdx];
    const p2 = routeWaypoints[upperIdx];

    return {
      lat: +(p1.lat + (p2.lat - p1.lat) * fraction).toFixed(5),
      lng: +(p1.lng + (p2.lng - p1.lng) * fraction).toFixed(5),
      area: fraction < 0.5 ? p1.area : p2.area
    };
  }

  /**
   * ====================================================================
   * CENTRAL TELEMETRY FUNCTION: getReading()
   * ====================================================================
   * As specified by user prompt:
   * "Put all data in one function, getReading(), so the simulated source
   * can later be replaced by real hydrapack data."
   * 
   * Returns a complete, self-contained snapshot of the system state.
   */
  function getReading() {
    const elapsed = state.elapsedShiftMinutes;
    const progress = Math.min(1.0, elapsed / TOTAL_SHIFT_MINUTES);
    const dailyGoalMl = calculateHeatGoal(state.outsideTempC);
    
    // Target pace at current moment of shift:
    // If half-way through shift, target is half of daily goal.
    const targetPaceMl = Math.round(progress * dailyGoalMl);
    const paceDeficitMl = targetPaceMl - state.totalWaterDrunkMl;

    // Reminder threshold: 30 shift mins above 40°C, otherwise 60 mins
    const reminderIntervalMins = state.outsideTempC > 40 ? 30 : 60;
    
    // Check if reminder is currently due
    const isSnoozed = elapsed < state.reminderDismissedUntil;
    const isReminderDue = !isSnoozed && 
                          (state.minutesSinceLastSip >= reminderIntervalMins) && 
                          (elapsed > 0) &&
                          (progress < 1.0);

    // Tank metrics
    const tankPercent = Math.max(0, Math.min(100, (state.tankLevelMl / state.tankCapacityMl) * 100));
    const tankLowWarning = state.tankLevelMl <= 300; // <= 20% of 1500 ml

    // Estimated minutes of water left based on average pace or base consumption
    const averageMlPerShiftMin = state.totalWaterDrunkMl > 0 && elapsed > 10 
      ? (state.totalWaterDrunkMl / elapsed) 
      : (dailyGoalMl / TOTAL_SHIFT_MINUTES);
    const estimatedMinutesLeft = averageMlPerShiftMin > 0 
      ? Math.round(state.tankLevelMl / averageMlPerShiftMin) 
      : 120;

    // Body temperature & heat stress
    // Heat stress warning at 38 °C or more. Stronger alert if also behind on water.
    const heatStressWarning = state.bodyTempC >= 38.0;
    const isBehindOnPace = paceDeficitMl > 100;
    const severeHeatStressWarning = heatStressWarning && isBehindOnPace;

    // Current shift clock string
    const shiftTimeStr = minutesToClockStr(elapsed);

    // Current Rider location
    const currentLocation = getRiderCurrentLocation(progress);

    return {
      timestamp: Date.now(),
      riderId: state.riderId,
      riderName: state.riderName,
      shiftDate: state.shiftDate,
      shiftTimeStr: shiftTimeStr,
      elapsedShiftMinutes: Math.round(elapsed),
      totalShiftMinutes: TOTAL_SHIFT_MINUTES,
      shiftProgressPercent: +(progress * 100).toFixed(1),
      isShiftComplete: progress >= 1.0,
      isSimulating: state.isSimulating,
      speedMultiplier: state.speedMultiplier,

      // Environmental
      outsideTempC: state.outsideTempC,

      // Hydration
      totalWaterDrunkMl: state.totalWaterDrunkMl,
      dailyGoalMl: dailyGoalMl,
      targetPaceMl: targetPaceMl,
      paceDeficitMl: paceDeficitMl,
      paceStatus: paceDeficitMl <= 50 ? 'on-track' : paceDeficitMl <= 250 ? 'behind' : 'critical-deficit',
      lastSipMl: state.lastSipMl,
      minutesSinceLastSip: Math.round(state.minutesSinceLastSip),

      // Tank Status
      tankCapacityMl: state.tankCapacityMl,
      tankLevelMl: state.tankLevelMl,
      tankPercent: +tankPercent.toFixed(1),
      tankLowWarning: tankLowWarning,
      estimatedMinutesLeft: Math.max(0, estimatedMinutesLeft),

      // Biothermal
      bodyTempC: +state.bodyTempC.toFixed(1),
      peakBodyTempC: +state.peakBodyTempC.toFixed(1),
      heatStressWarning: heatStressWarning,
      severeHeatStressWarning: severeHeatStressWarning,

      // Reminders
      reminderIntervalMins: reminderIntervalMins,
      isReminderDue: isReminderDue,
      isSnoozed: isSnoozed,
      missedRemindersCount: state.missedRemindersCount,

      // Location & Logs
      riderLocation: currentLocation,
      hourlyIntake: state.hourlyIntake.slice(),
      sipsLog: state.sipsLog.slice(),
      bodyTempHistory: state.bodyTempHistory.slice()
    };
  }

  // Log a sip (manual or automated)
  function recordSip(amountMl, isManual) {
    if (state.tankLevelMl <= 0) {
      return { success: false, reason: 'tank_empty' };
    }

    const sipMl = Math.min(state.tankLevelMl, Math.max(50, Math.round(amountMl)));
    state.tankLevelMl = Math.max(0, state.tankLevelMl - sipMl);
    state.totalWaterDrunkMl += sipMl;
    state.lastSipMl = sipMl;
    state.minutesSinceLastSip = 0;

    // Body temperature drop: cold hydration provides a soothing cooling effect
    // e.g. -0.15 °C to -0.25 °C drop after drinking
    const coolingDrop = (sipMl / 200) * 0.22;
    state.bodyTempC = Math.max(36.5, +(state.bodyTempC - coolingDrop).toFixed(2));

    // Update hourly intake slot (0 to 7)
    const currentHourIndex = Math.min(7, Math.floor(state.elapsedShiftMinutes / 60));
    state.hourlyIntake[currentHourIndex] = (state.hourlyIntake[currentHourIndex] || 0) + sipMl;

    // Add entry to sip log
    const entry = {
      id: Date.now() + Math.random().toString(36).substring(2, 6),
      shiftMinute: Math.round(state.elapsedShiftMinutes),
      clockStr: minutesToClockStr(state.elapsedShiftMinutes),
      ml: sipMl,
      bodyTempC: +state.bodyTempC.toFixed(1),
      outsideTempC: state.outsideTempC,
      isManual: !!isManual
    };
    state.sipsLog.unshift(entry);
    if (state.sipsLog.length > 50) {
      state.sipsLog.pop();
    }

    // Schedule next automated sip between 30 and 70 shift minutes from now
    state.nextAutoSipAtMinute = state.elapsedShiftMinutes + (30 + Math.random() * 40);

    // Audio chime
    playSound('sip');

    saveState();
    notifyListeners();
    return { success: true, ml: sipMl };
  }

  // Refill the 1.5 L hydration tank
  function refillTank() {
    state.tankLevelMl = state.tankCapacityMl;
    playSound('refill');
    saveState();
    notifyListeners();
    return state.tankLevelMl;
  }

  // Snooze hourly hydration reminder for 10 shift minutes
  function snoozeReminder(shiftMins = 10) {
    state.reminderDismissedUntil = state.elapsedShiftMinutes + shiftMins;
    saveState();
    notifyListeners();
  }

  // Set outside temperature (30 to 45 °C)
  function setOutsideTemp(tempC) {
    state.outsideTempC = Math.max(30, Math.min(45, Math.round(tempC)));
    saveState();
    notifyListeners();
  }

  // Reset shift back to 11:00 AM
  function resetShift() {
    state = createInitialState();
    saveState();
    notifyListeners();
  }

  // Fast forward / simulate a realistic completed shift (for jury inspection)
  function simulateCompletedShift() {
    resetShift();
    state.outsideTempC = 41;
    let currentMin = 0;
    while (currentMin < TOTAL_SHIFT_MINUTES) {
      currentMin += (35 + Math.random() * 30);
      if (currentMin >= TOTAL_SHIFT_MINUTES) break;
      state.elapsedShiftMinutes = currentMin;
      
      // Auto refill if low
      if (state.tankLevelMl < 300) {
        state.tankLevelMl = state.tankCapacityMl;
      }
      
      // Sip
      const sipSize = Math.floor(100 + Math.random() * 140);
      recordSip(sipSize, false);
      
      // Adjust body temp
      state.bodyTempC = +(36.7 + Math.random() * 1.3).toFixed(1);
      if (state.bodyTempC > state.peakBodyTempC) {
        state.peakBodyTempC = state.bodyTempC;
      }

      state.bodyTempHistory.push({
        shiftMinute: Math.round(currentMin),
        clockStr: minutesToClockStr(currentMin),
        bodyTempC: state.bodyTempC,
        outsideTempC: state.outsideTempC
      });
    }
    state.elapsedShiftMinutes = TOTAL_SHIFT_MINUTES;
    state.isSimulating = false;
    saveState();
    notifyListeners();
  }

  // Biothermal Model Step Function
  function stepSimulation(deltaShiftMinutes) {
    if (state.elapsedShiftMinutes >= TOTAL_SHIFT_MINUTES) {
      state.isSimulating = false;
      saveState();
      notifyListeners();
      return;
    }

    state.elapsedShiftMinutes += deltaShiftMinutes;
    state.minutesSinceLastSip += deltaShiftMinutes;

    // Body Temperature Biothermal Dynamics:
    // 1. Outside heat drive: higher outside temp gently pushes body temp up
    const heatDrive = (state.outsideTempC - 30) * 0.00045 * deltaShiftMinutes;

    // 2. Dehydration factor: long intervals without water accelerate heat accumulation
    const reminderThreshold = state.outsideTempC > 40 ? 30 : 60;
    const dehydrationDrive = (state.minutesSinceLastSip > (reminderThreshold * 0.6))
      ? 0.0006 * deltaShiftMinutes
      : 0;

    // 3. Natural cooling tendency toward 36.8 when recent sips exist
    const coolTendency = (state.bodyTempC > 36.8 && state.minutesSinceLastSip < 20)
      ? -0.0003 * deltaShiftMinutes
      : 0;

    state.bodyTempC = +(state.bodyTempC + heatDrive + dehydrationDrive + coolTendency).toFixed(2);
    
    // Clamp to realistic clinical range specified in prompt: 36.5 to 38.5 °C
    state.bodyTempC = Math.max(36.5, Math.min(38.5, state.bodyTempC));

    if (state.bodyTempC > state.peakBodyTempC) {
      state.peakBodyTempC = state.bodyTempC;
    }

    // Check if auto sip is triggered
    if (state.elapsedShiftMinutes >= state.nextAutoSipAtMinute) {
      if (state.tankLevelMl > 0) {
        // Random sip between 80 to 250 ml
        const randomSipMl = Math.floor(80 + Math.random() * 170);
        recordSip(randomSipMl, false);
      }
    }

    // Check hourly hydration reminder trigger
    const intervalMins = state.outsideTempC > 40 ? 30 : 60;
    if (state.minutesSinceLastSip >= intervalMins && 
        state.elapsedShiftMinutes >= state.reminderDismissedUntil) {
      
      // Trigger sound & notification once when hitting threshold
      if ((state.elapsedShiftMinutes - state.lastReminderTriggeredAt) > 15) {
        state.lastReminderTriggeredAt = state.elapsedShiftMinutes;
        state.missedRemindersCount++;
        playSound('reminder');
        triggerSystemNotification(
          'HydraRide Alert: Time to Hydrate!',
          `You have not sipped water for ${Math.round(state.minutesSinceLastSip)} minutes in ${state.outsideTempC}°C heat. Take a sip now to prevent heat strain.`
        );
      }
    }

    // Check high heat stress alert (38.0°C)
    if (state.bodyTempC >= 38.0 && Math.random() < 0.05) {
      playSound('heat_alert');
    }

    // Record trend history every ~10 shift minutes
    const lastHistory = state.bodyTempHistory[state.bodyTempHistory.length - 1];
    if (!lastHistory || (state.elapsedShiftMinutes - lastHistory.shiftMinute) >= 10) {
      state.bodyTempHistory.push({
        shiftMinute: Math.round(state.elapsedShiftMinutes),
        clockStr: minutesToClockStr(state.elapsedShiftMinutes),
        bodyTempC: +state.bodyTempC.toFixed(1),
        outsideTempC: state.outsideTempC
      });
      if (state.bodyTempHistory.length > 50) {
        state.bodyTempHistory.shift();
      }
    }

    saveState();
    notifyListeners();
  }

  // Simulation Loop Timer
  let simTimer = null;

  function startSimulation() {
    if (simTimer) return;
    state.isSimulating = true;
    saveState();
    notifyListeners();

    simTimer = setInterval(() => {
      if (!state.isSimulating) {
        stopSimulation();
        return;
      }
      stepSimulation(SHIFT_MINUTES_PER_TICK * state.speedMultiplier);
    }, TICK_INTERVAL_MS);
  }

  function stopSimulation() {
    if (simTimer) {
      clearInterval(simTimer);
      simTimer = null;
    }
    state.isSimulating = false;
    saveState();
    notifyListeners();
  }

  function toggleSimulation() {
    if (state.isSimulating) {
      stopSimulation();
    } else {
      if (state.elapsedShiftMinutes >= TOTAL_SHIFT_MINUTES) {
        state.elapsedShiftMinutes = 0;
      }
      startSimulation();
    }
  }

  // State Change Listeners / Observers
  const listeners = new Set();

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function notifyListeners() {
    const reading = getReading();
    listeners.forEach(fn => {
      try { fn(reading); } catch (e) { console.error(e); }
    });
  }

  // Listen for storage events from other tabs
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      state = loadState();
      notifyListeners();
    } else if (e.key === SETTINGS_KEY) {
      try { settings = JSON.parse(e.newValue); } catch (err) {}
    }
  });

  // Automatically start simulation on load if it was active
  if (state.isSimulating && state.elapsedShiftMinutes < TOTAL_SHIFT_MINUTES) {
    startSimulation();
  }

  // Public HydraCore API export
  global.HydraCore = {
    getReading: getReading,
    recordSip: recordSip,
    refillTank: refillTank,
    snoozeReminder: snoozeReminder,
    setOutsideTemp: setOutsideTemp,
    resetShift: resetShift,
    simulateCompletedShift: simulateCompletedShift,
    startSimulation: startSimulation,
    stopSimulation: stopSimulation,
    toggleSimulation: toggleSimulation,
    subscribe: subscribe,
    playSound: playSound,
    requestNotificationPermission: requestNotificationPermission,
    getSettings: () => ({ ...settings }),
    setSoundEnabled: (val) => {
      settings.soundEnabled = !!val;
      saveSettings();
    },
    calculateHeatGoal: calculateHeatGoal,
    minutesToClockStr: minutesToClockStr
  };

})(window);
