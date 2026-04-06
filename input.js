/**
 * Input Manager
 * Tracks keyboard state for WASD / Arrow key movement, jump, sprint,
 * and interaction. Supports locking input to freeze the player.
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

/**
 * Returns a normalized {x, z} direction vector from current input.
 * Z is FLIPPED so W = forward (into the scene).
 * Returns {0, 0} when input is locked.
 */
export function getInputDirection() {
    if (locked) return { x: 0, z: 0 };
    let x = 0;
    let z = 0;
    if (keys.forward)  z += 1;
    if (keys.backward) z -= 1;
    if (keys.left)     x -= 1;
    if (keys.right)    x += 1;
    return { x, z };
}

export function isMoving() {
    if (locked) return false;
    return keys.forward || keys.backward || keys.left || keys.right;
}

/** Returns true only on the frame jump was first pressed. Consumed after read. */
export function consumeJump() {
    if (locked) return false;
    if (jumpPressed) {
        jumpPressed = false;
        return true;
    }
    return false;
}

export function isSprinting() {
    if (locked) return false;
    return keys.sprint;
}

/** Returns true only on the frame E was first pressed. Consumed after read. */
export function consumeInteract() {
    if (interactPressed) {
        interactPressed = false;
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
}
