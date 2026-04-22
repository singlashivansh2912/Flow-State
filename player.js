/**
 * Player Controller
 * Creates and manages the blob character with movement physics,
 * jump, and sprint.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getInputDirection, isMoving, consumeJump, isSprinting } from './input.js';

// --- Config ---
const BASE_WALK_SPEED = 6.0;
const BASE_SPRINT_SPEED = 10.0;
let WALK_SPEED = BASE_WALK_SPEED;
let SPRINT_SPEED = BASE_SPRINT_SPEED;
const ROTATION_SPEED = 10.0;
const CUBE_SIZE = 0.7;     // width/depth of the cube
const CUBE_HEIGHT = 0.65;    // height of the cube (slightly shorter = squat)
const CUBE_ROUNDNESS = 0.15;    // corner rounding
const BASE_BLOB_RADIUS = CUBE_HEIGHT / 2; // half-height for grounding (default)
let BLOB_RADIUS = BASE_BLOB_RADIUS;
const BLOB_COLOR = 0xa8e6cf;
const BLOB_COLOR_DARK = 0x56c596;

// Jump
const JUMP_FORCE = 7.0;
const GRAVITY = 18.0;

// Collision — max height the player can walk up without jumping
const BASE_MAX_STEP_HEIGHT = 0.45;
let MAX_STEP_HEIGHT = BASE_MAX_STEP_HEIGHT;

// --- State ---
const velocity = new THREE.Vector3();
const moveDir = new THREE.Vector3();
let group = null;
let blobMesh = null;

let eyeLeft = null;
let eyeRight = null;
let time = 0;
let terrainY = 0;

// Jump state
let verticalVelocity = 0;
let isGrounded = true;
let jumpSquashTimer = 0;   // for landing squash effect

// Smooth stretch state (lerped each frame)
let currentStretchZ = 1;
let currentSlimX = 1;
let currentSlimY = 1;
const STRETCH_LERP_SPEED = 8.0;  // how fast the stretch transitions

/**
 * Helper: raycast downward at a given XZ position and return the ground Y.
 * Returns null if nothing was hit.
 */
function _sampleGround(x, z, raycaster, terrainMeshes) {
    const origin = new THREE.Vector3(x, 50, z);
    raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObjects(terrainMeshes, true);
    if (hits.length > 0) {
        return hits[0].point.y;
    }
    return null;
}

/**
 * Builds the cubical slime character group.
 */
export function createPlayer(scene) {
    group = new THREE.Group();
    group.position.set(11.323, -1.4878, 1.48797);

    // --- Main body (rounded cube) ---
    const bodyGeo = new RoundedBoxGeometry(CUBE_SIZE, CUBE_HEIGHT, CUBE_SIZE, 4, CUBE_ROUNDNESS);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: BLOB_COLOR,
        roughness: 0.3,
        metalness: 0.05,
        emissive: BLOB_COLOR_DARK,
        emissiveIntensity: 0.1,
    });
    blobMesh = new THREE.Mesh(bodyGeo, bodyMat);
    blobMesh.castShadow = true;
    blobMesh.receiveShadow = false;
    group.add(blobMesh);

    // --- Face container (rotates with the body for eyes + mouth) ---
    const halfZ = CUBE_SIZE / 2;

    // --- Eyes ---
    const eyeGeo = new THREE.SphereGeometry(0.065, 16, 12);
    const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.15,
        metalness: 0.0,
    });
    const eyeWhiteGeo = new THREE.SphereGeometry(0.095, 16, 12);
    const eyeWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.25,
        metalness: 0.0,
    });

    // Left eye — positioned on the front face of the cube
    const eyeWhiteL = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWhiteL.position.set(-0.14, 0.06, halfZ - 0.01);
    eyeWhiteL.scale.set(1, 1.1, 0.55);
    group.add(eyeWhiteL);
    eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
    eyeLeft.position.set(-0.14, 0.06, halfZ + 0.02);
    group.add(eyeLeft);

    // Right eye
    const eyeWhiteR = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
    eyeWhiteR.position.set(0.14, 0.06, halfZ - 0.01);
    eyeWhiteR.scale.set(1, 1.1, 0.55);
    group.add(eyeWhiteR);
    eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
    eyeRight.position.set(0.14, 0.06, halfZ + 0.02);
    group.add(eyeRight);

    // --- Small mouth (simple flat ellipse) ---
    const mouthGeo = new THREE.SphereGeometry(0.04, 12, 8);
    const mouthMat = new THREE.MeshStandardMaterial({
        color: 0x2d4a3e,
        roughness: 0.3,
    });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, -0.08, halfZ + 0.01);
    mouth.scale.set(1.8, 0.8, 0.4);
    group.add(mouth);



    scene.add(group);
    return group;
}

/**
 * Updates player each frame.
 * @param {number} dt - delta time in seconds
 * @param {THREE.Camera} camera - the scene camera
 * @param {THREE.Raycaster} raycaster - reusable raycaster for terrain
 * @param {THREE.Mesh[]} terrainMeshes - meshes to raycast against for grounding
 */
export function updatePlayer(dt, camera, raycaster, terrainMeshes) {
    if (!group) return;

    time += dt;
    const input = getInputDirection();
    const hasInput = input.x !== 0 || input.z !== 0;
    const sprinting = isSprinting();

    // --- Constant movement speed (no acceleration) ---
    const currentSpeed = sprinting ? SPRINT_SPEED : WALK_SPEED;

    // --- Camera-relative movement ---
    if (hasInput) {
        // Get camera forward / right projected onto XZ plane
        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);
        camForward.y = 0;
        camForward.normalize();

        const camRight = new THREE.Vector3();
        camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

        moveDir.set(0, 0, 0);
        moveDir.addScaledVector(camRight, input.x);
        moveDir.addScaledVector(camForward, input.z);
        moveDir.normalize();

        // Set velocity directly to constant speed
        velocity.x = moveDir.x * currentSpeed;
        velocity.z = moveDir.z * currentSpeed;
    } else {
        // No input — stop immediately
        velocity.x = 0;
        velocity.z = 0;
    }

    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

    // --- Save position before moving (for collision rollback) ---
    const prevX = group.position.x;
    const prevZ = group.position.z;

    // Apply horizontal movement
    group.position.x += velocity.x * dt;
    group.position.z += velocity.z * dt;

    // --- Terrain grounding via raycast + step-height collision ---
    if (terrainMeshes && terrainMeshes.length > 0) {
        const newGroundY = _sampleGround(group.position.x, group.position.z, raycaster, terrainMeshes);

        if (newGroundY !== null) {
            const heightDelta = newGroundY - terrainY;
            // The player's foot Y (bottom of blob)
            const playerFootY = group.position.y - BLOB_RADIUS;

            if (heightDelta > MAX_STEP_HEIGHT) {
                // Surface ahead is too tall to step onto.
                // Only allow if the player is airborne AND their feet are above the surface.
                if (!isGrounded && playerFootY >= newGroundY - 0.05) {
                    // Player jumped high enough — accept the new ground
                    terrainY = newGroundY;
                } else {
                    // Blocked! Try sliding along each axis independently.
                    const slideXGroundY = _sampleGround(group.position.x, prevZ, raycaster, terrainMeshes);
                    const slideZGroundY = _sampleGround(prevX, group.position.z, raycaster, terrainMeshes);

                    let resolved = false;

                    // Try keeping X movement, reverting Z
                    if (slideXGroundY !== null && (slideXGroundY - terrainY) <= MAX_STEP_HEIGHT) {
                        group.position.z = prevZ;
                        terrainY = slideXGroundY;
                        velocity.z *= -0.1; // soft bounce
                        resolved = true;
                    }
                    // Try keeping Z movement, reverting X
                    else if (slideZGroundY !== null && (slideZGroundY - terrainY) <= MAX_STEP_HEIGHT) {
                        group.position.x = prevX;
                        terrainY = slideZGroundY;
                        velocity.x *= -0.1; // soft bounce
                        resolved = true;
                    }

                    // Both axes blocked — full revert
                    if (!resolved) {
                        group.position.x = prevX;
                        group.position.z = prevZ;
                        velocity.x *= -0.1;
                        velocity.z *= -0.1;
                    }
                }
            } else {
                // Normal walkable surface (small step or downhill) — accept it
                terrainY = newGroundY;
            }
        }
    }

    const groundY = terrainY + BLOB_RADIUS;

    // --- Jump ---
    if (consumeJump() && isGrounded) {
        verticalVelocity = JUMP_FORCE;
        isGrounded = false;
    }

    // Apply gravity
    if (!isGrounded) {
        verticalVelocity -= GRAVITY * dt;
        group.position.y += verticalVelocity * dt;

        // Landing check
        if (group.position.y <= groundY) {
            group.position.y = groundY;
            verticalVelocity = 0;
            isGrounded = true;
            jumpSquashTimer = 0.15; // trigger landing squash
        }
    } else {
        // Smooth ground follow when grounded
        group.position.y = THREE.MathUtils.lerp(group.position.y, groundY, 0.15);
    }

    // --- Rotation toward movement direction ---
    if (speed > 0.3) {
        const targetAngle = Math.atan2(velocity.x, velocity.z);
        const currentAngle = group.rotation.y;
        let diff = targetAngle - currentAngle;
        // Wrap to [-PI, PI]
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        group.rotation.y += diff * Math.min(1, ROTATION_SPEED * dt);
    }

    // --- Trailing stretch: elongate behind, slim down, face stays put ---
    const speedRatio = Math.min(speed / currentSpeed, 1);
    // Target deformation values
    const targetStretchZ = 1 + speedRatio * 0.15;
    const targetSlimX = 1 - speedRatio * 0.08;
    const targetSlimY = 1 - speedRatio * 0.05;

    // Smoothly lerp toward target values
    const lerpFactor = 1 - Math.exp(-STRETCH_LERP_SPEED * dt);
    currentStretchZ += (targetStretchZ - currentStretchZ) * lerpFactor;
    currentSlimX += (targetSlimX - currentSlimX) * lerpFactor;
    currentSlimY += (targetSlimY - currentSlimY) * lerpFactor;

    // --- Idle wobble / breathing ---
    const idleScale = 1 + Math.sin(time * 2.5) * 0.025;
    const idleBob = Math.sin(time * 2.5) * 0.015;

    blobMesh.scale.set(
        currentSlimX * idleScale,
        currentSlimY * idleScale,
        currentStretchZ * idleScale
    );
    // Offset mesh backward so the face (front, +Z) stays in place
    // and the stretch extends behind (-Z)
    const zOffset = -(currentStretchZ - 1) * CUBE_SIZE * 0.5;
    blobMesh.position.z = zOffset;
    blobMesh.position.y = isGrounded ? idleBob : 0;
    blobMesh.rotation.x = 0;


}

export function getPlayerPosition() {
    return group ? group.position : new THREE.Vector3();
}

export function getPlayerSpeed() {
    return Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
}

/**
 * Teleports the player to an exact world position.
 */
export function setPlayerPosition(x, y, z) {
    if (!group) return;
    group.position.set(x, y, z);
    // Reset vertical velocity so the player doesn't keep falling/jumping
    verticalVelocity = 0;
    isGrounded = true;
    // Update terrainY so grounding logic doesn't snap the player back
    terrainY = y - BLOB_RADIUS;
}

/**
 * Scales the player uniformly.
 * @param {number} s - scale factor (1 = default size)
 */
export function setPlayerScale(s) {
    if (!group) return;
    group.scale.set(s, s, s);
    // Scale hitbox/collision values proportionally
    BLOB_RADIUS = BASE_BLOB_RADIUS * s;
    MAX_STEP_HEIGHT = BASE_MAX_STEP_HEIGHT * s;
    // Scale speed proportionally
    WALK_SPEED = BASE_WALK_SPEED * s;
    SPRINT_SPEED = BASE_SPRINT_SPEED * s;
}

