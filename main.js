/**
 * Main Entry Point
 * Orchestrates scene setup, loading, and the game loop.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { initInput, isMoving, consumeInteract, lockInput, unlockInput } from './input.js';
import { createPlayer, updatePlayer, getPlayerPosition, getPlayerSpeed, setPlayerPosition, setPlayerScale } from './player.js';
import { createCamera, updateCamera, onResize, setCameraDistance } from './camera.js';
import { createParticles, updateParticles } from './particles.js';
import { startSnakeGame, stopSnakeGame, isSnakeGameActive } from './snake.js';

// ============================================
// GLOBALS
// ============================================
let renderer, scene, camera;
let clock;
let raycaster;
let terrainMeshes = [];
let mazeMeshes = [];          // terrain meshes from maze.glb
let loadingDone = false;
let arrowMesh = null;
let arrowBaseY = 0;
let arrowTime = 0;
let computerMesh = null;
let computerWorldPos = new THREE.Vector3();
let doorMesh = null;          // forest door
let doorWorldPos = new THREE.Vector3();
const INTERACT_RANGE = 3.0;
let interactPrompt = null;
let doorPrompt = null;
let comingSoonOverlay = null;
let comingSoonActive = false;

// Current area: 'forest' or 'maze'
let currentArea = 'forest';

// --- Maze objects ---
let mazeModel = null;         // the loaded maze scene
let mazeComputers = [];       // [{mesh, worldPos}] for Computer, Computer02, Computer03
let mazeDoorMesh = null;      // maze exit door
let mazeDoorWorldPos = new THREE.Vector3();
let mazeSpawnPos = new THREE.Vector3(-1.326, 0, 4.7987); // fallback, overridden by 'spawn' object

// --- Occlusion fading (camera-to-player wall transparency) ---
let occlusionRaycaster = new THREE.Raycaster();
let fadedMeshes = new Map();   // Map<mesh, {originalOpacity, originalTransparent}>
const FADE_OPACITY = 0.15;     // target opacity for occluding walls
const FADE_SPEED = 8.0;        // how fast walls fade in/out (per second)

// Maze DOM refs
let mazeComputerPrompt = null;
let mazeDoorPrompt = null;
let mazeDoorLockedOverlay = null;
let mazeDoorLockedActive = false;

// Minigame completion tracking
let minigamesCompleted = {
    Computer: false,
    Computer02: false,
    Computer03: false,
};

// Maze transition screen
let mazeTransitionScreen = null;
let mazeTransitionText = null;
let mazeTransitionBtn = null;
let mazeTransitionActive = false;

const MAZE_TRANSITION_MESSAGE = "You Step Into The Cold Laboratory where you find no one but you. "; // Leave empty — user will fill in later

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

// Player start position in the forest
const FOREST_SPAWN = { x: 11.323, y: -1.4878, z: 1.48797 };

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
    mazeComputerPrompt = document.getElementById('maze-computer-prompt');
    mazeDoorPrompt = document.getElementById('maze-door-prompt');
    mazeDoorLockedOverlay = document.getElementById('maze-door-locked-overlay');
    mazeTransitionScreen = document.getElementById('maze-transition-screen');
    mazeTransitionText = document.getElementById('maze-transition-text');
    mazeTransitionBtn = document.getElementById('maze-transition-btn');

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

    // --- Close button for maze door locked popup ---
    document.addEventListener('maze-door-locked-close', () => {
        closeMazeDoorLocked();
    });

    // --- ESC / E to close popups ---
    window.addEventListener('keydown', (e) => {
        if (comingSoonActive && (e.code === 'Escape' || e.code === 'KeyE')) {
            e.preventDefault();
            closeComingSoon();
        }
        if (mazeDoorLockedActive && (e.code === 'Escape' || e.code === 'KeyE')) {
            e.preventDefault();
            closeMazeDoorLocked();
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

    // --- Maze transition button ---
    mazeTransitionBtn.addEventListener('click', () => {
        // Hide transition screen
        mazeTransitionScreen.classList.remove('visible');
        mazeTransitionScreen.classList.add('hidden');

        // Switch to maze area
        setTimeout(() => {
            switchToMaze();
            mazeTransitionActive = false;
            unlockInput();
        }, 500);
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

    // Load both forest and maze models
    let forestLoaded = false;
    let mazeLoaded = false;
    let forestModel = null;

    function checkAllLoaded() {
        if (forestLoaded && mazeLoaded) {
            clearInterval(progressInterval);
            if (barFill) barFill.style.width = '100%';

            // Add forest model to scene (active by default)
            scene.add(forestModel);

            // Compute boundary from forest model
            const bbox = new THREE.Box3().setFromObject(forestModel);
            boundaryMin.copy(bbox.min).addScalar(BOUNDARY_MARGIN);
            boundaryMax.copy(bbox.max).subScalar(BOUNDARY_MARGIN);
            console.log('Forest bounds:', bbox.min, bbox.max);

            // Don't add maze model yet — it gets added when player enters
            // Keep it stored in mazeModel

            // Hide loading screen after short delay
            setTimeout(() => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) loadingScreen.classList.add('hidden');
                const hud = document.getElementById('hud');
                if (hud) hud.classList.add('visible');
                loadingDone = true;
            }, 600);
        }
    }

    // --- Load forest.glb ---
    loader.load(
        './forest.glb',
        (gltf) => {
            forestModel = gltf.scene;

            // Enable shadows on all meshes + collect terrain
            forestModel.traverse((child) => {
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
                // Find the computer mesh by name (forest computer for snake game)
                if (child.name && child.name.toLowerCase().includes('computer')) {
                    computerMesh = child;
                    console.log('Found forest computer mesh:', child.name);
                }
                // Find the door mesh by name (forest door)
                if (child.name && child.name.toLowerCase().includes('door')) {
                    doorMesh = child;
                    console.log('Found forest door mesh:', child.name);
                }
            });

            forestLoaded = true;
            checkAllLoaded();
        },
        (xhr) => {
            // Real progress if available
            if (xhr.total > 0) {
                const pct = (xhr.loaded / xhr.total) * 50; // forest is first 50%
                if (barFill) barFill.style.width = Math.max(pct, fakeProgress) + '%';
            }
        },
        (err) => {
            console.error('Failed to load forest.glb:', err);
            forestLoaded = true;
            checkAllLoaded();
        }
    );

    // --- Load maze.glb ---
    loader.load(
        './maze.glb',
        (gltf) => {
            mazeModel = gltf.scene;

            mazeModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    mazeMeshes.push(child);
                }

                // Find the 3 computers: exact names "Computer", "Computer02", "Computer03"
                if (child.name.toLowerCase() === 'chair1' || child.name.toLowerCase() === 'chair2' || child.name.toLowerCase() === 'chair3') {
                    mazeComputers.push({
                        mesh: child,
                        name: child.name,
                        worldPos: new THREE.Vector3(),
                    });
                    console.log('Found maze computer:', child.name);
                }

                // Find the maze exit door (named "door" or "Door")
                if (child.name && child.name.toLowerCase() === 'door') {
                    mazeDoorMesh = child;
                    console.log('Found maze door:', child.name);
                }

                // Find the spawn point
                if (child.name && child.name.toLowerCase() === 'spawn') {
                    child.getWorldPosition(mazeSpawnPos);
                    console.log('Found maze spawn:', child.name, mazeSpawnPos);
                }
            });

            mazeLoaded = true;
            checkAllLoaded();
        },
        (xhr) => {
            if (xhr.total > 0) {
                const pct = 50 + (xhr.loaded / xhr.total) * 50; // maze is second 50%
                if (barFill) barFill.style.width = Math.max(pct, fakeProgress) + '%';
            }
        },
        (err) => {
            console.error('Failed to load maze.glb:', err);
            mazeLoaded = true;
            checkAllLoaded();
        }
    );
}

// ============================================
// AREA SWITCHING
// ============================================

/**
 * Switches from forest to maze: hides forest model, shows maze, teleports player.
 */
function switchToMaze() {
    currentArea = 'maze';

    // Remove forest model from scene (keep reference for switching back)
    const forestObj = scene.children.find(c => c.isGroup || c.isObject3D && terrainMeshes.some(m => m.parent === c || c.getObjectById(m.id)));
    // Simpler: just hide all forest terrain meshes' root
    // Actually, find the root model that contains the forest meshes
    if (terrainMeshes.length > 0) {
        // Walk up to find the GLTF root
        let root = terrainMeshes[0];
        while (root.parent && root.parent !== scene) {
            root = root.parent;
        }
        if (root.parent === scene) {
            root.visible = false;
        }
    }

    // Add maze model to scene
    if (mazeModel && !mazeModel.parent) {
        scene.add(mazeModel);
    }
    if (mazeModel) {
        mazeModel.visible = true;
    }

    // Update boundaries from maze model
    if (mazeModel) {
        const bbox = new THREE.Box3().setFromObject(mazeModel);
        boundaryMin.copy(bbox.min).addScalar(BOUNDARY_MARGIN);
        boundaryMax.copy(bbox.max).subScalar(BOUNDARY_MARGIN);
        console.log('Maze bounds:', bbox.min, bbox.max);
    }

    // Teleport player to maze spawn point (from 'spawn' object in maze.glb)
    setPlayerPosition(mazeSpawnPos.x, mazeSpawnPos.y, mazeSpawnPos.z);
    setPlayerScale(3); // shrink player to fit maze corridors
    setCameraDistance(28, 25); // zoom out for larger player in maze
}

/**
 * Switches from maze back to forest: hides maze model, shows forest, teleports player.
 */
function switchToForest() {
    currentArea = 'forest';

    // Hide maze model
    if (mazeModel) {
        mazeModel.visible = false;
    }

    // Show forest model
    if (terrainMeshes.length > 0) {
        let root = terrainMeshes[0];
        while (root.parent && root.parent !== scene) {
            root = root.parent;
        }
        if (root.parent === scene) {
            root.visible = true;
        }
    }

    // Restore forest boundaries
    if (terrainMeshes.length > 0) {
        let root = terrainMeshes[0];
        while (root.parent && root.parent !== scene) {
            root = root.parent;
        }
        const bbox = new THREE.Box3().setFromObject(root);
        boundaryMin.copy(bbox.min).addScalar(BOUNDARY_MARGIN);
        boundaryMax.copy(bbox.max).subScalar(BOUNDARY_MARGIN);
    }

    // Teleport player back to forest spawn
    setPlayerPosition(FOREST_SPAWN.x, FOREST_SPAWN.y, FOREST_SPAWN.z);
    setPlayerScale(1.0); // restore original size
    setCameraDistance(14, 12); // restore forest camera distance
}

// ============================================
// GAME LOOP
// ============================================
function gameLoop() {
    const dt = Math.min(clock.getDelta(), 0.1); // cap to avoid spiral

    // Determine which terrain meshes to use for raycasting
    const activeTerrain = currentArea === 'forest' ? terrainMeshes : mazeMeshes;

    // --- Update systems ---
    updatePlayer(dt, camera, raycaster, activeTerrain);

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

    // =============================================
    // FOREST-specific interactions
    // =============================================
    if (currentArea === 'forest') {
        // --- Computer interaction (snake game) ---
        if (computerMesh && !isSnakeGameActive() && !comingSoonActive && !mazeTransitionActive) {
            computerMesh.getWorldPosition(computerWorldPos);
            const dist = playerPos.distanceTo(computerWorldPos);

            if (dist < INTERACT_RANGE) {
                if (interactPrompt) interactPrompt.classList.add('visible');

                if (consumeInteract()) {
                    startSnakeGame();
                    if (interactPrompt) interactPrompt.classList.remove('visible');
                    if (arrowMesh) {
                        arrowMesh.visible = false;
                        arrowMesh = null;
                    }
                }
            } else {
                if (interactPrompt) interactPrompt.classList.remove('visible');
            }
        } else if (isSnakeGameActive() || comingSoonActive || mazeTransitionActive) {
            if (interactPrompt) interactPrompt.classList.remove('visible');
        }

        // --- Forest door interaction (triggers maze transition) ---
        if (doorMesh && !isSnakeGameActive() && !comingSoonActive && !mazeTransitionActive) {
            doorMesh.getWorldPosition(doorWorldPos);
            const doorDist = playerPos.distanceTo(doorWorldPos);

            if (doorDist < INTERACT_RANGE) {
                if (doorPrompt) doorPrompt.classList.add('visible');

                if (consumeInteract()) {
                    // Show the maze transition screen
                    openMazeTransition();
                    if (doorPrompt) doorPrompt.classList.remove('visible');
                }
            } else {
                if (doorPrompt) doorPrompt.classList.remove('visible');
            }
        } else if (comingSoonActive || isSnakeGameActive() || mazeTransitionActive) {
            if (doorPrompt) doorPrompt.classList.remove('visible');
        }

        // Hide maze-specific prompts when in forest
        if (mazeComputerPrompt) mazeComputerPrompt.classList.remove('visible');
        if (mazeDoorPrompt) mazeDoorPrompt.classList.remove('visible');
    }

    // =============================================
    // MAZE-specific interactions
    // =============================================
    if (currentArea === 'maze') {
        // Hide forest-specific prompts
        if (interactPrompt) interactPrompt.classList.remove('visible');
        if (doorPrompt) doorPrompt.classList.remove('visible');

        // --- Maze computer interactions ---
        let nearComputer = null;
        if (!comingSoonActive && !mazeDoorLockedActive) {
            for (const comp of mazeComputers) {
                comp.mesh.getWorldPosition(comp.worldPos);
                const dist = playerPos.distanceTo(comp.worldPos);
                if (dist < INTERACT_RANGE) {
                    nearComputer = comp;
                    break;
                }
            }
        }

        if (nearComputer) {
            if (mazeComputerPrompt) mazeComputerPrompt.classList.add('visible');

            if (consumeInteract()) {
                openComingSoon();
                if (mazeComputerPrompt) mazeComputerPrompt.classList.remove('visible');
            }
        } else {
            if (mazeComputerPrompt) mazeComputerPrompt.classList.remove('visible');
        }

        // --- Maze exit door interaction ---
        if (mazeDoorMesh && !comingSoonActive && !mazeDoorLockedActive) {
            mazeDoorMesh.getWorldPosition(mazeDoorWorldPos);
            const doorDist = playerPos.distanceTo(mazeDoorWorldPos);

            if (doorDist < INTERACT_RANGE) {
                if (mazeDoorPrompt) mazeDoorPrompt.classList.add('visible');

                if (consumeInteract()) {
                    if (mazeDoorPrompt) mazeDoorPrompt.classList.remove('visible');

                    // Check if all minigames are completed
                    const allCompleted = Object.values(minigamesCompleted).every(v => v);
                    if (allCompleted) {
                        // Exit the maze — go back to forest
                        switchToForest();
                    } else {
                        // Show locked popup
                        openMazeDoorLocked();
                    }
                }
            } else {
                if (mazeDoorPrompt) mazeDoorPrompt.classList.remove('visible');
            }
        } else if (comingSoonActive || mazeDoorLockedActive) {
            if (mazeDoorPrompt) mazeDoorPrompt.classList.remove('visible');
        }
    }

    // --- Boundary barriers: clamp player position ---
    if (loadingDone) {
        playerPos.x = THREE.MathUtils.clamp(playerPos.x, boundaryMin.x, boundaryMax.x);
        playerPos.z = THREE.MathUtils.clamp(playerPos.z, boundaryMin.z, boundaryMax.z);
    }

    // --- Occlusion fading (maze only) ---
    if (currentArea === 'maze') {
        updateOcclusionFading(dt, playerPos);
    } else {
        // Restore all faded meshes when leaving the maze
        restoreAllFaded();
    }

    // --- Render ---
    renderer.render(scene, camera);
}

// ============================================
// MAZE TRANSITION SCREEN
// ============================================
function openMazeTransition() {
    mazeTransitionActive = true;
    lockInput();

    // Set text (empty for now, user will add)
    if (mazeTransitionText) {
        mazeTransitionText.innerHTML = MAZE_TRANSITION_MESSAGE;
        mazeTransitionText.classList.add('done'); // no typewriter since text is empty
    }

    // Show the button as "Continue"
    if (mazeTransitionBtn) {
        mazeTransitionBtn.textContent = 'Continue \u25B8';
        mazeTransitionBtn.classList.add('continue');
    }

    // Show screen
    if (mazeTransitionScreen) {
        mazeTransitionScreen.classList.remove('hidden');
        mazeTransitionScreen.classList.add('visible');
    }
}

// ============================================
// COMING SOON POPUP (for maze computers)
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
// MAZE DOOR LOCKED POPUP
// ============================================
function openMazeDoorLocked() {
    mazeDoorLockedActive = true;
    if (mazeDoorLockedOverlay) mazeDoorLockedOverlay.classList.add('visible');
    lockInput();
}

function closeMazeDoorLocked() {
    if (!mazeDoorLockedActive) return;
    mazeDoorLockedActive = false;
    if (mazeDoorLockedOverlay) mazeDoorLockedOverlay.classList.remove('visible');
    unlockInput();
}


// ============================================
// OCCLUSION FADING (maze wall transparency)
// ============================================

/**
 * Ensures a mesh has its own cloned material so fading
 * doesn't bleed into other meshes sharing the same material.
 */
function _ensureUniqueMaterial(mesh) {
    if (!mesh._materialCloned) {
        if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(m => m.clone());
        } else {
            mesh.material = mesh.material.clone();
        }
        mesh._materialCloned = true;
    }
}

/**
 * Each frame (maze only): raycast from camera to player, fade occluding walls.
 */
function updateOcclusionFading(dt, playerPos) {
    // Direction from camera to player
    const camPos = camera.position.clone();
    const dir = new THREE.Vector3().subVectors(playerPos, camPos);
    const dist = dir.length();
    dir.normalize();

    occlusionRaycaster.set(camPos, dir);
    occlusionRaycaster.far = dist;

    // Find all maze meshes between camera and player
    const hits = occlusionRaycaster.intersectObjects(mazeMeshes, false);

    // Build a Set of currently-occluding meshes
    const occluding = new Set();
    for (const hit of hits) {
        // Don't fade the floor / ground — only walls (check if normal is mostly vertical)
        const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
        if (normal && Math.abs(normal.y) > 0.8) continue; // skip floor/ceiling-like surfaces

        occluding.add(hit.object);
    }

    const lerpFactor = 1 - Math.exp(-FADE_SPEED * dt);

    // --- Fade in occluding meshes ---
    for (const mesh of occluding) {
        if (!fadedMeshes.has(mesh)) {
            // First time fading this mesh — store original state
            _ensureUniqueMaterial(mesh);
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const originals = mats.map(m => ({
                opacity: m.opacity,
                transparent: m.transparent,
                depthWrite: m.depthWrite,
            }));
            fadedMeshes.set(mesh, originals);
        }

        // Lerp toward FADE_OPACITY
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
            m.transparent = true;
            m.depthWrite = false;
            m.opacity = THREE.MathUtils.lerp(m.opacity, FADE_OPACITY, lerpFactor);
        }
    }

    // --- Restore non-occluding meshes ---
    for (const [mesh, originals] of fadedMeshes) {
        if (occluding.has(mesh)) continue; // still blocking — skip

        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        let fullyRestored = true;

        for (let i = 0; i < mats.length; i++) {
            const m = mats[i];
            const orig = originals[i];
            m.opacity = THREE.MathUtils.lerp(m.opacity, orig.opacity, lerpFactor);

            // Snap to original once close enough
            if (Math.abs(m.opacity - orig.opacity) < 0.01) {
                m.opacity = orig.opacity;
                m.transparent = orig.transparent;
                m.depthWrite = orig.depthWrite;
            } else {
                fullyRestored = false;
            }
        }

        if (fullyRestored) {
            fadedMeshes.delete(mesh);
        }
    }
}

/**
 * Instantly restore all faded meshes (used when leaving the maze).
 */
function restoreAllFaded() {
    for (const [mesh, originals] of fadedMeshes) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (let i = 0; i < mats.length; i++) {
            const m = mats[i];
            const orig = originals[i];
            m.opacity = orig.opacity;
            m.transparent = orig.transparent;
            m.depthWrite = orig.depthWrite;
        }
    }
    fadedMeshes.clear();
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
