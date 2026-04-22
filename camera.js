/**
 * Camera Controller
 * Isometric-style perspective camera that smoothly follows the player.
 */

import * as THREE from 'three';

// --- Config ---
let BASE_DISTANCE   = 14;
let DISTANCE_MOVING = 12;    // Zoom in slightly when moving
const ANGLE_Y         = Math.PI / 4;       // 45° rotation
const ANGLE_PITCH     = Math.PI / 5.5;     // ~33° downward tilt
const FOLLOW_LERP     = 0.06;
const ZOOM_LERP       = 0.04;

let camera    = null;
let offset    = new THREE.Vector3();
let targetPos = new THREE.Vector3();
let currentDistance = BASE_DISTANCE;

/**
 * Creates the isometric perspective camera.
 */
export function createCamera(aspect) {
    camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 300);

    // Compute initial offset
    _computeOffset(BASE_DISTANCE);
    camera.position.copy(offset);
    camera.lookAt(0, 0, 0);

    return camera;
}

function _computeOffset(dist) {
    offset.set(
        Math.sin(ANGLE_Y) * Math.cos(ANGLE_PITCH) * dist,
        Math.sin(ANGLE_PITCH) * dist,
        Math.cos(ANGLE_Y) * Math.cos(ANGLE_PITCH) * dist
    );
}

/**
 * Smoothly follows the player position.
 * @param {THREE.Vector3} playerPos
 * @param {number} playerSpeed - speed magnitude for zoom effect
 * @param {number} dt
 */
export function updateCamera(playerPos, playerSpeed, dt) {
    if (!camera) return;

    // Dynamic zoom
    const isMoving = playerSpeed > 0.5;
    const targetDist = isMoving ? DISTANCE_MOVING : BASE_DISTANCE;
    currentDistance = THREE.MathUtils.lerp(currentDistance, targetDist, ZOOM_LERP);
    _computeOffset(currentDistance);

    // Smooth follow
    targetPos.copy(playerPos).add(offset);
    camera.position.lerp(targetPos, FOLLOW_LERP);

    // Always look at player (slightly above center)
    const lookTarget = playerPos.clone();
    lookTarget.y += 0.3;
    camera.lookAt(lookTarget);
}

export function getCamera() {
    return camera;
}

export function onResize(aspect) {
    if (!camera) return;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
}

/**
 * Sets the camera distance (smoothly lerps to it).
 * @param {number} base - distance when idle
 * @param {number} moving - distance when moving
 */
export function setCameraDistance(base, moving) {
    BASE_DISTANCE = base;
    DISTANCE_MOVING = moving;
}
