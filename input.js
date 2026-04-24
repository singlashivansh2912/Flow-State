/**
 * Input Manager
 * Tracks keyboard state for WASD / Arrow key movement, jump, sprint,
 * and interaction. Supports locking input to freeze the player.
 * Also supports touch input from virtual joystick and buttons.
 */

const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
};

// Track jump as a one-shot (pressed this frame)
let jumpPressed = false;

// Track interact (E key) as a one-shot
let interactPressed = false;

// When locked, movement/jump/sprint return neutral values
let locked = false;

// --- Touch input state ---
let touchDir = { x: 0, z: 0 };   // from virtual joystick
let touchJumpPressed = false;     // one-shot from touch button
let touchSprinting = false;       // toggle from touch button
let touchInteractPressed = false; // one-shot from touch button

function onKeyDown(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp':    keys.forward  = true; break;
        case 'KeyS': case 'ArrowDown':  keys.backward = true; break;
        case 'KeyA': case 'ArrowLeft':  keys.left     = true; break;
        case 'KeyD': case 'ArrowRight': keys.right    = true; break;
        case 'Space':
            if (!keys.jump) jumpPressed = true;
            keys.jump = true;
            e.preventDefault();
            break;
        case 'ShiftLeft': case 'ShiftRight':
            keys.sprint = true; break;
        case 'KeyE':
            interactPressed = true; break;
    }
}

function onKeyUp(e) {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp':    keys.forward  = false; break;
        case 'KeyS': case 'ArrowDown':  keys.backward = false; break;
        case 'KeyA': case 'ArrowLeft':  keys.left     = false; break;
        case 'KeyD': case 'ArrowRight': keys.right    = false; break;
        case 'Space':                   keys.jump     = false; break;
        case 'ShiftLeft': case 'ShiftRight':
            keys.sprint = false; break;
    }
}

export function initInput() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
}

// --- Touch input API (called by touch-controls.js) ---

/** Set joystick direction. x = left/right, z = forward/backward. */
export function setTouchDirection(x, z) {
    touchDir.x = x;
    touchDir.z = z;
}

/** Trigger a one-shot jump from touch button. */
export function triggerTouchJump() {
    touchJumpPressed = true;
}

/** Set sprint state from touch toggle button. */
export function setTouchSprint(active) {
    touchSprinting = active;
}

/** Trigger a one-shot interact from touch button. */
export function triggerTouchInteract() {
    touchInteractPressed = true;
}

/**
 * Returns a normalized {x, z} direction vector from current input.
 * Merges keyboard + touch (OR logic). Z is FLIPPED so W = forward.
 * Returns {0, 0} when input is locked.
 */
export function getInputDirection() {
    if (locked) return { x: 0, z: 0 };
    let x = 0;
    let z = 0;
    // Keyboard
    if (keys.forward)  z += 1;
    if (keys.backward) z -= 1;
    if (keys.left)     x -= 1;
    if (keys.right)    x += 1;
    // Touch joystick (add, then normalize)
    x += touchDir.x;
    z += touchDir.z;
    // Normalize if magnitude > 1
    const mag = Math.sqrt(x * x + z * z);
    if (mag > 1) { x /= mag; z /= mag; }
    return { x, z };
}

export function isMoving() {
    if (locked) return false;
    const hasKeyboard = keys.forward || keys.backward || keys.left || keys.right;
    const hasTouch = Math.abs(touchDir.x) > 0.1 || Math.abs(touchDir.z) > 0.1;
    return hasKeyboard || hasTouch;
}

/** Returns true only on the frame jump was first pressed. Consumed after read. */
export function consumeJump() {
    if (locked) return false;
    if (jumpPressed || touchJumpPressed) {
        jumpPressed = false;
        touchJumpPressed = false;
        return true;
    }
    return false;
}

export function isSprinting() {
    if (locked) return false;
    return keys.sprint || touchSprinting;
}

/** Returns true only on the frame E was first pressed. Consumed after read. */
export function consumeInteract() {
    if (interactPressed || touchInteractPressed) {
        interactPressed = false;
        touchInteractPressed = false;
        return true;
    }
    return false;
}

/** Lock player movement (e.g. when a UI is open). */
export function lockInput() {
    locked = true;
}

/** Unlock player movement. */
export function unlockInput() {
    locked = false;
    // Reset all keys to prevent sticky keys after unlock
    keys.forward = false;
    keys.backward = false;
    keys.left = false;
    keys.right = false;
    keys.jump = false;
    keys.sprint = false;
    // Reset touch state too
    touchDir.x = 0;
    touchDir.z = 0;
    touchJumpPressed = false;
    touchSprinting = false;
    touchInteractPressed = false;
}
