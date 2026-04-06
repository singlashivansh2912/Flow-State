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

// Night mode
let nightModeEnabled = false;

// Lights (stored for day/night switching)
let hemiLight = null;
let sunLight = null;
let fillLight = null;
let ambientLight = null;

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

    // --- Main menu: wait for Play click ---
    const mainMenu = document.getElementById('main-menu');
    const playBtn = document.getElementById('menu-play-btn');
    const nightToggle = document.getElementById('night-mode-toggle');
    const introScreen = document.getElementById('intro-screen');
    const introText = document.getElementById('intro-text');
    const introSkipBtn = document.getElementById('intro-skip-btn');

    const INTRO_MESSAGE = "You come across a building in the forest that feels strangely familiar, as if you\u2019ve been here before. Inside, a lab sits silent and without power, and a locked gate blocks your way forward. To proceed, you must restore the system. Three units remain \u2014 activate them in any order.";

    let typewriterInterval = null;
    let introFinished = false;

    function formatIntroText(text) {
        // Replace ". " with ".<br><br>" for paragraph breaks
        return text.replace(/\. /g, '.<br><br>');
    }

    function startTypewriter() {
        let charIndex = 0;
        introText.innerHTML = '';
        introText.classList.remove('done');
        introSkipBtn.textContent = 'Skip \u25B8';
        introSkipBtn.classList.remove('continue');

        typewriterInterval = setInterval(() => {
            if (charIndex < INTRO_MESSAGE.length) {
                // Build the current substring and format it
                charIndex++;
                introText.innerHTML = formatIntroText(INTRO_MESSAGE.substring(0, charIndex));
            } else {
                clearInterval(typewriterInterval);
                typewriterInterval = null;
                finishIntro();
            }
        }, 40);
    }

    function finishIntro() {
        introFinished = true;
        introText.innerHTML = formatIntroText(INTRO_MESSAGE);
        introText.classList.add('done');
        introSkipBtn.textContent = 'Continue \u25B8';
        introSkipBtn.classList.add('continue');
    }

    playBtn.addEventListener('click', () => {
        // Read night mode state
        nightModeEnabled = nightToggle.checked;

        // Apply night mode to scene and body
        if (nightModeEnabled) {
            applyNightMode();
        } else {
            applyDayMode();
        }

        // Hide menu, show intro
        mainMenu.classList.add('hidden');
        setTimeout(() => {
            introScreen.classList.add('visible');
            startTypewriter();
        }, 600);
    });

    introSkipBtn.addEventListener('click', () => {
        if (!introFinished) {
            // Skip: show full text immediately
            if (typewriterInterval) {
                clearInterval(typewriterInterval);
                typewriterInterval = null;
            }
            finishIntro();
        } else {
            // Continue: hide intro and start loading
            introScreen.classList.remove('visible');
            introScreen.classList.add('hidden');
            setTimeout(() => {
                loadEnvironment();
            }, 500);
        }
    });

    // --- Start render loop (renders black behind the menu until env loads) ---
    renderer.setAnimationLoop(gameLoop);
}

// ============================================
// LIGHTS
// ============================================
function setupLights() {
    // Hemisphere (sky / ground)
    hemiLight = new THREE.HemisphereLight(0xc9e8d4, 0x3a6b4a, 0.8);
    scene.add(hemiLight);

    // Main directional (sun)
    sunLight = new THREE.DirectionalLight(0xfff4d6, 1.6);
    sunLight.position.set(8, 16, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 50;
    sunLight.shadow.bias = -0.001;
    sunLight.shadow.normalBias = 0.02;
    sunLight.shadow.radius = 4;
    scene.add(sunLight);

    // Soft fill light
    fillLight = new THREE.DirectionalLight(0xa8d8ea, 0.4);
    fillLight.position.set(-6, 8, -4);
    scene.add(fillLight);

    // Subtle ambient
    ambientLight = new THREE.AmbientLight(0xdff5e1, 0.25);
    scene.add(ambientLight);
}

// ============================================
// DAY / NIGHT MODE
// ============================================
function applyDayMode() {
    document.body.classList.remove('night-mode');

    // Scene
    scene.background = new THREE.Color(0x88b8a0);
    scene.fog = new THREE.FogExp2(0x9ec5ab, 0.028);

    // Lights
    hemiLight.color.set(0xc9e8d4);
    hemiLight.groundColor.set(0x3a6b4a);
    hemiLight.intensity = 0.8;

    sunLight.color.set(0xfff4d6);
    sunLight.intensity = 1.6;
    sunLight.position.set(8, 16, 10);

    fillLight.color.set(0xa8d8ea);
    fillLight.intensity = 0.4;

    ambientLight.color.set(0xdff5e1);
    ambientLight.intensity = 0.25;

    // Shadows — crisp daylight
    sunLight.shadow.radius = 4;
    sunLight.shadow.normalBias = 0.02;

    renderer.toneMappingExposure = 1.1;
}

function applyNightMode() {
    document.body.classList.add('night-mode');

    // Scene — dark blue-teal sky
    scene.background = new THREE.Color(0x101828);
    scene.fog = new THREE.FogExp2(0x121a2e, 0.025);

    // Hemisphere — cool moonlit sky with some ground bounce
    hemiLight.color.set(0x4466aa);
    hemiLight.groundColor.set(0x1a2040);
    hemiLight.intensity = 0.6;

    // Directional — bright moonlight (silver-blue, the main source)
    sunLight.color.set(0xaabbee);
    sunLight.intensity = 1.1;
    sunLight.position.set(-5, 14, 8);

    // Fill — soft indigo bounce
    fillLight.color.set(0x5566bb);
    fillLight.intensity = 0.35;

    // Ambient — base night visibility
    ambientLight.color.set(0x2a2a55);
    ambientLight.intensity = 0.45;

    // Shadows — soft and diffused for moonlight
    sunLight.shadow.radius = 8;
    sunLight.shadow.normalBias = 0.05;

    renderer.toneMappingExposure = 0.95;
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
