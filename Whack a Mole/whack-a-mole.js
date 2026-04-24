/**
 * WhackAMole — Modular 2D Whack-a-Mole Minigame
 * 
 * A self-contained, embeddable minigame component with:
 * - Configurable grid (rows × cols)
 * - Mouse + keyboard (number keys & numpad) input
 * - Clean callback/event API
 * - Low-poly sci-fi visual theme
 * 
 * Usage:
 *   const game = new WhackAMole(containerElement, config);
 *   game.startGame();
 */
const WhackAMole = (function () {
  'use strict';

  // ─── Default Configuration ─────────────────────────────────────────
  const DEFAULT_CONFIG = {
    rows: 3,
    cols: 3,
    gameDuration: 30,           // seconds
    spawnInterval: [500, 1200], // [min, max] ms between spawns
    moleVisibleTime: 800,       // ms a mole stays visible
    allowMissPenalty: true,
    inputMode: 'mouse+keyboard', // 'mouse' | 'keyboard' | 'mouse+keyboard'

    // Target streak (consecutive hits goal)
    targetStreakRange: [7, 14],  // [min, max] random target each round

    // Callbacks
    onGameStart: null,
    onHit: null,
    onMiss: null,
    onScoreChange: null,
    onGameComplete: null,
    onTargetReached: null,       // fired when player hits target streak

    // Sound hooks (called with no args — user supplies implementation)
    onHitSound: null,
    onMissSound: null,
    onSpawnSound: null,
  };

  // ─── Key Mappings ──────────────────────────────────────────────────
  const KEY_MAP = {};
  for (let i = 1; i <= 9; i++) {
    KEY_MAP[`Digit${i}`] = i;
    KEY_MAP[`Numpad${i}`] = i;
  }

  // ─── Utility ───────────────────────────────────────────────────────
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function randFloat(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // ─── Hole Component ────────────────────────────────────────────────
  class Hole {
    constructor(index) {
      this.index = index;         // 1-based
      this.state = 'empty';       // 'empty' | 'active' | 'hit'
      this.moleId = 0;            // unique id per spawn to prevent double-hit
      this.timeoutId = null;
      this.el = null;             // DOM element reference
      this.moleEl = null;
      this.numberEl = null;
      this.feedbackEl = null;
    }
  }

  // ─── Main Class ────────────────────────────────────────────────────
  class WhackAMoleGame {
    constructor(container, config) {
      if (!container || !(container instanceof HTMLElement)) {
        throw new Error('WhackAMole: A valid container HTMLElement is required.');
      }

      this._container = container;
      this._config = Object.assign({}, DEFAULT_CONFIG, config);
      this._holes = [];
      this._score = 0;
      this._hits = 0;
      this._misses = 0;
      this._totalSpawns = 0;
      this._moleIdCounter = 0;
      this._gameActive = false;
      this._gamePaused = false;
      this._gameTimerId = null;
      this._spawnTimerId = null;
      this._timeRemaining = this._config.gameDuration;
      this._tickTimerId = null;
      this._rootEl = null;
      this._gridEl = null;
      this._hudEl = null;
      this._boundKeyHandler = null;
      this._styleEl = null;
      this._destroyed = false;

      // Streak tracking
      this._streak = 0;
      this._bestStreak = 0;
      this._targetStreak = 0;
      this._targetReached = false;

      this._init();
    }

    // ── Public API ─────────────────────────────────────────────────

    startGame(overrideConfig) {
      if (this._destroyed) return;
      if (overrideConfig) {
        Object.assign(this._config, overrideConfig);
      }
      this._resetState();
      this._buildGrid();
      this._gameActive = true;
      this._gamePaused = false;
      this._timeRemaining = this._config.gameDuration;

      // Generate random target streak for this round
      const [minT, maxT] = this._config.targetStreakRange;
      this._targetStreak = randInt(minT, maxT);
      this._targetReached = false;

      this._updateHUD();
      this._updateStreakBar();
      this._startOverlay.style.display = 'none';
      this._gameOverEl.classList.remove('visible');
      this._hideGoalBanner();
      this._scheduleNextSpawn();
      this._startTimer();
      this._emit('onGameStart');
    }

    pauseGame() {
      if (!this._gameActive || this._gamePaused || this._destroyed) return;
      this._gamePaused = true;
      clearTimeout(this._spawnTimerId);
      clearInterval(this._tickTimerId);
      // Pause all hole timeouts
      this._holes.forEach(h => {
        if (h.timeoutId) {
          clearTimeout(h.timeoutId);
          h.timeoutId = null;
        }
      });
    }

    resumeGame() {
      if (!this._gameActive || !this._gamePaused || this._destroyed) return;
      this._gamePaused = false;
      this._scheduleNextSpawn();
      this._startTimer();
      // Re-schedule visible moles (simplified — just let new spawns happen)
    }

    resetGame() {
      if (this._destroyed) return;
      this._stopAll();
      this._resetState();
      this._buildGrid();
      this._updateHUD();
    }

    destroyGame() {
      if (this._destroyed) return;
      this._destroyed = true;
      this._stopAll();
      if (this._boundKeyHandler) {
        document.removeEventListener('keydown', this._boundKeyHandler);
        this._boundKeyHandler = null;
      }
      if (this._rootEl && this._rootEl.parentNode) {
        this._rootEl.parentNode.removeChild(this._rootEl);
      }
      if (this._styleEl && this._styleEl.parentNode) {
        this._styleEl.parentNode.removeChild(this._styleEl);
      }
      this._holes = [];
    }

    // ── Private — Initialization ───────────────────────────────────

    _init() {
      this._injectStyles();
      this._buildDOM();
      this._bindInput();
      this._buildGrid();
      this._updateHUD();
    }

    _injectStyles() {
      const id = 'whack-a-mole-styles-' + Date.now();
      if (document.getElementById(id)) return;

      const css = `
/* ── WhackAMole Scoped Styles ────────────────────────── */
.wam-root {
  --wam-bg: #0a0e1a;
  --wam-panel: #111827;
  --wam-border: #1e293b;
  --wam-cyan: #00f0ff;
  --wam-purple: #a855f7;
  --wam-blue: #3b82f6;
  --wam-pink: #ec4899;
  --wam-green: #22d3ee;
  --wam-red: #f43f5e;
  --wam-text: #e2e8f0;
  --wam-text-dim: #64748b;
  --wam-glow-cyan: 0 0 20px rgba(0,240,255,0.4), 0 0 40px rgba(0,240,255,0.15);
  --wam-glow-purple: 0 0 20px rgba(168,85,247,0.5), 0 0 40px rgba(168,85,247,0.2);
  --wam-glow-red: 0 0 15px rgba(244,63,94,0.5);
  --wam-glow-green: 0 0 15px rgba(34,211,238,0.5);

  position: relative;
  width: 100%;
  max-width: min(540px, 95vw);
  margin: 0 auto;
  font-family: 'Orbitron', 'Rajdhani', 'Segoe UI', sans-serif;
  color: var(--wam-text);
  user-select: none;
  -webkit-user-select: none;
}

/* ── HUD ─────────────────────────────────────────────── */
.wam-hud {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: clamp(6px, 1.5vmin, 12px) clamp(8px, 2vmin, 16px);
  margin-bottom: clamp(6px, 1.5vmin, 12px);
  background: linear-gradient(135deg, rgba(17,24,39,0.95), rgba(30,41,59,0.9));
  border: 1px solid var(--wam-border);
  border-radius: 8px;
  backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}

.wam-hud-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.wam-hud-label {
  font-size: clamp(7px, 1.5vmin, 9px);
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--wam-text-dim);
}

.wam-hud-value {
  font-size: clamp(14px, 3.5vmin, 22px);
  font-weight: 700;
  letter-spacing: 1px;
}

.wam-hud-value.score { color: var(--wam-cyan); text-shadow: var(--wam-glow-cyan); }
.wam-hud-value.time  { color: var(--wam-purple); text-shadow: var(--wam-glow-purple); }
.wam-hud-value.hits  { color: var(--wam-green); }
.wam-hud-value.misses { color: var(--wam-red); }
.wam-hud-value.streak { color: #facc15; text-shadow: 0 0 12px rgba(250,204,21,0.4); }
.wam-hud-value.target { color: #fb923c; text-shadow: 0 0 12px rgba(251,146,60,0.3); }

/* ── Streak Target Bar ───────────────────────────────── */
.wam-streak-bar-wrap {
  width: 100%;
  padding: 6px 16px 0;
  margin-bottom: 6px;
}

.wam-streak-bar-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--wam-text-dim);
  margin-bottom: 4px;
}

.wam-streak-bar-label .wam-streak-current {
  color: #facc15;
  font-weight: 700;
}

.wam-streak-bar-track {
  width: 100%;
  height: 6px;
  background: rgba(30,41,59,0.8);
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid rgba(250,204,21,0.1);
}

.wam-streak-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #facc15, #fb923c);
  border-radius: 3px;
  transition: width 0.2s ease-out;
  box-shadow: 0 0 8px rgba(250,204,21,0.3);
}

.wam-streak-bar-fill.complete {
  background: linear-gradient(90deg, #22d3ee, #a855f7);
  box-shadow: 0 0 12px rgba(34,211,238,0.5);
}

/* ── Goal Achieved Banner ────────────────────────────── */
.wam-goal-banner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.5);
  padding: 14px 32px;
  background: rgba(10,14,26,0.92);
  border: 2px solid rgba(34,211,238,0.6);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  z-index: 12;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s, transform 0.3s;
}

.wam-goal-banner.visible {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
  animation: wam-goal-pulse 0.6s ease-out;
}

.wam-goal-banner-title {
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 3px;
  text-transform: uppercase;
  background: linear-gradient(90deg, #22d3ee, #a855f7);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.wam-goal-banner-sub {
  font-size: 11px;
  color: var(--wam-text-dim);
  margin-top: 2px;
  letter-spacing: 1px;
}

@keyframes wam-goal-pulse {
  0%   { transform: translate(-50%, -50%) scale(0.5); }
  50%  { transform: translate(-50%, -50%) scale(1.08); }
  100% { transform: translate(-50%, -50%) scale(1); }
}

/* ── Timer Bar ───────────────────────────────────────── */
.wam-timer-bar-wrap {
  width: 100%;
  height: 4px;
  background: var(--wam-border);
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
}

.wam-timer-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--wam-cyan), var(--wam-purple));
  border-radius: 2px;
  transition: width 0.3s linear;
  box-shadow: 0 0 8px rgba(0,240,255,0.3);
}

/* ── Grid ────────────────────────────────────────────── */
.wam-grid {
  display: grid;
  gap: clamp(5px, 1.5vmin, 10px);
  padding: clamp(8px, 2vmin, 16px);
  background: linear-gradient(145deg, rgba(10,14,26,0.9), rgba(17,24,39,0.85));
  border: 1px solid var(--wam-border);
  border-radius: 12px;
  box-shadow: inset 0 0 60px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.4);
}

/* ── Hole ────────────────────────────────────────────── */
.wam-hole {
  position: relative;
  aspect-ratio: 1;
  background: radial-gradient(circle at 50% 40%, #1a2235, #0d1117);
  border: 2px solid #1e293b;
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wam-hole::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 50%);
  pointer-events: none;
}

/* Hex pattern overlay */
.wam-hole::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(30deg, rgba(0,240,255,0.02) 12%, transparent 12.5%, transparent 87%, rgba(0,240,255,0.02) 87.5%),
    linear-gradient(150deg, rgba(0,240,255,0.02) 12%, transparent 12.5%, transparent 87%, rgba(0,240,255,0.02) 87.5%),
    linear-gradient(270deg, rgba(0,240,255,0.02) 12%, transparent 12.5%, transparent 87%, rgba(0,240,255,0.02) 87.5%);
  background-size: 20px 35px;
  pointer-events: none;
  border-radius: 8px;
}

.wam-hole:hover {
  border-color: rgba(0,240,255,0.3);
  box-shadow: inset 0 0 20px rgba(0,240,255,0.05);
}

.wam-hole:active {
  transform: scale(0.97);
}

/* ── Hole Number Badge ───────────────────────────────── */
.wam-hole-number {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(100,116,139,0.6);
  letter-spacing: 1px;
  z-index: 2;
  pointer-events: none;
}

/* ── Mole ────────────────────────────────────────────── */
.wam-mole {
  position: absolute;
  width: 65%;
  height: 65%;
  border-radius: 50%;
  opacity: 0;
  transform: scale(0.3) translateY(30px);
  transition: opacity 0.12s ease-out, transform 0.12s ease-out;
  pointer-events: none;
  z-index: 3;
}

/* Energy orb mole design */
.wam-mole-inner {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, 
    rgba(0,240,255,0.9), 
    rgba(168,85,247,0.7) 50%, 
    rgba(59,130,246,0.5) 100%);
  box-shadow: 
    0 0 20px rgba(0,240,255,0.6),
    0 0 40px rgba(168,85,247,0.3),
    inset 0 -4px 12px rgba(0,0,0,0.3),
    inset 0 2px 8px rgba(255,255,255,0.2);
  animation: wam-orb-pulse 0.6s ease-in-out infinite alternate;
}

/* Orb core */
.wam-mole-inner::before {
  content: '';
  position: absolute;
  top: 18%;
  left: 22%;
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.8), rgba(0,240,255,0.4));
  filter: blur(2px);
}

/* Orb ring */
.wam-mole-inner::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid rgba(0,240,255,0.3);
  animation: wam-ring-spin 2s linear infinite;
}

.wam-hole.active .wam-mole {
  opacity: 1;
  transform: scale(1) translateY(0);
}

.wam-hole.active {
  border-color: rgba(0,240,255,0.5);
  box-shadow: 
    inset 0 0 30px rgba(0,240,255,0.1),
    0 0 15px rgba(0,240,255,0.15);
}

/* ── Hit State ───────────────────────────────────────── */
.wam-hole.hit .wam-mole {
  opacity: 1;
  transform: scale(1.2) translateY(0);
}

.wam-hole.hit .wam-mole-inner {
  background: radial-gradient(circle at 35% 35%, 
    rgba(34,211,238,1), 
    rgba(16,185,129,0.8) 50%, 
    rgba(34,211,238,0.5) 100%);
  box-shadow: 
    0 0 30px rgba(34,211,238,0.8),
    0 0 60px rgba(16,185,129,0.4);
  animation: none;
}

.wam-hole.hit {
  border-color: rgba(34,211,238,0.7);
  box-shadow: 
    inset 0 0 40px rgba(34,211,238,0.15),
    0 0 20px rgba(34,211,238,0.3);
}

/* ── Feedback Overlay ────────────────────────────────── */
.wam-feedback {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(14px, 3.5vmin, 20px);
  font-weight: 900;
  opacity: 0;
  pointer-events: none;
  z-index: 5;
  transition: opacity 0.15s;
}

.wam-feedback.show-hit {
  opacity: 1;
  background: rgba(34,211,238,0.15);
  color: var(--wam-green);
  text-shadow: var(--wam-glow-green);
  animation: wam-feedback-pop 0.4s ease-out forwards;
}

.wam-feedback.show-miss {
  opacity: 1;
  background: rgba(244,63,94,0.1);
  color: var(--wam-red);
  text-shadow: var(--wam-glow-red);
  animation: wam-feedback-pop 0.4s ease-out forwards;
}

/* ── Particles (hit burst) ───────────────────────────── */
.wam-particle {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 6;
}

/* ── Game Over Overlay ───────────────────────────────── */
.wam-gameover {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(10,14,26,0.92);
  backdrop-filter: blur(6px);
  border-radius: 12px;
  z-index: 10;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.4s;
}

.wam-gameover.visible {
  opacity: 1;
  pointer-events: auto;
}

.wam-gameover-title {
  font-size: clamp(18px, 5vmin, 28px);
  font-weight: 900;
  letter-spacing: 4px;
  text-transform: uppercase;
  background: linear-gradient(90deg, var(--wam-cyan), var(--wam-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: clamp(8px, 2vmin, 16px);
}

.wam-gameover-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(4px, 1vmin, 8px) clamp(12px, 3vmin, 24px);
  font-size: clamp(10px, 2.5vmin, 14px);
}

.wam-gameover-stats dt {
  color: var(--wam-text-dim);
  text-align: right;
  text-transform: uppercase;
  font-size: clamp(8px, 1.8vmin, 10px);
  letter-spacing: 1px;
  align-self: center;
}

.wam-gameover-stats dd {
  color: var(--wam-cyan);
  font-size: clamp(14px, 3.5vmin, 20px);
  font-weight: 700;
  margin: 0;
}

/* ── Animations ──────────────────────────────────────── */
@keyframes wam-orb-pulse {
  from { transform: scale(1); filter: brightness(1); }
  to   { transform: scale(1.08); filter: brightness(1.2); }
}

@keyframes wam-ring-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes wam-feedback-pop {
  0%   { transform: scale(0.8); opacity: 1; }
  60%  { transform: scale(1.1); opacity: 0.9; }
  100% { transform: scale(1); opacity: 0; }
}

@keyframes wam-particle-fly {
  0%   { opacity: 1; transform: translate(0,0) scale(1); }
  100% { opacity: 0; transform: translate(var(--px), var(--py)) scale(0); }
}

/* ── Scanline ambient effect ─────────────────────────── */
.wam-scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  border-radius: 12px;
  overflow: hidden;
}

.wam-scanlines::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,240,255,0.008) 2px,
    rgba(0,240,255,0.008) 4px
  );
}

/* ── Start Overlay ───────────────────────────────────── */
.wam-start-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(10,14,26,0.85);
  backdrop-filter: blur(4px);
  border-radius: 12px;
  z-index: 10;
}

.wam-start-title {
  font-size: clamp(14px, 3.5vmin, 20px);
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--wam-text-dim);
  margin-bottom: 8px;
}

.wam-start-subtitle {
  font-size: clamp(9px, 2vmin, 12px);
  color: var(--wam-text-dim);
  letter-spacing: 1px;
}

/* ── Touch / Mobile ──────────────────────────────────── */
.wam-hole {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

@media (pointer: coarse) {
  .wam-hole {
    min-height: clamp(40px, 10vmin, 60px);
  }
  .wam-hole-number {
    display: none;
  }
}
      `;

      this._styleEl = document.createElement('style');
      this._styleEl.id = id;
      this._styleEl.textContent = css;
      document.head.appendChild(this._styleEl);
    }

    _buildDOM() {
      this._rootEl = document.createElement('div');
      this._rootEl.className = 'wam-root';

      // HUD
      this._hudEl = document.createElement('div');
      this._hudEl.className = 'wam-hud';
      this._hudEl.innerHTML = `
        <div class="wam-hud-item">
          <span class="wam-hud-label">Score</span>
          <span class="wam-hud-value score" data-wam="score">0</span>
        </div>
        <div class="wam-hud-item">
          <span class="wam-hud-label">Streak</span>
          <span class="wam-hud-value streak" data-wam="streak">0</span>
        </div>
        <div class="wam-hud-item">
          <span class="wam-hud-label">Target</span>
          <span class="wam-hud-value target" data-wam="target">—</span>
        </div>
        <div class="wam-hud-item">
          <span class="wam-hud-label">Time</span>
          <span class="wam-hud-value time" data-wam="time">${this._config.gameDuration}</span>
        </div>
      `;

      // Streak progress bar
      this._streakBarEl = document.createElement('div');
      this._streakBarEl.className = 'wam-streak-bar-wrap';
      this._streakBarEl.innerHTML = `
        <div class="wam-streak-bar-label">
          <span>Streak Goal</span>
          <span class="wam-streak-current" data-wam="streak-label">0 / —</span>
        </div>
        <div class="wam-streak-bar-track">
          <div class="wam-streak-bar-fill" data-wam="streak-fill"></div>
        </div>
      `;

      // Timer bar
      this._timerBarWrap = document.createElement('div');
      this._timerBarWrap.className = 'wam-timer-bar-wrap';
      this._timerBarWrap.innerHTML = '<div class="wam-timer-bar" data-wam="timerbar" style="width:100%"></div>';

      // Grid container
      this._gridWrap = document.createElement('div');
      this._gridWrap.style.position = 'relative';

      this._gridEl = document.createElement('div');
      this._gridEl.className = 'wam-grid';

      // Scanlines
      const scanlines = document.createElement('div');
      scanlines.className = 'wam-scanlines';

      // Game-over overlay
      this._gameOverEl = document.createElement('div');
      this._gameOverEl.className = 'wam-gameover';
      this._gameOverEl.innerHTML = `
        <div class="wam-gameover-title">COMPLETE</div>
        <dl class="wam-gameover-stats">
          <dt>Score</dt><dd data-wam="go-score">0</dd>
          <dt>Best Streak</dt><dd data-wam="go-best-streak">0</dd>
          <dt>Target</dt><dd data-wam="go-target">0</dd>
          <dt>Accuracy</dt><dd data-wam="go-accuracy">0%</dd>
        </dl>
      `;

      // Goal achieved banner
      this._goalBanner = document.createElement('div');
      this._goalBanner.className = 'wam-goal-banner';
      this._goalBanner.innerHTML = `
        <div class="wam-goal-banner-title">TARGET REACHED!</div>
        <div class="wam-goal-banner-sub">Keep the streak going!</div>
      `;

      // Start overlay
      this._startOverlay = document.createElement('div');
      this._startOverlay.className = 'wam-start-overlay';
      this._startOverlay.innerHTML = `
        <div class="wam-start-title">WHACK-A-MOLE</div>
        <div class="wam-start-subtitle">Awaiting start command…</div>
      `;

      this._gridWrap.appendChild(this._gridEl);
      this._gridWrap.appendChild(scanlines);
      this._gridWrap.appendChild(this._gameOverEl);
      this._gridWrap.appendChild(this._goalBanner);
      this._gridWrap.appendChild(this._startOverlay);

      this._rootEl.appendChild(this._hudEl);
      this._rootEl.appendChild(this._streakBarEl);
      this._rootEl.appendChild(this._timerBarWrap);
      this._rootEl.appendChild(this._gridWrap);

      this._container.appendChild(this._rootEl);
    }

    _buildGrid() {
      const { rows, cols } = this._config;
      const total = rows * cols;

      this._gridEl.innerHTML = '';
      this._gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      this._holes = [];

      for (let i = 1; i <= total; i++) {
        const hole = new Hole(i);

        const el = document.createElement('div');
        el.className = 'wam-hole';
        el.dataset.index = i;

        // Number badge
        const numBadge = document.createElement('span');
        numBadge.className = 'wam-hole-number';
        numBadge.textContent = i;
        hole.numberEl = numBadge;

        // Mole
        const moleEl = document.createElement('div');
        moleEl.className = 'wam-mole';
        moleEl.innerHTML = '<div class="wam-mole-inner"></div>';
        hole.moleEl = moleEl;

        // Feedback
        const feedbackEl = document.createElement('div');
        feedbackEl.className = 'wam-feedback';
        hole.feedbackEl = feedbackEl;

        el.appendChild(numBadge);
        el.appendChild(moleEl);
        el.appendChild(feedbackEl);

        hole.el = el;
        this._holes.push(hole);
        this._gridEl.appendChild(el);
      }

      // Show start overlay
      this._startOverlay.style.display = '';
      this._gameOverEl.classList.remove('visible');
    }

    // ── Private — Input ────────────────────────────────────────────

    _bindInput() {
      const cfg = this._config.inputMode;

      // Mouse / touch
      if (cfg === 'mouse' || cfg === 'mouse+keyboard') {
        this._gridEl.addEventListener('pointerdown', (e) => {
          const holeEl = e.target.closest('.wam-hole');
          if (!holeEl) return;
          const idx = parseInt(holeEl.dataset.index, 10);
          this._handleInput(idx);
        });
      }

      // Keyboard
      if (cfg === 'keyboard' || cfg === 'mouse+keyboard') {
        this._boundKeyHandler = (e) => {
          if (!this._gameActive || this._gamePaused) return;
          const idx = KEY_MAP[e.code];
          if (idx !== undefined && idx <= this._holes.length) {
            e.preventDefault();
            this._handleInput(idx);
          }
        };
        document.addEventListener('keydown', this._boundKeyHandler);
      }
    }

    _handleInput(holeIndex) {
      if (!this._gameActive || this._gamePaused || this._destroyed) return;

      const hole = this._holes[holeIndex - 1];
      if (!hole) return;

      if (hole.state === 'active') {
        // ─ HIT ─
        const moleId = hole.moleId;
        hole.state = 'hit';
        hole.el.classList.remove('active');
        hole.el.classList.add('hit');

        clearTimeout(hole.timeoutId);
        hole.timeoutId = null;

        this._hits++;
        this._score++;
        this._streak++;
        if (this._streak > this._bestStreak) this._bestStreak = this._streak;
        this._updateHUD();
        this._updateStreakBar();
        this._showFeedback(hole, 'hit');
        this._spawnParticles(hole);

        // Check if target streak reached
        if (!this._targetReached && this._streak >= this._targetStreak) {
          this._targetReached = true;
          this._showGoalBanner();
          this._emit('onTargetReached', { target: this._targetStreak, currentStreak: this._streak });

          // Notify parent (main game) that this minigame was won
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'minigame-won', game: 'chair2' }, '*');
          }
        }

        this._emit('onHit', holeIndex);
        this._emit('onScoreChange', this._score);
        if (this._config.onHitSound) this._config.onHitSound();

        // Reset after short delay
        setTimeout(() => {
          hole.state = 'empty';
          hole.el.classList.remove('hit');
        }, 300);

      } else if (hole.state === 'empty') {
        // ─ MISS ─
        this._misses++;
        this._streak = 0; // reset streak on miss
        if (this._config.allowMissPenalty) {
          this._score = Math.max(0, this._score - 1);
        }
        this._updateHUD();
        this._updateStreakBar();
        this._showFeedback(hole, 'miss');

        this._emit('onMiss', holeIndex);
        this._emit('onScoreChange', this._score);
        if (this._config.onMissSound) this._config.onMissSound();
      }
      // If hole.state === 'hit', ignore (double-hit prevented)
    }

    // ── Private — Game Loop ────────────────────────────────────────

    _startTimer() {
      this._tickTimerId = setInterval(() => {
        this._timeRemaining--;
        this._updateHUD();

        if (this._timeRemaining <= 0) {
          this._endGame();
        }
      }, 1000);
    }

    _scheduleNextSpawn() {
      if (!this._gameActive || this._gamePaused) return;
      const [minInterval, maxInterval] = this._config.spawnInterval;
      const delay = randFloat(minInterval, maxInterval);
      this._spawnTimerId = setTimeout(() => {
        this._spawnMole();
        this._scheduleNextSpawn();
      }, delay);
    }

    _spawnMole() {
      if (!this._gameActive || this._gamePaused) return;

      // Find empty holes
      const emptyHoles = this._holes.filter(h => h.state === 'empty');
      if (emptyHoles.length === 0) return;

      const hole = emptyHoles[randInt(0, emptyHoles.length - 1)];
      this._moleIdCounter++;
      const spawnId = this._moleIdCounter;
      hole.moleId = spawnId;
      hole.state = 'active';
      hole.el.classList.add('active');
      this._totalSpawns++;

      if (this._config.onSpawnSound) this._config.onSpawnSound();

      // Auto-hide after visible time (capture spawnId in closure)
      hole.timeoutId = setTimeout(() => {
        if (hole.state === 'active' && hole.moleId === spawnId) {
          // Mole not hit — disappeared
          hole.state = 'empty';
          hole.el.classList.remove('active');
          hole.timeoutId = null;
        }
      }, this._config.moleVisibleTime);
    }

    _endGame() {
      this._gameActive = false;
      this._stopAll();

      // Clear all active moles
      this._holes.forEach(h => {
        h.state = 'empty';
        h.el.classList.remove('active', 'hit');
        if (h.timeoutId) {
          clearTimeout(h.timeoutId);
          h.timeoutId = null;
        }
      });

      const totalAttempts = this._hits + this._misses;
      const accuracy = totalAttempts > 0
        ? Math.round((this._hits / totalAttempts) * 100)
        : 0;

      const stats = {
        score: this._score,
        hits: this._hits,
        misses: this._misses,
        totalSpawns: this._totalSpawns,
        accuracy: accuracy,
        time: this._config.gameDuration,
        bestStreak: this._bestStreak,
        targetStreak: this._targetStreak,
        targetReached: this._targetReached,
      };

      // Show game-over overlay
      this._gameOverEl.querySelector('[data-wam="go-score"]').textContent = stats.score;
      this._gameOverEl.querySelector('[data-wam="go-best-streak"]').textContent = stats.bestStreak;
      this._gameOverEl.querySelector('[data-wam="go-target"]').textContent = stats.targetStreak + (stats.targetReached ? ' ✓' : '');
      this._gameOverEl.querySelector('[data-wam="go-accuracy"]').textContent = stats.accuracy + '%';
      this._gameOverEl.classList.add('visible');
      this._hideGoalBanner();

      this._emit('onGameComplete', stats);
    }

    // ── Private — Rendering Helpers ────────────────────────────────

    _updateHUD() {
      const q = (sel) => this._hudEl.querySelector(`[data-wam="${sel}"]`);
      q('score').textContent = this._score;
      q('streak').textContent = this._streak;
      q('target').textContent = this._targetStreak || '—';
      q('time').textContent = Math.max(0, this._timeRemaining);

      // Timer bar
      const pct = clamp(this._timeRemaining / this._config.gameDuration * 100, 0, 100);
      this._timerBarWrap.querySelector('[data-wam="timerbar"]').style.width = pct + '%';
    }

    _showFeedback(hole, type) {
      const el = hole.feedbackEl;
      el.textContent = type === 'hit' ? '+1' : '-1';
      el.className = 'wam-feedback';

      // Force reflow
      void el.offsetWidth;
      el.classList.add(type === 'hit' ? 'show-hit' : 'show-miss');

      setTimeout(() => {
        el.className = 'wam-feedback';
      }, 420);
    }

    _spawnParticles(hole) {
      const rect = hole.el.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const count = 8;

      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'wam-particle';
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
        const dist = 30 + Math.random() * 30;
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;

        p.style.cssText = `
          left: ${cx}px; top: ${cy}px;
          background: ${Math.random() > 0.5 ? 'var(--wam-cyan)' : 'var(--wam-purple)'};
          box-shadow: 0 0 6px ${Math.random() > 0.5 ? 'rgba(0,240,255,0.8)' : 'rgba(168,85,247,0.8)'};
          --px: ${px}px;
          --py: ${py}px;
          animation: wam-particle-fly 0.45s ease-out forwards;
        `;
        hole.el.appendChild(p);
        setTimeout(() => p.remove(), 500);
      }
    }

    // ── Private — Utility ──────────────────────────────────────────

    _emit(eventName, data) {
      const cb = this._config[eventName];
      if (typeof cb === 'function') {
        try { cb(data); } catch (e) { console.error(`WhackAMole [${eventName}]:`, e); }
      }
    }

    _resetState() {
      this._score = 0;
      this._hits = 0;
      this._misses = 0;
      this._totalSpawns = 0;
      this._moleIdCounter = 0;
      this._gameActive = false;
      this._gamePaused = false;
      this._timeRemaining = this._config.gameDuration;
      this._streak = 0;
      this._bestStreak = 0;
      this._targetReached = false;
    }

    _updateStreakBar() {
      if (!this._streakBarEl) return;
      const target = this._targetStreak || 1;
      const pct = clamp(this._streak / target * 100, 0, 100);
      const fill = this._streakBarEl.querySelector('[data-wam="streak-fill"]');
      const label = this._streakBarEl.querySelector('[data-wam="streak-label"]');
      fill.style.width = pct + '%';
      if (this._targetReached) {
        fill.classList.add('complete');
      } else {
        fill.classList.remove('complete');
      }
      label.textContent = `${this._streak} / ${this._targetStreak}`;
    }

    _showGoalBanner() {
      if (!this._goalBanner) return;
      this._goalBanner.classList.add('visible');
      // Auto-hide after 2s
      clearTimeout(this._goalBannerTimer);
      this._goalBannerTimer = setTimeout(() => {
        this._hideGoalBanner();
      }, 2000);
    }

    _hideGoalBanner() {
      if (!this._goalBanner) return;
      this._goalBanner.classList.remove('visible');
      clearTimeout(this._goalBannerTimer);
    }

    _stopAll() {
      clearTimeout(this._spawnTimerId);
      clearInterval(this._tickTimerId);
      this._holes.forEach(h => {
        if (h.timeoutId) {
          clearTimeout(h.timeoutId);
          h.timeoutId = null;
        }
      });
    }
  }

  return WhackAMoleGame;
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WhackAMole;
}
