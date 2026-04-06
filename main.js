/**
 * Main Entry Point
 * Orchestrates scene setup, loading, and the game loop.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { initInput, isMoving, consumeInteract, lockInput, unlockInput } from './input.js';
import { createPlayer, updatePlayer, getPlayerPosition, getPlayerSpeed } from './player.js';
import { createCamera, updateCamera, onResize } from './camera.js';
import { createParticles, updateParticles } from './particles.js';
import { startSnakeGame, stopSnakeGame, isSnakeGameActive } from './snake.js';

// ============================================
// GLOBALS
// ============================================
let renderer, scene, camera;
let clock;
let raycaster;
let terrainMeshes = [];
let loadingDone = false;
let arrowMesh = null;
let arrowBaseY = 0;
let arrowTime = 0;
let computerMesh = null;
let computerWorldPos = new THREE.Vector3();
let doorMesh = null;
let doorWorldPos = new THREE.Vector3();
const INTERACT_RANGE = 3.0;
let interactPrompt = null;
let doorPrompt = null;
let comingSoonOverlay = null;
let comingSoonActive = false;

// Boundary barriers (computed from model bounding box)
let boundaryMin = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
let boundaryMax = new THREE.Vector3(Infinity, Infinity, Infinity);
const BOUNDARY_MARGIN = 0.5; // inward margin from the edge

// ============================================
// INIT
// ============================================
function init() {
    // --- Renderer ---
    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // --- Scene ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88b8a0);
    scene.fog = new THREE.FogExp2(0x9ec5ab, 0.028);

    // --- Clock / Raycaster ---
    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();

    // --- Camera ---
    camera = createCamera(window.innerWidth / window.innerHeight);
    scene.add(camera);

    // --- Lights ---
    setupLights();

    // --- Input ---
    initInput();

    // --- Player ---
    createPlayer(scene);

    // --- Particles ---
    createParticles(scene);

    // --- Load environment ---
    loadEnvironment();

    // --- DOM refs ---
    interactPrompt = document.getElementById('interact-prompt');
    doorPrompt = document.getElementById('door-prompt');
    comingSoonOverlay = document.getElementById('coming-soon-overlay');

    // --- Events ---
    window.addEventListener('resize', handleResize);

    // --- Close button for snake game ---
    document.addEventListener('snake-close', () => {
        if (isSnakeGameActive()) stopSnakeGame();
    });

    // --- Close button for coming soon popup ---
    document.addEventListener('coming-soon-close', () => {
        closeComingSoon();
    });

    // --- ESC / E to close coming soon ---
    window.addEventListener('keydown', (e) => {
        if (comingSoonActive && (e.code === 'Escape' || e.code === 'KeyE')) {
            e.preventDefault();
            closeComingSoon();
        }
    });

    // --- Start loop ---
    renderer.setAnimationLoop(gameLoop);
}

// ============================================
// LIGHTS
// ============================================
function setupLights() {
    // Hemisphere (sky / ground)
    const hemi = new THREE.HemisphereLight(0xc9e8d4, 0x3a6b4a, 0.8);
    scene.add(hemi);

    // Main directional (sun)
    const sun = new THREE.DirectionalLight(0xfff4d6, 1.6);
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.001;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 4;
    scene.add(sun);

    // Soft fill light
    const fill = new THREE.DirectionalLight(0xa8d8ea, 0.4);
    fill.position.set(-6, 8, -4);
    scene.add(fill);

    // Subtle ambient
    const ambient = new THREE.AmbientLight(0xdff5e1, 0.25);
    scene.add(ambient);
}

// ============================================
// ENVIRONMENT LOADING
// ============================================
function loadEnvironment() {
    const loader = new GLTFLoader();
    const barFill = document.getElementById('loader-bar-fill');

    // Simulate progress while loading (real progress not always available)
    let fakeProgress = 0;
    const progressInterval = setInterval(() => {
        fakeProgress = Math.min(fakeProgress + Math.random() * 8, 90);
        if (barFill) barFill.style.width = fakeProgress + '%';
    }, 200);

    loader.load(
        './forest.glb',
        (gltf) => {
            clearInterval(progressInterval);
            if (barFill) barFill.style.width = '100%';

            const model = gltf.scene;

            // Enable shadows on all meshes + collect terrain
            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    terrainMeshes.push(child);
                }
                // Find the arrow mesh by name
                if (child.name && child.name.toLowerCase().includes('arrow')) {
                    arrowMesh = child;
                    arrowBaseY = child.position.y;
                    console.log('Found arrow mesh:', child.name);
                }
                // Find the computer mesh by name
                if (child.name && child.name.toLowerCase().includes('computer')) {
                    computerMesh = child;
                    console.log('Found computer mesh:', child.name);
                }
                // Find the door mesh by name
                if (child.name && child.name.toLowerCase().includes('door')) {
                    doorMesh = child;
                    console.log('Found door mesh:', child.name);
                }
            });

            // Compute model bounding box for boundary barriers
            const bbox = new THREE.Box3().setFromObject(model);
            boundaryMin.copy(bbox.min).addScalar(BOUNDARY_MARGIN);
            boundaryMax.copy(bbox.max).subScalar(BOUNDARY_MARGIN);
            console.log('Model bounds:', bbox.min, bbox.max);

            scene.add(model);

            // Hide loading screen after short delay
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) loadingScreen.classList.add('hidden');
                const hud = document.getElementById('hud');
                if (hud) hud.classList.add('visible');
                loadingDone = true;
            }, 600);
        },
        (xhr) => {
            // Real progress if available
            if (xhr.total > 0) {
                const pct = (xhr.loaded / xhr.total) * 100;
                if (barFill) barFill.style.width = Math.max(pct, fakeProgress) + '%';
            }
        },
        (err) => {
            clearInterval(progressInterval);
            console.error('Failed to load forest.glb:', err);
            // Still allow running without environment
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) loadingScreen.classList.add('hidden');
            loadingDone = true;
        }
    );
}

// ============================================
// GAME LOOP
// ============================================
function gameLoop() {
    const dt = Math.min(clock.getDelta(), 0.1); // cap to avoid spiral

    // --- Update systems ---
    updatePlayer(dt, camera, raycaster, terrainMeshes);

    const playerPos = getPlayerPosition();
    const playerSpeed = getPlayerSpeed();

    updateCamera(playerPos, playerSpeed, dt);
    updateParticles(dt, playerPos, playerSpeed);

    // --- Animate arrow (spin + bob) ---
    if (arrowMesh) {
        arrowTime += dt;
        arrowMesh.rotation.z += dt * 2.0;
        arrowMesh.position.y = arrowBaseY + Math.sin(arrowTime * 2.0) * 0.3;
    }

    // --- Computer interaction ---
    if (computerMesh && !isSnakeGameActive() && !comingSoonActive) {
        // Get world position of the computer
        computerMesh.getWorldPosition(computerWorldPos);
        const dist = playerPos.distanceTo(computerWorldPos);

        if (dist < INTERACT_RANGE) {
            // Show prompt
            if (interactPrompt) interactPrompt.classList.add('visible');

            // Check for E press
            if (consumeInteract()) {
                startSnakeGame();
                if (interactPrompt) interactPrompt.classList.remove('visible');
                // Hide the arrow after first interaction
                if (arrowMesh) {
                    arrowMesh.visible = false;
                    arrowMesh = null;
                }
            }
        } else {
            if (interactPrompt) interactPrompt.classList.remove('visible');
        }
    } else if (isSnakeGameActive() || comingSoonActive) {
        if (interactPrompt) interactPrompt.classList.remove('visible');
    }

    // --- Door interaction ---
    if (doorMesh && !isSnakeGameActive() && !comingSoonActive) {
        doorMesh.getWorldPosition(doorWorldPos);
        const doorDist = playerPos.distanceTo(doorWorldPos);

        if (doorDist < INTERACT_RANGE) {
            if (doorPrompt) doorPrompt.classList.add('visible');

            if (consumeInteract()) {
                openComingSoon();
                if (doorPrompt) doorPrompt.classList.remove('visible');
            }
        } else {
            if (doorPrompt) doorPrompt.classList.remove('visible');
        }
    } else if (comingSoonActive || isSnakeGameActive()) {
        if (doorPrompt) doorPrompt.classList.remove('visible');
    }

    // --- Boundary barriers: clamp player position ---
    if (loadingDone) {
        playerPos.x = THREE.MathUtils.clamp(playerPos.x, boundaryMin.x, boundaryMax.x);
        playerPos.z = THREE.MathUtils.clamp(playerPos.z, boundaryMin.z, boundaryMax.z);
    }

    // --- Render ---
    renderer.render(scene, camera);
}

// ============================================
// COMING SOON POPUP
// ============================================
function openComingSoon() {
    comingSoonActive = true;
    if (comingSoonOverlay) comingSoonOverlay.classList.add('visible');
    lockInput();
}

function closeComingSoon() {
    if (!comingSoonActive) return;
    comingSoonActive = false;
    if (comingSoonOverlay) comingSoonOverlay.classList.remove('visible');
    unlockInput();
}

// ============================================
// RESIZE
// ============================================
function handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    onResize(w / h);
}

// ============================================
// BOOT
// ============================================
init();
