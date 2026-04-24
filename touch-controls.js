/**
 * Touch Controls Module
 * Creates a virtual joystick and action buttons for mobile devices.
 * Only visible on touch-capable devices.
 */

import { setTouchDirection, triggerTouchJump, setTouchSprint, triggerTouchInteract } from './input.js';

// --- Mobile detection ---
let isMobile = false;
let sprintActive = false;

export function detectMobile() {
    isMobile = ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        window.matchMedia('(pointer: coarse)').matches;
    return isMobile;
}

export function getIsMobile() {
    return isMobile;
}

/**
 * Initializes touch controls: creates DOM elements, attaches events.
 * Should be called once during game init.
 */
export function initTouchControls() {
    if (!detectMobile()) return;

    // Mark body so CSS can respond
    document.body.classList.add('touch-device');

    createJoystick();
    createActionButtons();
}

// ============================================
// VIRTUAL JOYSTICK
// ============================================
let joystickBase = null;
let joystickKnob = null;
let joystickActive = false;
let joystickTouchId = null;
let joystickCenter = { x: 0, y: 0 };
const JOYSTICK_RADIUS = 55;   // max travel of knob from center
const DEAD_ZONE = 0.15;        // fraction of radius

function createJoystick() {
    // Container
    joystickBase = document.createElement('div');
    joystickBase.id = 'touch-joystick-base';
    joystickBase.innerHTML = `<div id="touch-joystick-knob"></div>`;
    document.body.appendChild(joystickBase);

    joystickKnob = document.getElementById('touch-joystick-knob');

    // Touch events on the base
    joystickBase.addEventListener('touchstart', onJoystickStart, { passive: false });
    document.addEventListener('touchmove', onJoystickMove, { passive: false });
    document.addEventListener('touchend', onJoystickEnd, { passive: false });
    document.addEventListener('touchcancel', onJoystickEnd, { passive: false });
}

function onJoystickStart(e) {
    e.preventDefault();
    if (joystickActive) return;
    const touch = e.changedTouches[0];
    joystickActive = true;
    joystickTouchId = touch.identifier;

    // Center is the middle of the base element
    const rect = joystickBase.getBoundingClientRect();
    joystickCenter.x = rect.left + rect.width / 2;
    joystickCenter.y = rect.top + rect.height / 2;

    updateJoystickPosition(touch.clientX, touch.clientY);
}

function onJoystickMove(e) {
    if (!joystickActive) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
            e.preventDefault();
            updateJoystickPosition(touch.clientX, touch.clientY);
            return;
        }
    }
}

function onJoystickEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
            joystickActive = false;
            joystickTouchId = null;
            // Reset knob position
            if (joystickKnob) {
                joystickKnob.style.transform = 'translate(-50%, -50%)';
            }
            setTouchDirection(0, 0);
            return;
        }
    }
}

function updateJoystickPosition(touchX, touchY) {
    let dx = touchX - joystickCenter.x;
    let dy = touchY - joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Clamp to radius
    if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
    }

    // Move knob visually
    if (joystickKnob) {
        joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }

    // Normalize to -1..1
    let nx = dx / JOYSTICK_RADIUS;
    let ny = dy / JOYSTICK_RADIUS;

    // Apply dead zone
    const magnitude = Math.sqrt(nx * nx + ny * ny);
    if (magnitude < DEAD_ZONE) {
        nx = 0;
        ny = 0;
    } else {
        // Remap from dead zone..1 to 0..1
        const remapped = (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
        nx = (nx / magnitude) * remapped;
        ny = (ny / magnitude) * remapped;
    }

    // Map screen coordinates to game direction:
    // Screen right → x positive, Screen up → z positive (forward)
    setTouchDirection(nx, -ny);
}

// ============================================
// ACTION BUTTONS
// ============================================
function createActionButtons() {
    const container = document.createElement('div');
    container.id = 'touch-buttons';
    container.innerHTML = `
        <button id="touch-btn-jump" class="touch-btn touch-btn-jump" aria-label="Jump">
            <span class="touch-btn-icon">⬆</span>
            <span class="touch-btn-label">Jump</span>
        </button>
        <button id="touch-btn-sprint" class="touch-btn touch-btn-sprint" aria-label="Sprint">
            <span class="touch-btn-icon">⚡</span>
            <span class="touch-btn-label">Sprint</span>
        </button>
        <button id="touch-btn-interact" class="touch-btn touch-btn-interact" aria-label="Interact">
            <span class="touch-btn-icon">✋</span>
            <span class="touch-btn-label">Interact</span>
        </button>
    `;
    document.body.appendChild(container);

    // --- Jump button ---
    const jumpBtn = document.getElementById('touch-btn-jump');
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        triggerTouchJump();
        jumpBtn.classList.add('active');
    }, { passive: false });
    jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        jumpBtn.classList.remove('active');
    }, { passive: false });

    // --- Sprint button (toggle) ---
    const sprintBtn = document.getElementById('touch-btn-sprint');
    sprintBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sprintActive = !sprintActive;
        setTouchSprint(sprintActive);
        sprintBtn.classList.toggle('active', sprintActive);
    }, { passive: false });

    // --- Interact button ---
    const interactBtn = document.getElementById('touch-btn-interact');
    interactBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        triggerTouchInteract();
        interactBtn.classList.add('active');
    }, { passive: false });
    interactBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        interactBtn.classList.remove('active');
    }, { passive: false });
}
