/**
 * Snake Mini-Game
 * A classic Snake game rendered on an HTML canvas, controlled with WASD.
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

    _draw(); // draw final state with red tint
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
