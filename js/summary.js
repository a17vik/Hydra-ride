/**
 * HydraRide - Shift Summary Logic
 * Computes Shift Hydration Score, Goal Adherence %, Peak Core Temperature,
 * Missed Reminders count, and draws the 8-Hour Intake Bar Chart using Canvas.
 */

(function () {
  'use strict';

  let summaryElements = {};

  function initElements() {
    summaryElements = {
      scoreCircleNum: document.getElementById('scoreCircleNum'),
      scoreGradeBadge: document.getElementById('scoreGradeBadge'),
      scoreVerdictText: document.getElementById('scoreVerdictText'),
      scorePillVolume: document.getElementById('scorePillVolume'),
      scorePillThermal: document.getElementById('scorePillThermal'),
      scorePillPacing: document.getElementById('scorePillPacing'),

      summaryTotalWater: document.getElementById('summaryTotalWater'),
      summaryGoalPercent: document.getElementById('summaryGoalPercent'),
      summaryGoalSub: document.getElementById('summaryGoalSub'),
      summaryPeakTemp: document.getElementById('summaryPeakTemp'),
      summaryPeakTempSub: document.getElementById('summaryPeakTempSub'),
      summaryMissedReminders: document.getElementById('summaryMissedReminders'),
      summaryMissedRemindersSub: document.getElementById('summaryMissedRemindersSub'),

      hourlyChartCanvas: document.getElementById('hourlyChartCanvas'),
      shiftSipLogTable: document.getElementById('shiftSipLogTable'),
      btnSimulateCompleteShift: document.getElementById('btnSimulateCompleteShift'),
      btnSummaryReset: document.getElementById('btnSummaryReset')
    };
  }

  // Calculate Comprehensive Hydration Score (0 - 100)
  function computeHydrationScore(reading) {
    const { totalWaterDrunkMl, dailyGoalMl, peakBodyTempC, missedRemindersCount, elapsedShiftMinutes } = reading;

    // 1. Intake Volume Component (0 to 40 pts)
    const intakeRatio = dailyGoalMl > 0 ? (totalWaterDrunkMl / dailyGoalMl) : 0;
    const expectedRatio = Math.max(0.1, elapsedShiftMinutes / 480);
    // Grade based on whether intake matches current expected pace or total goal
    const volumeScore = Math.min(40, Math.round((intakeRatio / expectedRatio) * 40));

    // 2. Thermal Regulation Component (0 to 30 pts)
    let thermalScore = 30;
    if (peakBodyTempC >= 38.3) {
      thermalScore = 10;
    } else if (peakBodyTempC >= 38.0) {
      thermalScore = 18;
    } else if (peakBodyTempC >= 37.6) {
      thermalScore = 25;
    }

    // 3. Pacing Consistency & Reminder Adherence (0 to 30 pts)
    const pacingDeductions = (missedRemindersCount || 0) * 8;
    const pacingScore = Math.max(0, 30 - pacingDeductions);

    const totalScore = Math.min(100, Math.max(0, volumeScore + thermalScore + pacingScore));

    let grade = 'A';
    let verdict = 'Optimal Hydration: Outstanding pacing and thermal defense.';
    let color = 'var(--color-success)';

    if (totalScore >= 90) {
      grade = 'A+';
      verdict = 'Elite Hydration: Complete thermal resilience and punctual sipping.';
      color = '#10b981';
    } else if (totalScore >= 80) {
      grade = 'A';
      verdict = 'Good Hydration: Maintained safe hydration pace in extreme heat.';
      color = '#0284c7';
    } else if (totalScore >= 65) {
      grade = 'B';
      verdict = 'Moderate Risk: Occasional dehydration gaps detected.';
      color = '#f59e0b';
    } else {
      grade = 'C';
      verdict = 'High Heat Strain Risk: Insufficient water intake relative to ambient heat.';
      color = '#ef4444';
    }

    return {
      totalScore,
      grade,
      verdict,
      color,
      volumeScore,
      thermalScore,
      pacingScore
    };
  }

  // Render 8-Hour Water Intake Bar Chart via Canvas
  function drawHourlyChart(reading) {
    const canvas = summaryElements.hourlyChartCanvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 600;
    const height = rect.height || 240;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const padding = { top: 30, right: 24, bottom: 40, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const hourLabels = [
      '11-12 AM', '12-1 PM', '1-2 PM', '2-3 PM',
      '3-4 PM', '4-5 PM', '5-6 PM', '6-7 PM'
    ];
    const intake = reading.hourlyIntake || [0,0,0,0,0,0,0,0];

    // Hourly target pace = dailyGoalMl / 8
    const hourlyTarget = Math.round(reading.dailyGoalMl / 8);

    // Max scale
    const maxIntake = Math.max(hourlyTarget * 1.3, ...intake, 500);

    // Draw horizontal grid lines
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const val = Math.round((maxIntake / gridSteps) * i);
      const y = padding.top + chartH - (val / maxIntake) * chartH;
      
      ctx.beginPath();
      ctx.strokeStyle = isDark ? '#1e293b' : '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();

      ctx.fillText(`${val} ml`, padding.left - 8, y);
    }

    // Target Pace Line across hours
    const targetY = padding.top + chartH - (hourlyTarget / maxIntake) * chartH;
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.moveTo(padding.left, targetY);
    ctx.lineTo(padding.left + chartW, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.fillText(`Target: ${hourlyTarget} ml/hr`, padding.left + 8, targetY - 10);

    // Draw Bars
    const barSpacing = chartW / 8;
    const barWidth = Math.min(36, barSpacing * 0.6);

    const currentHourIdx = Math.min(7, Math.floor(reading.elapsedShiftMinutes / 60));

    hourLabels.forEach((label, idx) => {
      const x = padding.left + idx * barSpacing + (barSpacing - barWidth) / 2;
      const ml = intake[idx] || 0;
      const barH = (ml / maxIntake) * chartH;
      const y = padding.top + chartH - barH;

      // Color coding: is this hour finished, in-progress, or upcoming?
      let barGrad = ctx.createLinearGradient(0, y, 0, padding.top + chartH);
      if (idx > currentHourIdx && reading.elapsedShiftMinutes < 480) {
        // Upcoming hour (empty)
        ctx.fillStyle = isDark ? '#1e293b' : '#f1f5f9';
        ctx.fillRect(x, padding.top + chartH - 4, barWidth, 4);
      } else {
        if (ml >= hourlyTarget) {
          barGrad.addColorStop(0, '#10b981');
          barGrad.addColorStop(1, '#059669');
        } else if (ml > 0) {
          barGrad.addColorStop(0, '#0ea5e9');
          barGrad.addColorStop(1, '#0284c7');
        } else {
          barGrad.addColorStop(0, '#f59e0b');
          barGrad.addColorStop(1, '#d97706');
        }

        // Draw rounded bar
        ctx.fillStyle = barGrad;
        ctx.beginPath();
        const r = 4;
        ctx.moveTo(x, padding.top + chartH);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barWidth - r, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
        ctx.lineTo(x + barWidth, padding.top + chartH);
        ctx.closePath();
        ctx.fill();

        // Label above bar
        if (ml > 0) {
          ctx.fillStyle = isDark ? '#cbd5e1' : '#334155';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${ml}`, x + barWidth / 2, y - 6);
        }
      }

      // X-axis label
      ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + barWidth / 2, padding.top + chartH + 18);
    });
  }

  // Render all Summary Metrics & Table
  function renderSummary() {
    if (!summaryElements.scoreCircleNum) return;

    const reading = window.HydraCore ? window.HydraCore.getReading() : {
      totalWaterDrunkMl: 0,
      dailyGoalMl: 2800,
      peakBodyTempC: 36.8,
      missedRemindersCount: 0,
      elapsedShiftMinutes: 0,
      outsideTempC: 38,
      sipsLog: []
    };

    // Hydration Score
    const score = computeHydrationScore(reading);
    summaryElements.scoreCircleNum.textContent = score.totalScore;
    summaryElements.scoreCircleNum.style.color = score.color;
    summaryElements.scoreGradeBadge.textContent = `Grade ${score.grade}`;
    summaryElements.scoreGradeBadge.style.background = score.color;
    summaryElements.scoreGradeBadge.style.color = '#ffffff';
    summaryElements.scoreVerdictText.textContent = score.verdict;

    summaryElements.scorePillVolume.textContent = `Volume: ${score.volumeScore}/40`;
    summaryElements.scorePillThermal.textContent = `Thermal: ${score.thermalScore}/30`;
    summaryElements.scorePillPacing.textContent = `Pacing: ${score.pacingScore}/30`;

    // 1. Total Water
    const totalL = (reading.totalWaterDrunkMl / 1000).toFixed(2);
    summaryElements.summaryTotalWater.textContent = `${reading.totalWaterDrunkMl.toLocaleString()} ml (${totalL} L)`;

    // 2. Goal Reached %
    const percent = reading.dailyGoalMl > 0 ? ((reading.totalWaterDrunkMl / reading.dailyGoalMl) * 100).toFixed(1) : 0;
    summaryElements.summaryGoalPercent.textContent = `${percent}%`;
    summaryElements.summaryGoalSub.textContent = `Goal: ${reading.dailyGoalMl.toLocaleString()} ml (Based on ${reading.outsideTempC}°C heat)`;

    // 3. Peak Body Temp
    summaryElements.summaryPeakTemp.textContent = `${reading.peakBodyTempC.toFixed(1)} °C`;
    if (reading.peakBodyTempC >= 38.0) {
      summaryElements.summaryPeakTempSub.textContent = '⚠️ Heat stress threshold exceeded (≥ 38°C)';
      summaryElements.summaryPeakTempSub.style.color = 'var(--color-danger)';
    } else {
      summaryElements.summaryPeakTempSub.textContent = '✓ Maintained within safe homeostatic range';
      summaryElements.summaryPeakTempSub.style.color = 'var(--color-success)';
    }

    // 4. Missed Reminders
    summaryElements.summaryMissedReminders.textContent = reading.missedRemindersCount;
    summaryElements.summaryMissedRemindersSub.textContent = reading.missedRemindersCount === 0
      ? '✓ Perfect: Sipped consistently within threshold'
      : `${reading.missedRemindersCount} gap(s) exceeded reminder threshold`;

    // Draw Bar Chart
    drawHourlyChart(reading);

    // Populate Complete Sip Log Table
    if (summaryElements.shiftSipLogTable) {
      if (reading.sipsLog.length === 0) {
        summaryElements.shiftSipLogTable.innerHTML = `
          <tr>
            <td colspan="5" style="text-align:center; padding: 2rem; color:var(--text-muted);">
              No sips logged yet in this shift. Return to the <a href="index.html" style="text-decoration:underline;">Dashboard</a> to play the shift or click "Instant Full Shift Demo" below.
            </td>
          </tr>
        `;
      } else {
        summaryElements.shiftSipLogTable.innerHTML = reading.sipsLog.map((sip, idx) => `
          <tr>
            <td><strong>#${reading.sipsLog.length - idx}</strong></td>
            <td>${sip.clockStr}</td>
            <td><strong style="color:var(--primary);">+${sip.ml} ml</strong></td>
            <td>${sip.bodyTempC.toFixed(1)} °C</td>
            <td>${sip.outsideTempC} °C</td>
          </tr>
        `).join('');
      }
    }
  }

  // Bind Events
  function bindSummaryEvents() {
    initElements();

    // Instant Full Shift Demo (convenient for jury!)
    if (summaryElements.btnSimulateCompleteShift) {
      summaryElements.btnSimulateCompleteShift.addEventListener('click', () => {
        if (confirm('Simulate a complete 8-hour shift (11am – 7pm) at 41°C heat? This loads realistic hydration and thermal data instantly.')) {
          window.HydraCore.simulateCompletedShift();
          renderSummary();
        }
      });
    }

    // Reset Shift
    if (summaryElements.btnSummaryReset) {
      summaryElements.btnSummaryReset.addEventListener('click', () => {
        if (confirm('Clear shift data and reset back to 11:00 AM?')) {
          window.HydraCore.resetShift();
          renderSummary();
        }
      });
    }

    // Window resize
    window.addEventListener('resize', () => {
      if (window.HydraCore) {
        drawHourlyChart(window.HydraCore.getReading());
      }
    });

    // Subscribe
    if (window.HydraCore) {
      window.HydraCore.subscribe(renderSummary);
    }

    renderSummary();
  }

  document.addEventListener('DOMContentLoaded', bindSummaryEvents);

})();
