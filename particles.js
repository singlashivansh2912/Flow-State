/**
 * Particle System
 * Dust / leaf particles emitted when the blob moves.
 */

import * as THREE from 'three';

const MAX_PARTICLES    = 80;
const EMIT_RATE        = 12; // per second
const PARTICLE_LIFE    = 1.2;
const PARTICLE_SIZE    = 0.12;
const PARTICLE_COLOR   = 0xd4edda;

let particleSystem = null;
let particles      = [];
let emitAccum      = 0;

const _tmpVec = new THREE.Vector3();

export function createParticles(scene) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const sizes     = new Float32Array(MAX_PARTICLES);
    const opacities = new Float32Array(MAX_PARTICLES);

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('opacity',  new THREE.BufferAttribute(opacities, 1));

    const mat = new THREE.PointsMaterial({
        color: PARTICLE_COLOR,
        size: PARTICLE_SIZE,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    particleSystem = new THREE.Points(geo, mat);
    particleSystem.frustumCulled = false;
    scene.add(particleSystem);

    particles = [];
}

function _emitParticle(pos) {
    if (particles.length >= MAX_PARTICLES) {
        // Recycle oldest
        particles.shift();
    }
    particles.push({
        x: pos.x + (Math.random() - 0.5) * 0.4,
        y: pos.y - 0.2 + Math.random() * 0.1,
        z: pos.z + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.8,
        vy: Math.random() * 1.2 + 0.3,
        vz: (Math.random() - 0.5) * 0.8,
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE,
    });
}

export function updateParticles(dt, playerPos, playerSpeed) {
    if (!particleSystem) return;

    // Emit particles based on speed
    if (playerSpeed > 0.8) {
        emitAccum += EMIT_RATE * dt * Math.min(playerSpeed / 4, 1);
        while (emitAccum >= 1) {
            _emitParticle(playerPos);
            emitAccum -= 1;
        }
    } else {
        emitAccum = 0;
    }

    // Update existing particles
    const posAttr = particleSystem.geometry.getAttribute('position');

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
            particles.splice(i, 1);
            continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 0.8 * dt; // gentle gravity
    }

    // Write to buffer
    for (let i = 0; i < MAX_PARTICLES; i++) {
        if (i < particles.length) {
            const p = particles[i];
            posAttr.setXYZ(i, p.x, p.y, p.z);
        } else {
            posAttr.setXYZ(i, 0, -100, 0); // hide unused
        }
    }
    posAttr.needsUpdate = true;

    // Update global opacity based on particles alive
    const avgAlpha = particles.length > 0
        ? particles.reduce((s, p) => s + p.life / p.maxLife, 0) / particles.length
        : 0;
    particleSystem.material.opacity = avgAlpha * 0.5;
}
