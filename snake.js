/**
 * Snake Mini-Game
 * A classic Snake game rendered on an HTML canvas, controlled with WASD.
 * Supports touch controls: swipe gestures + on-screen d-pad for mobile.
 * Manages its own input while active so it doesn't conflict with the player.
 */

import { lockInput, unlockInput } from './input.js';

// --- Config ---
const GRID_SIZE   = 20;      // cells per axis
const CELL_PX     = 20;      // pixels per cell
const CANVAS_SIZE = GRID_SIZE * CELL_PX;  // 400px
const TICK_MS     = 120;     // ms per game tick (speed)

const LS_KEY = 'snake_highscore';

// --- Colors (CRT green theme) ---
const COLOR_BG       = '#0a0f0a';
const COLOR_GRID     = '#0d1a0d';
const COLOR_SNAKE    = '#39ff14';
const COLOR_SNAKE_HD = '#7dff5e';
const COLOR_FRUIT    = '#ff3c5f';
const COLOR_FRUIT_GL = '#ff6b88';
const COLOR_TEXT     = '#39ff14';
const COLOR_DEAD     = '#ff3c5f';

// --- State ---
let active       = false;
let gameOver     = false;
let score        = 0;
let highScore    = parseInt(localStorage.getItem(LS_KEY)) || 0;
let snake        = [];        // array of {x, y}
let fruit        = { x: 0, y: 0 };
let dir          = { x: 1, y: 0 };   // current direction
let nextDir      = { x: 1, y: 0 };   // queued direction (prevents 180° flips)
let tickTimer    = null;
let canvas       = null;
let ctx          = null;

// --- DOM refs ---
let overlay      = null;
let scoreEl      = null;
let highScoreEl  = null;
let gameOverEl   = null;
let finalScoreEl = null;
let finalHighEl  = null;

// --- Touch controls ---
let isTouchDevice = false;
let touchDpad    = null;
let swipeStartX  = 0;
let swipeStartY  = 0;
const SWIPE_THRESHOLD = 20; // minimum px to register a swipe

// ========================================
// PUBLIC API
// ========================================

export function isSnakeGameActive() {
    return active;
}

export function startSnakeGame() {
    if (active) return;
    active   = true;
    gameOver = false;
    score    = 0;
    highScore = parseInt(localStorage.getItem(LS_KEY)) || 0;

    // Init snake in the center going right
    snake = [
        { x: Math.floor(GRID_SIZE / 2),     y: Math.floor(GRID_SIZE / 2) },
        { x: Math.floor(GRID_SIZE / 2) - 1, y: Math.floor(GRID_SIZE / 2) },
        { x: Math.floor(GRID_SIZE / 2) - 2, y: Math.floor(GRID_SIZE / 2) },
    ];
    dir     = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };

    _placeFruit();
    _getElements();
    _updateScoreDisplay();

    // Show overlay
    overlay.classList.add('visible');
    gameOverEl.classList.remove('visible');

    // Lock player movement
    lockInput();

    // Start input listener
    window.addEventListener('keydown', _onKey);

    // Touch controls
    _initTouchControls();

    // Start game tick
    _draw();
    tickTimer = setInterval(_tick, TICK_MS);
}

export function stopSnakeGame() {
    if (!active) return;
    active = false;

    clearInterval(tickTimer);
    tickTimer = null;

    window.removeEventListener('keydown', _onKey);
    _removeTouchControls();

    // Hide overlay
    overlay.classList.remove('visible');

    // Unlock player
    unlockInput();
}

// ========================================
// INTERNAL
// ========================================

function _getElements() {
    overlay      = document.getElementById('snake-overlay');
    canvas       = document.getElementById('snake-canvas');
    scoreEl      = document.getElementById('snake-score');
    highScoreEl  = document.getElementById('snake-highscore');
    gameOverEl   = document.getElementById('snake-gameover');
    finalScoreEl = document.getElementById('snake-final-score');
    finalHighEl  = document.getElementById('snake-final-high');

    canvas.width  = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    ctx = canvas.getContext('2d');
}

function _onKey(e) {
    if (!active) return;

    // Prevent default for game keys so page doesn't scroll
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Escape'].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
    }

    if (gameOver) {
        // Any key after game over closes
        if (e.code === 'Escape' || e.code === 'Space' || e.code === 'KeyE') {
            stopSnakeGame();
        }
        return;
    }

    switch (e.code) {
        case 'KeyW':
            if (dir.y !== 1)  nextDir = { x: 0, y: -1 };
            break;
        case 'KeyS':
            if (dir.y !== -1) nextDir = { x: 0, y: 1 };
            break;
        case 'KeyA':
            if (dir.x !== 1)  nextDir = { x: -1, y: 0 };
            break;
        case 'KeyD':
            if (dir.x !== -1) nextDir = { x: 1, y: 0 };
            break;
        case 'Escape':
            stopSnakeGame();
            break;
    }
}

function _placeFruit() {
    // Find a position not occupied by the snake
    let attempts = 0;
    do {
        fruit.x = Math.floor(Math.random() * GRID_SIZE);
        fruit.y = Math.floor(Math.random() * GRID_SIZE);
        attempts++;
    } while (_isOnSnake(fruit.x, fruit.y) && attempts < 400);
}

function _isOnSnake(x, y) {
    return snake.some(s => s.x === x && s.y === y);
}

function _tick() {
    if (gameOver || !active) return;

    // Apply queued direction
    dir = { ...nextDir };

    // Calculate new head
    const head = snake[0];
    const newHead = {
        x: head.x + dir.x,
        y: head.y + dir.y,
    };

    // --- Collision: walls ---
    if (newHead.x < 0 || newHead.x >= GRID_SIZE ||
        newHead.y < 0 || newHead.y >= GRID_SIZE) {
        _gameOver();
        return;
    }

    // --- Collision: self ---
    if (_isOnSnake(newHead.x, newHead.y)) {
        _gameOver();
        return;
    }

    // Move
    snake.unshift(newHead);

    // --- Eat fruit? ---
    if (newHead.x === fruit.x && newHead.y === fruit.y) {
        score++;
        _updateScoreDisplay();
        _placeFruit();
        // Don't remove tail → snake grows
    } else {
        snake.pop(); // remove tail
    }

    _draw();
}

function _gameOver() {
    gameOver = true;
    clearInterval(tickTimer);
    tickTimer = null;

    // Update high score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem(LS_KEY, highScore.toString());
    }

    // Show game-over panel
    finalScoreEl.textContent = score;
    finalHighEl.textContent  = highScore;
    gameOverEl.classList.add('visible');

    // Allow tap-to-close on mobile
    gameOverEl.addEventListener('touchstart', _onGameOverTap, { passive: false });
    gameOverEl.addEventListener('click', _onGameOverTap);

    _draw(); // draw final state with red tint
}

function _onGameOverTap(e) {
    e.preventDefault();
    e.stopPropagation();
    gameOverEl.removeEventListener('touchstart', _onGameOverTap);
    gameOverEl.removeEventListener('click', _onGameOverTap);
    stopSnakeGame();
}

function _updateScoreDisplay() {
    if (scoreEl)     scoreEl.textContent     = score;
    if (highScoreEl) highScoreEl.textContent = highScore;
}

// ========================================
// RENDERING
// ========================================

function _draw() {
    if (!ctx) return;

    // Background
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Grid lines (subtle)
    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i++) {
        const p = i * CELL_PX;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, CANVAS_SIZE);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p);
        ctx.lineTo(CANVAS_SIZE, p);
        ctx.stroke();
    }

    // Fruit (with glow)
    ctx.shadowColor = COLOR_FRUIT_GL;
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = COLOR_FRUIT;
    _fillCell(fruit.x, fruit.y, 2);
    ctx.shadowBlur  = 0;

    // Snake body
    ctx.fillStyle = COLOR_SNAKE;
    for (let i = 1; i < snake.length; i++) {
        _fillCell(snake[i].x, snake[i].y, 1);
    }

    // Snake head (brighter)
    ctx.shadowColor = COLOR_SNAKE;
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = COLOR_SNAKE_HD;
    if (snake.length > 0) {
        _fillCell(snake[0].x, snake[0].y, 1);
    }
    ctx.shadowBlur = 0;

    // Game over red overlay
    if (gameOver) {
        ctx.fillStyle = 'rgba(255, 30, 30, 0.12)';
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    // Scanline effect (CRT feel)
    for (let y = 0; y < CANVAS_SIZE; y += 4) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.fillRect(0, y, CANVAS_SIZE, 2);
    }
}

function _fillCell(cx, cy, inset) {
    ctx.fillRect(
        cx * CELL_PX + inset,
        cy * CELL_PX + inset,
        CELL_PX - inset * 2,
        CELL_PX - inset * 2
    );
}

// ========================================
// TOUCH CONTROLS
// ========================================

function _detectTouch() {
    return ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(pointer: coarse)').matches;
}

function _initTouchControls() {
    isTouchDevice = _detectTouch();
    if (!isTouchDevice) return;

    // --- Swipe detection on canvas ---
    if (canvas) {
        canvas.addEventListener('touchstart', _onSwipeStart, { passive: false });
        canvas.addEventListener('touchend', _onSwipeEnd, { passive: false });
    }

    // --- On-screen D-pad ---
    _createDpad();
}

function _removeTouchControls() {
    if (canvas) {
        canvas.removeEventListener('touchstart', _onSwipeStart);
        canvas.removeEventListener('touchend', _onSwipeEnd);
    }
    if (touchDpad && touchDpad.parentNode) {
        touchDpad.parentNode.removeChild(touchDpad);
        touchDpad = null;
    }
}

function _onSwipeStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    swipeStartX = t.clientX;
    swipeStartY = t.clientY;
}

function _onSwipeEnd(e) {
    if (!active || gameOver) {
        if (gameOver) stopSnakeGame();
        return;
    }
    e.preventDefault();
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStartX;
    const dy = t.clientY - swipeStartY;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe
        if (dx > 0 && dir.x !== -1) nextDir = { x: 1, y: 0 };
        else if (dx < 0 && dir.x !== 1) nextDir = { x: -1, y: 0 };
    } else {
        // Vertical swipe
        if (dy > 0 && dir.y !== -1) nextDir = { x: 0, y: 1 };
        else if (dy < 0 && dir.y !== 1) nextDir = { x: 0, y: -1 };
    }
}

function _createDpad() {
    if (touchDpad) return;

    // Inject d-pad styles once
    if (!document.getElementById('snake-touch-styles')) {
        const style = document.createElement('style');
        style.id = 'snake-touch-styles';
        style.textContent = `
            .snake-dpad {
                display: grid;
                grid-template-columns: repeat(3, clamp(36px, 9vmin, 52px));
                grid-template-rows: clamp(36px, 9vmin, 52px);
                gap: clamp(3px, 0.8vmin, 6px);
                justify-content: center;
                padding: clamp(4px, 1vmin, 10px) 0 clamp(2px, 0.5vmin, 6px);
            }
            .snake-dpad-btn {
                width: clamp(36px, 9vmin, 52px);
                height: clamp(36px, 9vmin, 52px);
                border-radius: 10px;
                background: rgba(57, 255, 20, 0.08);
                border: 1.5px solid rgba(57, 255, 20, 0.25);
                color: #39ff14;
                font-size: clamp(0.9rem, 2.5vmin, 1.3rem);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                touch-action: none;
                -webkit-tap-highlight-color: transparent;
                user-select: none;
                transition: background 0.1s, box-shadow 0.1s;
            }
            .snake-dpad-btn:active, .snake-dpad-btn.active {
                background: rgba(57, 255, 20, 0.25);
                box-shadow: 0 0 18px rgba(57, 255, 20, 0.35);
            }
            .snake-dpad-exit {
                background: rgba(255, 60, 95, 0.12) !important;
                border-color: rgba(255, 60, 95, 0.35) !important;
                color: #ff3c5f !important;
                font-size: clamp(0.7rem, 2vmin, 1rem);
            }
            .snake-dpad-exit:active {
                background: rgba(255, 60, 95, 0.3) !important;
                box-shadow: 0 0 18px rgba(255, 60, 95, 0.4) !important;
            }
            .snake-dpad-spacer { visibility: hidden; }
            .snake-dpad-close {
                display: block;
                text-align: center;
                color: rgba(57, 255, 20, 0.35);
                font-family: 'Courier New', monospace;
                font-size: clamp(0.45rem, 1.2vmin, 0.65rem);
                letter-spacing: 0.1em;
                text-transform: uppercase;
                padding: clamp(2px, 0.5vmin, 4px) 0 clamp(1px, 0.3vmin, 2px);
            }

            /* Landscape: position d-pad to the right of canvas */
            @media (orientation: landscape) and (pointer: coarse) {
                .snake-touch-dpad-wrap {
                    position: fixed;
                    right: clamp(8px, 2vw, 24px);
                    bottom: clamp(8px, 3vh, 30px);
                    z-index: 9999;
                }
            }
        `;
        document.head.appendChild(style);
    }

    touchDpad = document.createElement('div');
    touchDpad.className = 'snake-touch-dpad-wrap';
    touchDpad.innerHTML = `
        <div class="snake-dpad">
            <div class="snake-dpad-spacer"></div>
            <button class="snake-dpad-btn" data-dir="up">▲</button>
            <div class="snake-dpad-spacer"></div>
            <button class="snake-dpad-btn" data-dir="left">◀</button>
            <button class="snake-dpad-btn snake-dpad-exit" data-action="exit">✕</button>
            <button class="snake-dpad-btn" data-dir="right">▶</button>
        </div>
        <div class="snake-dpad">
            <div class="snake-dpad-spacer"></div>
            <button class="snake-dpad-btn" data-dir="down">▼</button>
            <div class="snake-dpad-spacer"></div>
        </div>
        <div class="snake-dpad-close">Swipe or tap arrows · Center ✕ to exit</div>
    `;

    // Insert d-pad into the snake-window (after canvas)
    const snakeWindow = overlay.querySelector('.snake-window');
    if (snakeWindow) {
        // Replace the keyboard hint text
        const hint = snakeWindow.querySelector('.snake-hint');
        if (hint) hint.style.display = 'none';
        snakeWindow.appendChild(touchDpad);
    }

    // Bind d-pad buttons
    touchDpad.querySelectorAll('.snake-dpad-btn[data-dir]').forEach(btn => {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (!active) return;
            if (gameOver) { stopSnakeGame(); return; }
            btn.classList.add('active');
            const d = btn.dataset.dir;
            if (d === 'up'    && dir.y !== 1)  nextDir = { x: 0, y: -1 };
            if (d === 'down'  && dir.y !== -1) nextDir = { x: 0, y: 1 };
            if (d === 'left'  && dir.x !== 1)  nextDir = { x: -1, y: 0 };
            if (d === 'right' && dir.x !== -1) nextDir = { x: 1, y: 0 };
        }, { passive: false });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            btn.classList.remove('active');
        }, { passive: false });
    });

    // Bind exit button
    const exitBtn = touchDpad.querySelector('[data-action="exit"]');
    if (exitBtn) {
        exitBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            stopSnakeGame();
        }, { passive: false });
    }
}
