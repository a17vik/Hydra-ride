/**
 * HydraRide - Dashboard Page Logic
 * Handles real-time telemetry updates from getReading(),
 * canvas rendering of the body temperature trend chart,
 * hydrapack graphic animations, reminder banners, and interactive controls.
 */

(function () {
  'use strict';

  // DOM Elements cache
  let elements = {};

  function initDOMElements() {
    elements = {
      // Main alerts
      reminderBanner: document.getElementById('reminderBanner'),
      reminderBannerText: document.getElementById('reminderBannerText'),
      btnSnoozeReminder: document.getElementById('btnSnoozeReminder'),
      btnReminderQuickSip: document.getElementById('btnReminderQuickSip'),
      heatStressBanner: document.getElementById('heatStressBanner'),
      heatStressText: document.getElementById('heatStressText'),
      tankLowBanner: document.getElementById('tankLowBanner'),
      tankLowText: document.getElementById('tankLowText'),

      // Water intake & goal
      totalWaterDrunk: document.getElementById('totalWaterDrunk'),
      dailyGoalMl: document.getElementById('dailyGoalMl'),
      goalCalcExplainer: document.getElementById('goalCalcExplainer'),
      packLiquid: document.getElementById('packLiquid'),
      packTargetLine: document.getElementById('packTargetLine'),
      packTargetLabel: document.getElementById('packTargetLabel'),
      paceStatusBadge: document.getElementById('paceStatusBadge'),
      targetPaceVal: document.getElementById('targetPaceVal'),
      paceDifferenceVal: document.getElementById('paceDifferenceVal'),

      // Tank level
      tankLevelMl: document.getElementById('tankLevelMl'),
      tankPercentVal: document.getElementById('tankPercentVal'),
      tankProgressBar: document.getElementById('tankProgressBar'),
      tankMinutesLeft: document.getElementById('tankMinutesLeft'),
      btnRefillTank: document.getElementById('btnRefillTank'),

      // Body temperature
      bodyTempVal: document.getElementById('bodyTempVal'),
      peakBodyTempVal: document.getElementById('peakBodyTempVal'),
      bodyTempStatusBadge: document.getElementById('bodyTempStatusBadge'),
      tempChartCanvas: document.getElementById('tempChartCanvas'),

      // Controls
      btnPlayPause: document.getElementById('btnPlayPause'),
      btnLogSip: document.getElementById('btnLogSip'),
      btnResetShift: document.getElementById('btnResetShift'),
      tempSlider: document.getElementById('tempSlider'),
      tempSliderVal: document.getElementById('tempSliderVal'),
      tempSeverityBadge: document.getElementById('tempSeverityBadge'),
      shiftClockDisplay: document.getElementById('shiftClockDisplay'),
      shiftProgressBar: document.getElementById('shiftProgressBar'),
      shiftPercentDisplay: document.getElementById('shiftPercentDisplay'),

      // Recent sips table
      recentSipsList: document.getElementById('recentSipsList')
    };
  }

  // Draw smooth body temperature trend graph using Canvas
  function drawBodyTempChart(reading) {
    const canvas = elements.tempChartCanvas;
    if (!canvas) return;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 300;
    const height = rect.height || 140;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const padding = { top: 16, right: 20, bottom: 24, left: 42 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Range: 36.5 to 38.5 °C
    const minTemp = 36.5;
    const maxTemp = 38.5;
    const tempRange = maxTemp - minTemp;

    function tempToY(temp) {
      const clamped = Math.max(minTemp, Math.min(maxTemp, temp));
      return padding.top + chartH - ((clamped - minTemp) / tempRange) * chartH;
    }

    // Grid lines & labels
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const tempSteps = [36.5, 37.0, 37.5, 38.0, 38.5];
    tempSteps.forEach(temp => {
      const y = tempToY(temp);
      ctx.beginPath();
      ctx.strokeStyle = isDark ? '#1e293b' : '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      ctx.fillText(`${temp.toFixed(1)}°`, padding.left - 6, y);
    });

    // Heat Stress Warning line at 38.0 °C (Red/Amber dashed)
    const warningY = tempToY(38.0);
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.moveTo(padding.left, warningY);
    ctx.lineTo(padding.left + chartW, warningY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Warning text marker
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'right';
    ctx.fillText('Heat Stress 38.0°', padding.left + chartW, warningY - 8);

    // Data points from history
    const history = reading.bodyTempHistory || [];
    if (history.length === 0) return;

    const points = history.map(item => {
      const x = padding.left + (item.shiftMinute / 480) * chartW;
      const y = tempToY(item.bodyTempC);
      return { x, y, temp: item.bodyTempC, time: item.clockStr };
    });

    // Draw gradient filled area under curve
    if (points.length > 1) {
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      if (reading.bodyTempC >= 38.0) {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
      } else {
        gradient.addColorStop(0, 'rgba(14, 165, 233, 0.35)');
        gradient.addColorStop(1, 'rgba(14, 165, 233, 0.02)');
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartH);
      ctx.lineTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i++) {
        // smooth bezier curves
        const prev = points[i - 1];
        const curr = points[i];
        const cpX = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
      }

      ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw the main trend line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpX = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpX, prev.y, cpX, curr.y, curr.x, curr.y);
      }

      ctx.strokeStyle = reading.bodyTempC >= 38.0 ? '#ef4444' : '#0284c7';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw dot on the latest point
      const latest = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(latest.x, latest.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = reading.bodyTempC >= 38.0 ? '#ef4444' : '#0ea5e9';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }

  // Update UI with the latest reading from getReading()
  function renderDashboard(reading) {
    if (!elements.totalWaterDrunk) return;

    // 1. Water Intake & Pack Graphic
    elements.totalWaterDrunk.textContent = reading.totalWaterDrunkMl.toLocaleString();
    elements.dailyGoalMl.textContent = reading.dailyGoalMl.toLocaleString();
    
    // Goal explanation formula breakdown
    const excess = Math.max(0, reading.outsideTempC - 30);
    elements.goalCalcExplainer.textContent = `Base: 2,000 ml + ${excess * 100} ml (+${excess}°C ambient heat at ${reading.outsideTempC}°C)`;

    // Pack graphic fill percentage (relative to daily goal, max 100%)
    const fillPercent = Math.min(100, Math.max(0, (reading.totalWaterDrunkMl / reading.dailyGoalMl) * 100));
    elements.packLiquid.style.height = `${fillPercent}%`;

    // Target Pace line position in the pack graphic
    const pacePercent = Math.min(100, Math.max(0, (reading.targetPaceMl / reading.dailyGoalMl) * 100));
    elements.packTargetLine.style.bottom = `${pacePercent}%`;
    elements.packTargetLabel.textContent = `Pace: ${reading.targetPaceMl} ml`;

    // Pace status indicator badge
    elements.targetPaceVal.textContent = `${reading.targetPaceMl} ml`;
    const diff = reading.totalWaterDrunkMl - reading.targetPaceMl;
    if (diff >= 0) {
      elements.paceDifferenceVal.textContent = `+${diff} ml (Ahead of pace)`;
      elements.paceDifferenceVal.style.color = 'var(--color-success)';
      elements.paceStatusBadge.className = 'card-badge status-live';
      elements.paceStatusBadge.textContent = 'On Track';
    } else {
      elements.paceDifferenceVal.textContent = `${diff} ml (Behind pace)`;
      elements.paceDifferenceVal.style.color = Math.abs(diff) > 250 ? 'var(--color-danger)' : 'var(--color-warning)';
      elements.paceStatusBadge.className = Math.abs(diff) > 250 ? 'card-badge status-paused' : 'card-badge';
      elements.paceStatusBadge.textContent = Math.abs(diff) > 250 ? 'Critical Deficit' : 'Behind Pace';
    }

    // 2. Tank Level (1.5 L)
    elements.tankLevelMl.textContent = reading.tankLevelMl.toLocaleString();
    elements.tankPercentVal.textContent = `${reading.tankPercent}%`;
    elements.tankProgressBar.style.width = `${reading.tankPercent}%`;

    if (reading.tankPercent <= 20) {
      elements.tankProgressBar.className = 'progress-bar-fill danger';
      elements.tankMinutesLeft.textContent = `${reading.estimatedMinutesLeft} min left (Refill needed)`;
      elements.tankMinutesLeft.style.color = 'var(--color-danger)';
      
      // Show tank low banner
      elements.tankLowBanner.style.display = 'flex';
      elements.tankLowText.innerHTML = `<strong>⚠️ Hydrapack Low:</strong> Only ${reading.tankLevelMl} ml remaining (~${reading.estimatedMinutesLeft} min left). <a href="map.html" style="text-decoration:underline; font-weight:700;">Find nearest water refill point on map →</a>`;
    } else if (reading.tankPercent <= 40) {
      elements.tankProgressBar.className = 'progress-bar-fill warning';
      elements.tankMinutesLeft.textContent = `~${reading.estimatedMinutesLeft} min left`;
      elements.tankMinutesLeft.style.color = 'var(--color-warning)';
      elements.tankLowBanner.style.display = 'none';
    } else {
      elements.tankProgressBar.className = 'progress-bar-fill';
      elements.tankMinutesLeft.textContent = `~${reading.estimatedMinutesLeft} min left`;
      elements.tankMinutesLeft.style.color = 'var(--text-secondary)';
      elements.tankLowBanner.style.display = 'none';
    }

    // 3. Body Temperature & Heat Stress Warning
    elements.bodyTempVal.textContent = reading.bodyTempC.toFixed(1);
    elements.peakBodyTempVal.textContent = `${reading.peakBodyTempC.toFixed(1)} °C`;

    if (reading.severeHeatStressWarning) {
      elements.bodyTempStatusBadge.className = 'card-badge status-paused';
      elements.bodyTempStatusBadge.style.background = 'var(--color-danger-bg)';
      elements.bodyTempStatusBadge.style.color = 'var(--color-danger)';
      elements.bodyTempStatusBadge.textContent = 'Severe Heat Strain';
      
      elements.heatStressBanner.style.display = 'flex';
      elements.heatStressBanner.className = 'alert-banner alert-danger';
      elements.heatStressText.innerHTML = `<strong>🚨 Critical Heat Strain Alert:</strong> Body core temperature reached ${reading.bodyTempC.toFixed(1)}°C and water intake is ${Math.abs(diff)} ml behind target pace! Take immediate shelter and rehydrate.`;
    } else if (reading.heatStressWarning) {
      elements.bodyTempStatusBadge.className = 'card-badge status-paused';
      elements.bodyTempStatusBadge.style.background = 'var(--color-warning-bg)';
      elements.bodyTempStatusBadge.style.color = 'var(--color-warning)';
      elements.bodyTempStatusBadge.textContent = 'Heat Stress (≥38°C)';

      elements.heatStressBanner.style.display = 'flex';
      elements.heatStressBanner.className = 'alert-banner alert-warning';
      elements.heatStressText.innerHTML = `<strong>⚠️ Heat Stress Warning:</strong> Body temperature is elevated at ${reading.bodyTempC.toFixed(1)}°C (≥ 38.0°C threshold). Drink cool water immediately.`;
    } else {
      elements.bodyTempStatusBadge.className = 'card-badge status-live';
      elements.bodyTempStatusBadge.style.background = 'var(--color-success-bg)';
      elements.bodyTempStatusBadge.style.color = 'var(--color-success)';
      elements.bodyTempStatusBadge.textContent = 'Normal Range';
      elements.heatStressBanner.style.display = 'none';
    }

    drawBodyTempChart(reading);

    // 4. Hourly Hydration Reminder Banner
    if (reading.isReminderDue) {
      elements.reminderBanner.style.display = 'flex';
      elements.reminderBannerText.innerHTML = `<strong>⚠️ Hydration Overdue:</strong> No sip logged for ${reading.minutesSinceLastSip} minutes (Threshold: ${reading.reminderIntervalMins} min at ${reading.outsideTempC}°C). Drink water now to maintain hydration pace.`;
    } else {
      elements.reminderBanner.style.display = 'none';
    }

    // 5. Controls & Shift Progress
    elements.shiftClockDisplay.textContent = reading.shiftTimeStr;
    elements.shiftProgressBar.style.width = `${reading.shiftProgressPercent}%`;
    elements.shiftPercentDisplay.textContent = `${reading.shiftProgressPercent}% of shift (${reading.elapsedShiftMinutes} / 480 min)`;

    if (reading.isSimulating) {
      elements.btnPlayPause.innerHTML = '⏸️ Pause';
      elements.btnPlayPause.className = 'btn btn-secondary';
    } else {
      elements.btnPlayPause.innerHTML = '▶️ Play Shift';
      elements.btnPlayPause.className = 'btn btn-primary';
    }

    // Slider sync
    if (document.activeElement !== elements.tempSlider) {
      elements.tempSlider.value = reading.outsideTempC;
    }
    elements.tempSliderVal.textContent = `${reading.outsideTempC}°C`;
    
    if (reading.outsideTempC >= 42) {
      elements.tempSeverityBadge.textContent = 'Severe Extreme Heat';
      elements.tempSeverityBadge.style.color = 'var(--color-danger)';
    } else if (reading.outsideTempC >= 38) {
      elements.tempSeverityBadge.textContent = 'Very High Heat';
      elements.tempSeverityBadge.style.color = 'var(--color-warning)';
    } else {
      elements.tempSeverityBadge.textContent = 'Moderate Summer Heat';
      elements.tempSeverityBadge.style.color = 'var(--primary)';
    }

    // 6. Recent sips log table
    if (elements.recentSipsList) {
      if (reading.sipsLog.length === 0) {
        elements.recentSipsList.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding: 1.5rem;">No sips logged yet in this shift. Hydration will log automatically or click "Log 200 ml Sip".</td></tr>';
      } else {
        const recent = reading.sipsLog.slice(0, 5);
        elements.recentSipsList.innerHTML = recent.map(sip => `
          <tr>
            <td><strong>${sip.clockStr}</strong></td>
            <td><span style="color:var(--primary); font-weight:700;">+${sip.ml} ml</span> ${sip.isManual ? '<span class="card-badge">Manual</span>' : ''}</td>
            <td>${sip.bodyTempC.toFixed(1)} °C</td>
            <td>${sip.outsideTempC} °C</td>
          </tr>
        `).join('');
      }
    }
  }

  // Bind all user events
  function bindEvents() {
    initDOMElements();

    // Play/Pause
    if (elements.btnPlayPause) {
      elements.btnPlayPause.addEventListener('click', () => {
        window.HydraCore.toggleSimulation();
      });
    }

    // Log manual 200 ml sip
    if (elements.btnLogSip) {
      elements.btnLogSip.addEventListener('click', () => {
        const res = window.HydraCore.recordSip(200, true);
        if (!res.success && res.reason === 'tank_empty') {
          alert('Hydrapack tank is empty (0 ml)! Please click "Refill Tank" or refill at a water station.');
        }
      });
    }

    // Refill Tank
    if (elements.btnRefillTank) {
      elements.btnRefillTank.addEventListener('click', () => {
        window.HydraCore.refillTank();
      });
    }

    // Snooze Reminder (10 shift minutes)
    if (elements.btnSnoozeReminder) {
      elements.btnSnoozeReminder.addEventListener('click', () => {
        window.HydraCore.snoozeReminder(10);
      });
    }

    // Reminder Quick Sip
    if (elements.btnReminderQuickSip) {
      elements.btnReminderQuickSip.addEventListener('click', () => {
        window.HydraCore.recordSip(200, true);
        window.HydraCore.snoozeReminder(30);
      });
    }

    // Reset Shift
    if (elements.btnResetShift) {
      elements.btnResetShift.addEventListener('click', () => {
        if (confirm('Reset shift back to 11:00 AM? This will clear current shift telemetry.')) {
          window.HydraCore.resetShift();
        }
      });
    }

    // Outside temperature slider
    if (elements.tempSlider) {
      elements.tempSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        window.HydraCore.setOutsideTemp(val);
      });
    }

    // Redraw chart on resize
    window.addEventListener('resize', () => {
      const reading = window.HydraCore.getReading();
      drawBodyTempChart(reading);
    });

    // Subscribe to telemetry updates
    window.HydraCore.subscribe(renderDashboard);

    // Initial render
    renderDashboard(window.HydraCore.getReading());
  }

  document.addEventListener('DOMContentLoaded', bindEvents);

})();
