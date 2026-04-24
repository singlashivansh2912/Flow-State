const canvas = document.querySelector('canvas')
const c = canvas.getContext('2d')
const dpr = 2

canvas.width = 1024 * dpr
canvas.height = 576 * dpr

const oceanLayerData = {
  l_New_Layer_1: l_New_Layer_1,
}

const brambleLayerData = {
  l_New_Layer_2: l_New_Layer_2,
}

const layersData = {
  l_New_Layer_8: l_New_Layer_8,
  l_Back_Tiles: l_Back_Tiles,
  l_Decorations: l_Decorations,
  l_Front_Tiles: l_Front_Tiles,
  l_Shrooms: l_Shrooms,
  l_Collisions: l_Collisions,
  l_Grass: l_Grass,
  l_Trees: l_Trees,
}

const tilesets = {
  l_New_Layer_1: { imageUrl: './images/decorations.png', tileSize: 16 },
  l_New_Layer_2: { imageUrl: './images/decorations.png', tileSize: 16 },
  l_New_Layer_8: { imageUrl: './images/tileset.png', tileSize: 16 },
  l_Back_Tiles: { imageUrl: './images/tileset.png', tileSize: 16 },
  l_Decorations: { imageUrl: './images/decorations.png', tileSize: 16 },
  l_Front_Tiles: { imageUrl: './images/tileset.png', tileSize: 16 },
  l_Shrooms: { imageUrl: './images/decorations.png', tileSize: 16 },
  l_Collisions: { imageUrl: './images/decorations.png', tileSize: 16 },
  l_Grass: { imageUrl: './images/tileset.png', tileSize: 16 },
  l_Trees: { imageUrl: './images/decorations.png', tileSize: 16 },
}

// Tile setup
const collisionBlocks = []
const platforms = []
const blockSize = 16 // Assuming each tile is 16x16 pixels

collisions.forEach((row, y) => {
  row.forEach((symbol, x) => {
    if (symbol === 1) {
      collisionBlocks.push(
        new CollisionBlock({
          x: x * blockSize,
          y: y * blockSize,
          size: blockSize,
        }),
      )
    } else if (symbol === 2) {
      platforms.push(
        new Platform({
          x: x * blockSize,
          y: y * blockSize + blockSize,
          width: 16,
          height: 4,
        }),
      )
    }
  })
})

const renderLayer = (tilesData, tilesetImage, tileSize, context) => {
  tilesData.forEach((row, y) => {
    row.forEach((symbol, x) => {
      if (symbol !== 0) {
        const srcX = ((symbol - 1) % (tilesetImage.width / tileSize)) * tileSize
        const srcY =
          Math.floor((symbol - 1) / (tilesetImage.width / tileSize)) * tileSize

        context.drawImage(
          tilesetImage, // source image
          srcX,
          srcY, // source x, y
          tileSize,
          tileSize, // source width, height
          x * 16,
          y * 16, // destination x, y
          16,
          16, // destination width, height
        )
      }
    })
  })
}

// Sci-fi color grading applied to pre-rendered tile canvases
const applySciFiTint = (offscreenCanvas, offscreenContext, intensity) => {
  const w = offscreenCanvas.width
  const h = offscreenCanvas.height

  // Darken base
  offscreenContext.globalCompositeOperation = 'multiply'
  offscreenContext.fillStyle = 'rgba(60, 50, 90, 1)'
  offscreenContext.fillRect(0, 0, w, h)

  // Add purple/blue color overlay
  offscreenContext.globalCompositeOperation = 'color'
  offscreenContext.fillStyle = `rgba(80, 40, 140, ${0.25 * intensity})`
  offscreenContext.fillRect(0, 0, w, h)

  // Cyan neon highlight pass
  offscreenContext.globalCompositeOperation = 'overlay'
  offscreenContext.fillStyle = `rgba(0, 220, 255, ${0.06 * intensity})`
  offscreenContext.fillRect(0, 0, w, h)

  // Brighten back slightly so it's not too dark
  offscreenContext.globalCompositeOperation = 'screen'
  offscreenContext.fillStyle = `rgba(30, 20, 50, ${0.3 * intensity})`
  offscreenContext.fillRect(0, 0, w, h)

  // Reset composite
  offscreenContext.globalCompositeOperation = 'source-over'
}

const renderStaticLayers = async (layersData) => {
  const offscreenCanvas = document.createElement('canvas')
  offscreenCanvas.width = canvas.width
  offscreenCanvas.height = canvas.height
  const offscreenContext = offscreenCanvas.getContext('2d')

  for (const [layerName, tilesData] of Object.entries(layersData)) {
    const tilesetInfo = tilesets[layerName]
    if (tilesetInfo) {
      try {
        const tilesetImage = await loadImage(tilesetInfo.imageUrl)
        renderLayer(
          tilesData,
          tilesetImage,
          tilesetInfo.tileSize,
          offscreenContext,
        )
      } catch (error) {
        console.error(`Failed to load image for layer ${layerName}:`, error)
      }
    }
  }

  // Apply sci-fi tint to the rendered tile layer
  applySciFiTint(offscreenCanvas, offscreenContext, 1.0)

  return offscreenCanvas
}
// END - Tile setup

// Change xy coordinates to move player's default position
let player = new Player({
  x: 100,
  y: 100,
  size: 32,
  velocity: { x: 0, y: 0 },
})

let oposums = []
let eagles = []
let sprites = []
let hearts = [
  new Heart({
    x: 10,
    y: 10,
    width: 21,
    height: 18,
    imageSrc: './images/hearts.png',
    spriteCropbox: {
      x: 0,
      y: 0,
      width: 21,
      height: 18,
      frames: 6,
    },
  }),
  new Heart({
    x: 33,
    y: 10,
    width: 21,
    height: 18,
    imageSrc: './images/hearts.png',
    spriteCropbox: {
      x: 0,
      y: 0,
      width: 21,
      height: 18,
      frames: 6,
    },
  }),
  new Heart({
    x: 56,
    y: 10,
    width: 21,
    height: 18,
    imageSrc: './images/hearts.png',
    spriteCropbox: {
      x: 0,
      y: 0,
      width: 21,
      height: 18,
      frames: 6,
    },
  }),
]

const keys = {
  w: {
    pressed: false,
  },
  a: {
    pressed: false,
  },
  d: {
    pressed: false,
  },
}

let lastTime = performance.now()
let camera = {
  x: 0,
  y: 0,
}

const SCROLL_POST_RIGHT = 330
const SCROLL_POST_TOP = 100
const SCROLL_POST_BOTTOM = 220
let oceanBackgroundCanvas = null
let brambleBackgroundCanvas = null
let gems = []
let gemUI = new Sprite({
  x: 13,
  y: 36,
  width: 15,
  height: 13,
  imageSrc: './images/gem.png',
  spriteCropbox: {
    x: 0,
    y: 0,
    width: 15,
    height: 13,
    frames: 5,
  },
})
let gemCount = 0

// Target score
const TARGET_GEMS = 40
let gameWon = false
let _winTime = 0

// Sci-fi ambient animation time
let _sciFiTime = 0

// Death / Game Over screen
let isDead = false
let _deathTime = 0

function init() {
  gems = []
  gemCount = 0
  gameWon = false
  _winTime = 0
  isDead = false
  _deathTime = 0
  gemUI = new Sprite({
    x: 13,
    y: 36,
    width: 15,
    height: 13,
    imageSrc: './images/gem.png',
    spriteCropbox: {
      x: 0,
      y: 0,
      width: 15,
      height: 13,
      frames: 5,
    },
  })

  l_Gems.forEach((row, y) => {
    row.forEach((symbol, x) => {
      if (symbol === 18) {
        gems.push(
          new Sprite({
            x: x * 16,
            y: y * 16,
            width: 15,
            height: 13,
            imageSrc: './images/gem.png',
            spriteCropbox: {
              x: 0,
              y: 0,
              width: 15,
              height: 13,
              frames: 5,
            },
            hitbox: {
              x: x * 16,
              y: y * 16,
              width: 15,
              height: 13,
            },
          }),
        )
      }
    })
  })

  player = new Player({
    x: 100,
    y: 100,
    size: 32,
    velocity: { x: 0, y: 0 },
  })
  eagles = [
    new Eagle({
      x: 816,
      y: 172,
      width: 40,
      height: 41,
    }),
  ]

  oposums = [
    new Oposum({
      x: 650,
      y: 100,
      width: 36,
      height: 28,
    }),
    new Oposum({
      x: 906,
      y: 515,
      width: 36,
      height: 28,
    }),
    new Oposum({
      x: 1150,
      y: 515,
      width: 36,
      height: 28,
    }),
    new Oposum({
      x: 1663,
      y: 200,
      width: 36,
      height: 28,
    }),
  ]

  sprites = []
  hearts = [
    new Heart({
      x: 10,
      y: 10,
      width: 21,
      height: 18,
      imageSrc: './images/hearts.png',
      spriteCropbox: {
        x: 0,
        y: 0,
        width: 21,
        height: 18,
        frames: 6,
      },
    }),
    new Heart({
      x: 33,
      y: 10,
      width: 21,
      height: 18,
      imageSrc: './images/hearts.png',
      spriteCropbox: {
        x: 0,
        y: 0,
        width: 21,
        height: 18,
        frames: 6,
      },
    }),
    new Heart({
      x: 56,
      y: 10,
      width: 21,
      height: 18,
      imageSrc: './images/hearts.png',
      spriteCropbox: {
        x: 0,
        y: 0,
        width: 21,
        height: 18,
        frames: 6,
      },
    }),
  ]

  camera = {
    x: 0,
    y: 0,
  }
}

function animate(backgroundCanvas) {
  // Calculate delta time
  const currentTime = performance.now()
  const deltaTime = (currentTime - lastTime) / 1000
  lastTime = currentTime

  _sciFiTime += deltaTime

  // Update player position
  player.handleInput(keys)
  player.update(deltaTime, collisionBlocks)

  // Update oposum position
  for (let i = oposums.length - 1; i >= 0; i--) {
    const oposum = oposums[i]
    oposum.update(deltaTime, collisionBlocks)

    // Jump on enemy
    const collisionDirection = checkCollisions(player, oposum)
    if (collisionDirection) {
      if (collisionDirection === 'bottom' && !player.isOnGround) {
        player.velocity.y = -200
        sprites.push(
          new Sprite({
            x: oposum.x,
            y: oposum.y,
            width: 32,
            height: 32,
            imageSrc: './images/enemy-death.png',
            spriteCropbox: {
              x: 0,
              y: 0,
              width: 40,
              height: 41,
              frames: 6,
            },
          }),
        )

        oposums.splice(i, 1)
      } else if (
        (collisionDirection === 'left' || collisionDirection === 'right') &&
        player.isOnGround &&
        player.isRolling
      ) {
        sprites.push(
          new Sprite({
            x: oposum.x,
            y: oposum.y,
            width: 32,
            height: 32,
            imageSrc: './images/enemy-death.png',
            spriteCropbox: {
              x: 0,
              y: 0,
              width: 40,
              height: 41,
              frames: 6,
            },
          }),
        )

        oposums.splice(i, 1)
      } else if (
        collisionDirection === 'left' ||
        collisionDirection === 'right'
      ) {
        const fullHearts = hearts.filter((heart) => {
          return !heart.depleted
        })

        if (!player.isInvincible && fullHearts.length > 0) {
          fullHearts[fullHearts.length - 1].depleted = true
        } else if (fullHearts.length === 0) {
          isDead = true
          _deathTime = 0
        }

        player.setIsInvincible()
      }
    }
  }

  // Update eagle position
  for (let i = eagles.length - 1; i >= 0; i--) {
    const eagle = eagles[i]
    eagle.update(deltaTime, collisionBlocks)

    // Jump on enemy
    const collisionDirection = checkCollisions(player, eagle)
    if (collisionDirection) {
      if (collisionDirection === 'bottom' && !player.isOnGround) {
        player.velocity.y = -200
        sprites.push(
          new Sprite({
            x: eagle.x,
            y: eagle.y,
            width: 32,
            height: 32,
            imageSrc: './images/enemy-death.png',
            spriteCropbox: {
              x: 0,
              y: 0,
              width: 40,
              height: 41,
              frames: 6,
            },
          }),
        )

        eagles.splice(i, 1)
      } else if (
        collisionDirection === 'left' ||
        collisionDirection === 'right' ||
        collisionDirection === 'top'
      ) {
        const fullHearts = hearts.filter((heart) => {
          return !heart.depleted
        })

        if (!player.isInvincible && fullHearts.length > 0) {
          fullHearts[fullHearts.length - 1].depleted = true
        } else if (fullHearts.length === 0) {
          init()
        }

        player.setIsInvincible()
      }
    }
  }

  for (let i = sprites.length - 1; i >= 0; i--) {
    const sprite = sprites[i]
    sprite.update(deltaTime)

    if (sprite.iteration === 1) {
      sprites.splice(i, 1)
    }
  }

  for (let i = gems.length - 1; i >= 0; i--) {
    const gem = gems[i]
    gem.update(deltaTime)

    // THIS IS WHERE WE ARE COLLECTING GEMS
    const collisionDirection = checkCollisions(player, gem)
    if (collisionDirection) {
      // create an item feedback animation
      sprites.push(
        new Sprite({
          x: gem.x - 8,
          y: gem.y - 8,
          width: 32,
          height: 32,
          imageSrc: './images/item-feedback.png',
          spriteCropbox: {
            x: 0,
            y: 0,
            width: 32,
            height: 32,
            frames: 5,
          },
        }),
      )

      // remove a gem from the game
      gems.splice(i, 1)
      gemCount++

      if (gemCount >= TARGET_GEMS) {
        gameWon = true
        _winTime = 0

        // Notify parent (main game) that this minigame was won
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'minigame-won', game: 'chair3' }, '*')
        }
      }
    }
  }

  // Track scroll post distance
  if (player.x > SCROLL_POST_RIGHT && player.x < 1680) {
    const scrollPostDistance = player.x - SCROLL_POST_RIGHT
    camera.x = scrollPostDistance
  }

  // Vertical camera tracking with dead zone to prevent jitter
  // Only move camera when player is clearly above or below thresholds
  const targetCamY = (() => {
    if (player.y < SCROLL_POST_TOP) {
      return SCROLL_POST_TOP - player.y
    } else if (player.y > SCROLL_POST_BOTTOM) {
      return -(player.y - SCROLL_POST_BOTTOM)
    }
    // Inside dead zone — smoothly lerp back to 0
    return 0
  })()

  // Smoothly interpolate camera Y to prevent sudden jumps
  camera.y += (targetCamY - camera.y) * 0.1

  // Snap camera to whole pixels to prevent sub-pixel jitter
  const camX = Math.round(camera.x)
  const camY = Math.round(camera.y)

  // Render scene
  c.save()
  c.scale(dpr + 1, dpr + 1)
  c.translate(-camX, camY)

  // Dark space background
  c.fillStyle = '#08081a'
  c.fillRect(camX, -camY, canvas.width, canvas.height)

  c.drawImage(oceanBackgroundCanvas, Math.round(camX * 0.32), 0)
  c.drawImage(brambleBackgroundCanvas, Math.round(camX * 0.16), 0)
  c.drawImage(backgroundCanvas, 0, 0)
  player.draw(c)

  for (let i = oposums.length - 1; i >= 0; i--) {
    const oposum = oposums[i]
    oposum.draw(c)
  }

  for (let i = eagles.length - 1; i >= 0; i--) {
    const eagle = eagles[i]
    eagle.draw(c)
  }

  for (let i = sprites.length - 1; i >= 0; i--) {
    const sprite = sprites[i]
    sprite.draw(c)
  }

  for (let i = gems.length - 1; i >= 0; i--) {
    const gem = gems[i]
    gem.draw(c)
  }

  c.restore()

  // UI save and restore
  c.save()
  c.scale(dpr + 1, dpr + 1)
  for (let i = hearts.length - 1; i >= 0; i--) {
    const heart = hearts[i]
    heart.draw(c)
  }

  gemUI.draw(c)

  // Sci-fi styled gem counter with target
  c.font = '10px monospace'
  c.fillStyle = '#00ffd5'
  c.shadowColor = 'rgba(0, 255, 213, 0.7)'
  c.shadowBlur = 6
  c.fillText(`${gemCount}/${TARGET_GEMS}`, 33, 46)
  c.shadowBlur = 0
  c.restore()

  // Victory screen overlay
  if (gameWon) {
    _winTime += deltaTime
    const fadeAlpha = Math.min(_winTime * 0.8, 0.85)

    c.save()
    c.scale(dpr + 1, dpr + 1)

    // Dark overlay
    c.fillStyle = `rgba(8, 8, 26, ${fadeAlpha})`
    c.fillRect(0, 0, 1024, 576)

    if (_winTime > 0.5) {
      const textAlpha = Math.min((_winTime - 0.5) * 2, 1)

      // Victory title
      c.globalAlpha = textAlpha
      c.textAlign = 'center'

      c.font = 'bold 32px monospace'
      c.fillStyle = '#00ffd5'
      c.shadowColor = 'rgba(0, 255, 213, 0.9)'
      c.shadowBlur = 20
      c.fillText('MISSION COMPLETE', 512 / 2, 250 / 2)

      // Subtitle
      c.font = '14px monospace'
      c.shadowBlur = 10
      c.fillText(`${TARGET_GEMS} GEMS COLLECTED`, 512 / 2, 280 / 2)

      // Pulsing restart prompt
      if (_winTime > 2) {
        const pulseAlpha = 0.5 + Math.sin(_winTime * 3) * 0.5
        c.globalAlpha = pulseAlpha
        c.font = '11px monospace'
        c.fillStyle = '#ffffff'
        c.shadowColor = 'rgba(255, 255, 255, 0.6)'
        c.shadowBlur = 8
        c.fillText('PRESS R TO RESTART', 512 / 2, 320 / 2)
      }

      c.textAlign = 'start'
    }

    c.restore()
  }

  // Death / Game Over screen overlay
  if (isDead) {
    _deathTime += deltaTime
    const fadeAlpha = Math.min(_deathTime * 1.2, 0.88)

    c.save()
    c.scale(dpr + 1, dpr + 1)

    // Dark red overlay
    c.fillStyle = `rgba(15, 2, 2, ${fadeAlpha})`
    c.fillRect(0, 0, 1024, 576)

    if (_deathTime > 0.4) {
      const textAlpha = Math.min((_deathTime - 0.4) * 2, 1)
      c.globalAlpha = textAlpha
      c.textAlign = 'center'

      // Glitch-style GAME OVER
      c.font = 'bold 36px monospace'
      c.fillStyle = '#ff3050'
      c.shadowColor = 'rgba(255, 48, 80, 0.9)'
      c.shadowBlur = 25
      c.fillText('GAME OVER', 512 / 2, 230 / 2)

      // Score
      c.font = '13px monospace'
      c.fillStyle = '#ff8090'
      c.shadowBlur = 8
      c.fillText(`GEMS COLLECTED: ${gemCount} / ${TARGET_GEMS}`, 512 / 2, 270 / 2)

      // Restart prompt
      if (_deathTime > 1.5) {
        const pulseAlpha = 0.4 + Math.sin(_deathTime * 3) * 0.4
        c.globalAlpha = pulseAlpha
        c.font = '11px monospace'
        c.fillStyle = '#ffffff'
        c.shadowColor = 'rgba(255, 255, 255, 0.5)'
        c.shadowBlur = 6
        c.fillText('PRESS R TO RETRY', 512 / 2, 315 / 2)

        // Touch hint
        const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0
        if (isMobile) {
          c.fillText('OR TAP TO RETRY', 512 / 2, 338 / 2)
        }
      }

      c.textAlign = 'start'
    }

    c.restore()
  }

  requestAnimationFrame(() => animate(backgroundCanvas))
}

const startRendering = async () => {
  try {
    oceanBackgroundCanvas = await renderStaticLayers(oceanLayerData)
    brambleBackgroundCanvas = await renderStaticLayers(brambleLayerData)
    const backgroundCanvas = await renderStaticLayers(layersData)
    if (!backgroundCanvas) {
      console.error('Failed to create the background canvas')
      return
    }

    animate(backgroundCanvas)
  } catch (error) {
    console.error('Error during rendering:', error)
  }
}

init()
startRendering()
