/**
 * HydraRide - Shared UI & Navigation Helper
 * Handles theme toggling (light/dark), audio toggles, notification prompt,
 * and header status badge synchronization across all pages.
 */

(function () {
  'use strict';

  // Theme Management
  const THEME_KEY = 'hydraride_theme_mode';

  function initTheme() {
    let savedTheme = localStorage.getItem(THEME_KEY);
    if (!savedTheme) {
      savedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    
    // Update theme toggle icons
    const themeBtns = document.querySelectorAll('.theme-toggle-btn');
    themeBtns.forEach(btn => {
      btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      btn.setAttribute('title', theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  // Bind Navbar Controls
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    // Theme buttons
    const themeBtns = document.querySelectorAll('.theme-toggle-btn');
    themeBtns.forEach(btn => {
      btn.addEventListener('click', toggleTheme);
    });

    // Sound toggle buttons
    const soundBtns = document.querySelectorAll('.sound-toggle-btn');
    if (window.HydraCore) {
      const updateSoundIcons = () => {
        const settings = window.HydraCore.getSettings();
        soundBtns.forEach(btn => {
          btn.innerHTML = settings.soundEnabled ? '🔊' : '🔇';
          btn.setAttribute('title', settings.soundEnabled ? 'Mute Audio Alerts' : 'Unmute Audio Alerts');
        });
      };
      updateSoundIcons();

      soundBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const s = window.HydraCore.getSettings();
          window.HydraCore.setSoundEnabled(!s.soundEnabled);
          updateSoundIcons();
        });
      });

      // Browser notification request
      const notifBtns = document.querySelectorAll('.notif-toggle-btn');
      notifBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          window.HydraCore.requestNotificationPermission();
        });
      });

      // Subscribe to telemetry to update shared header items
      window.HydraCore.subscribe(reading => {
        // Shift clock
        const clocks = document.querySelectorAll('.header-shift-clock');
        clocks.forEach(el => {
          el.textContent = reading.shiftTimeStr;
        });

        // Status tag (Live / Paused / Complete)
        const statusTags = document.querySelectorAll('.header-shift-status');
        statusTags.forEach(el => {
          if (reading.isShiftComplete) {
            el.className = 'shift-status-tag status-paused';
            el.innerHTML = '<span class="dot"></span> Shift Ended';
          } else if (reading.isSimulating) {
            el.className = 'shift-status-tag status-live';
            el.innerHTML = '<span class="dot"></span> Active (Playing)';
          } else {
            el.className = 'shift-status-tag status-paused';
            el.innerHTML = '<span class="dot"></span> Paused';
          }
        });
      });

      // Initial read to sync header
      const initial = window.HydraCore.getReading();
      const clocks = document.querySelectorAll('.header-shift-clock');
      clocks.forEach(el => { el.textContent = initial.shiftTimeStr; });
    }
  });

})();
