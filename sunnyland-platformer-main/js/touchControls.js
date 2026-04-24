// ============================================
// SUNNYLAND TOUCH CONTROLS
// Adds mobile touch controls (d-pad + jump/roll buttons)
// Only activates on touch-capable devices.
// ============================================

(function initSunnylandTouchControls() {
  const isMobile =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches;

  if (!isMobile) return;

  // --- Inject CSS ---
  const style = document.createElement('style');
  style.textContent = `
    #sl-touch-controls {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 9000;
      pointer-events: none;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding: 20px 16px 24px;
    }
    #sl-touch-controls * {
      pointer-events: auto;
    }

    /* D-pad */
    .sl-dpad {
      display: grid;
      grid-template-columns: 52px 52px 52px;
      grid-template-rows: 52px 52px;
      gap: 6px;
    }
    .sl-dpad-btn {
      width: 52px;
      height: 52px;
      border-radius: 12px;
      background: rgba(8, 8, 26, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1.5px solid rgba(0, 255, 213, 0.2);
      color: #00ffd5;
      font-size: 1.3rem;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
      box-shadow: 0 0 10px rgba(0, 255, 213, 0.05);
    }
    .sl-dpad-btn:active, .sl-dpad-btn.active {
      background: rgba(0, 255, 213, 0.2);
      border-color: rgba(0, 255, 213, 0.5);
      box-shadow: 0 0 20px rgba(0, 255, 213, 0.3);
    }
    .sl-dpad-spacer { visibility: hidden; }

    /* Action buttons */
    .sl-actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .sl-action-btn {
      border-radius: 50%;
      background: rgba(8, 8, 26, 0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1.5px solid rgba(0, 255, 213, 0.2);
      color: #00ffd5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
      box-shadow: 0 0 10px rgba(0, 255, 213, 0.05);
    }
    .sl-action-btn:active, .sl-action-btn.active {
      background: rgba(0, 255, 213, 0.2);
      border-color: rgba(0, 255, 213, 0.5);
      box-shadow: 0 0 25px rgba(0, 255, 213, 0.35);
    }
    .sl-jump-btn {
      width: 68px;
      height: 68px;
      font-size: 1.6rem;
    }
    .sl-roll-btn {
      width: 56px;
      height: 56px;
      font-size: 1.1rem;
    }
    .sl-btn-label {
      font-family: monospace;
      font-size: 0.5rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      opacity: 0.6;
      margin-top: 1px;
      pointer-events: none;
    }

    /* Hide the keyboard instructions on mobile */
    p[style*="color: #00ffd5"] {
      display: none !important;
    }

    @media (max-height: 400px) {
      .sl-dpad-btn { width: 42px; height: 42px; font-size: 1rem; }
      .sl-dpad { grid-template-columns: 42px 42px 42px; grid-template-rows: 42px 42px; gap: 4px; }
      .sl-jump-btn { width: 54px; height: 54px; font-size: 1.3rem; }
      .sl-roll-btn { width: 44px; height: 44px; font-size: 0.9rem; }
      #sl-touch-controls { padding: 12px 10px 14px; }
      .sl-btn-label { display: none; }
    }
  `;
  document.head.appendChild(style);

  // --- Create HTML ---
  const container = document.createElement('div');
  container.id = 'sl-touch-controls';
  container.innerHTML = `
    <div class="sl-dpad">
      <div class="sl-dpad-spacer"></div>
      <div class="sl-dpad-spacer"></div>
      <div class="sl-dpad-spacer"></div>
      <button class="sl-dpad-btn" id="sl-btn-left" aria-label="Move Left">◀</button>
      <div class="sl-dpad-spacer"></div>
      <button class="sl-dpad-btn" id="sl-btn-right" aria-label="Move Right">▶</button>
    </div>
    <div class="sl-actions">
      <button class="sl-action-btn sl-jump-btn" id="sl-btn-jump" aria-label="Jump">
        <span>⬆</span>
        <span class="sl-btn-label">Jump</span>
      </button>
      <button class="sl-action-btn sl-roll-btn" id="sl-btn-roll" aria-label="Roll/Attack">
        <span>⚔</span>
        <span class="sl-btn-label">Roll</span>
      </button>
    </div>
  `;
  document.body.appendChild(container);

  // --- Wire up events ---
  const leftBtn = document.getElementById('sl-btn-left');
  const rightBtn = document.getElementById('sl-btn-right');
  const jumpBtn = document.getElementById('sl-btn-jump');
  const rollBtn = document.getElementById('sl-btn-roll');

  // Left button
  leftBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys.a.pressed = true;
    leftBtn.classList.add('active');
  }, { passive: false });
  leftBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    keys.a.pressed = false;
    leftBtn.classList.remove('active');
  }, { passive: false });
  leftBtn.addEventListener('touchcancel', (e) => {
    keys.a.pressed = false;
    leftBtn.classList.remove('active');
  });

  // Right button
  rightBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    keys.d.pressed = true;
    rightBtn.classList.add('active');
  }, { passive: false });
  rightBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    keys.d.pressed = false;
    rightBtn.classList.remove('active');
  }, { passive: false });
  rightBtn.addEventListener('touchcancel', (e) => {
    keys.d.pressed = false;
    rightBtn.classList.remove('active');
  });

  // Jump button
  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (typeof player !== 'undefined' && player) {
      player.jump();
    }
    jumpBtn.classList.add('active');
  }, { passive: false });
  jumpBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    jumpBtn.classList.remove('active');
  }, { passive: false });

  // Roll / Attack button
  rollBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (typeof player !== 'undefined' && player) {
      player.roll();
    }
    rollBtn.classList.add('active');
  }, { passive: false });
  rollBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    rollBtn.classList.remove('active');
  }, { passive: false });

  // --- Tap canvas to restart on death/win ---
  const gameCanvas = document.querySelector('canvas');
  if (gameCanvas) {
    gameCanvas.addEventListener('touchstart', (e) => {
      if (typeof isDead !== 'undefined' && isDead && typeof _deathTime !== 'undefined' && _deathTime > 1.5) {
        e.preventDefault();
        init();
      } else if (typeof gameWon !== 'undefined' && gameWon && typeof _winTime !== 'undefined' && _winTime > 2) {
        e.preventDefault();
        init();
      }
    }, { passive: false });
  }
})();
