const X_VELOCITY = 200
const JUMP_POWER = 280
const GRAVITY = 480

class Player {
  constructor({ x, y, size, velocity = { x: 0, y: 0 } }) {
    this.x = x
    this.y = y
    this.width = size
    this.height = size
    this.velocity = velocity
    this.isOnGround = false
    // Image loading kept for compatibility but we draw procedurally
    this.isImageLoaded = true
    this.image = new Image()
    this.image.src = './images/player.png'
    this.elapsedTime = 0
    this.currentFrame = 0
    this.sprites = {
      idle: {
        x: 0,
        y: 0,
        width: 33,
        height: 32,
        frames: 4,
      },
      run: {
        x: 0,
        y: 32,
        width: 33,
        height: 32,
        frames: 6,
      },
      jump: {
        x: 0,
        y: 32 * 5,
        width: 33,
        height: 32,
        frames: 1,
      },
      fall: {
        x: 33,
        y: 32 * 5,
        width: 33,
        height: 32,
        frames: 1,
      },
      roll: {
        x: 0,
        y: 32 * 9,
        width: 33,
        height: 32,
        frames: 4,
      },
    }
    this.currentSprite = this.sprites.roll
    this.facing = 'right'
    this.hitbox = {
      x: 0,
      y: 0,
      width: 20,
      height: 22,
    }
    this.isInvincible = false
    this.isRolling = false
    this.isInAirAfterRolling = false
    this.jumpCount = 0

    // Slime animation state
    this._slimeTime = 0
    this._deltaTime = 0.016
    this._landSquash = 0
    this._wasOnGround = false
    this._groundFrames = 0
    this._rollAngle = 0
    this._smoothScaleX = 1
    this._smoothScaleY = 1
  }

  setIsInvincible() {
    this.isInvincible = true
    setTimeout(() => {
      this.isInvincible = false
    }, 1500)
  }

  draw(c) {
    // --- Procedural Slime Cube Drawing ---
    this._slimeTime += this._deltaTime

    // Determine target squash/stretch based on state
    let targetScaleX = 1
    let targetScaleY = 1
    const baseSize = this.width

    if (this.currentSprite === this.sprites.idle) {
      // Gentle breathing pulse
      const pulse = Math.sin(this._slimeTime * 2.5) * 0.03
      targetScaleX = 1 + pulse
      targetScaleY = 1 - pulse
    } else if (this.currentSprite === this.sprites.run) {
      // Subtle bouncing cycle
      const bounce = Math.sin(this._slimeTime * 10) * 0.05
      targetScaleX = 1 + bounce
      targetScaleY = 1 - bounce * 0.5
    } else if (this.currentSprite === this.sprites.jump) {
      // Stretched tall, compressed wide
      targetScaleX = 0.88
      targetScaleY = 1.12
    } else if (this.currentSprite === this.sprites.fall) {
      // Slight vertical stretch
      targetScaleX = 0.93
      targetScaleY = 1.07
    } else if (this.currentSprite === this.sprites.roll) {
      // Spin squish
      this._rollAngle += this._deltaTime * 15
      const squish = Math.sin(this._rollAngle * 4) * 0.08
      targetScaleX = 1 + squish
      targetScaleY = 1 - squish
    }

    // Landing squash effect — only trigger after being airborne for a few frames
    if (this.isOnGround) {
      this._groundFrames++
    } else {
      this._groundFrames = 0
    }

    if (this.isOnGround && !this._wasOnGround && this._groundFrames <= 1) {
      this._landSquash = 0.15
    }
    this._wasOnGround = this.isOnGround

    if (this._landSquash > 0) {
      targetScaleX += this._landSquash
      targetScaleY -= this._landSquash * 0.5
      this._landSquash *= 0.9
      if (this._landSquash < 0.005) this._landSquash = 0
    }

    // Smooth interpolation to prevent jitter
    const lerpSpeed = 12 * this._deltaTime
    this._smoothScaleX += (targetScaleX - this._smoothScaleX) * lerpSpeed
    this._smoothScaleY += (targetScaleY - this._smoothScaleY) * lerpSpeed

    // Round ALL draw coordinates to whole pixels — critical for pixelated canvas
    const drawW = Math.round(baseSize * this._smoothScaleX)
    const drawH = Math.round(baseSize * this._smoothScaleY)
    const roundedX = Math.round(this.x)
    const roundedY = Math.round(this.y)
    const drawX = Math.round(roundedX + (baseSize - drawW) / 2)
    const drawY = roundedY + baseSize - drawH  // bottom-anchored, stays integer since all parts are integers

    c.save()

    // Flip for facing direction
    let finalX = drawX
    let xFlip = 1
    if (this.facing === 'left') {
      xFlip = -1
      finalX = -drawX - drawW
    }
    c.scale(xFlip, 1)

    // Invincibility flash
    if (this.isInvincible) {
      c.globalAlpha = 0.4 + Math.sin(this._slimeTime * 20) * 0.3
    }

    // Roll rotation
    let rollRotation = 0
    if (this.isRolling) {
      rollRotation = this._rollAngle
    }

    if (rollRotation !== 0) {
      const cx = finalX + drawW / 2
      const cy = drawY + drawH / 2
      c.translate(cx, cy)
      c.rotate(rollRotation)
      c.translate(-cx, -cy)
    }

    // Outer glow
    c.shadowColor = 'rgba(0, 255, 200, 0.6)'
    c.shadowBlur = 10

    // Main slime body — rounded rectangle
    const cornerRadius = drawW * 0.2
    this._drawRoundedRect(c, finalX, drawY, drawW, drawH, cornerRadius)

    // Gradient fill — translucent neon
    const grad = c.createLinearGradient(finalX, drawY, finalX, drawY + drawH)
    grad.addColorStop(0, 'rgba(0, 255, 180, 0.85)')
    grad.addColorStop(0.5, 'rgba(0, 200, 160, 0.75)')
    grad.addColorStop(1, 'rgba(0, 140, 120, 0.9)')
    c.fillStyle = grad
    c.fill()

    // Inner highlight
    c.shadowBlur = 0
    const innerMargin = drawW * 0.15
    const innerH = drawH * 0.45
    this._drawRoundedRect(c, finalX + innerMargin, drawY + drawH * 0.1, drawW - innerMargin * 2, innerH, cornerRadius * 0.6)
    const highlightGrad = c.createLinearGradient(finalX, drawY, finalX, drawY + innerH)
    highlightGrad.addColorStop(0, 'rgba(180, 255, 240, 0.4)')
    highlightGrad.addColorStop(1, 'rgba(180, 255, 240, 0.0)')
    c.fillStyle = highlightGrad
    c.fill()

    // Eyes
    const eyeY = drawY + drawH * 0.4
    const eyeSpacing = drawW * 0.15
    const eyeSize = Math.max(2, drawW * 0.09)
    const eyeCenterX = finalX + drawW / 2

    // Left eye
    c.beginPath()
    c.arc(eyeCenterX - eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2)
    c.fillStyle = '#ffffff'
    c.shadowColor = 'rgba(255, 255, 255, 0.8)'
    c.shadowBlur = 4
    c.fill()

    // Right eye
    c.beginPath()
    c.arc(eyeCenterX + eyeSpacing, eyeY, eyeSize, 0, Math.PI * 2)
    c.fill()

    // Pupils (look toward movement direction)
    const pupilOffset = this.velocity.x !== 0 ? (this.velocity.x > 0 ? 1 : -1) * eyeSize * 0.3 : 0
    const pupilSize = eyeSize * 0.5
    c.shadowBlur = 0
    c.fillStyle = '#003322'

    c.beginPath()
    c.arc(eyeCenterX - eyeSpacing + pupilOffset, eyeY, pupilSize, 0, Math.PI * 2)
    c.fill()

    c.beginPath()
    c.arc(eyeCenterX + eyeSpacing + pupilOffset, eyeY, pupilSize, 0, Math.PI * 2)
    c.fill()

    // Mouth — small curve
    c.beginPath()
    const mouthY = drawY + drawH * 0.6
    c.moveTo(eyeCenterX - eyeSpacing * 0.5, mouthY)
    c.quadraticCurveTo(eyeCenterX, mouthY + drawH * 0.08, eyeCenterX + eyeSpacing * 0.5, mouthY)
    c.strokeStyle = 'rgba(0, 80, 60, 0.6)'
    c.lineWidth = 1
    c.stroke()

    c.restore()
  }

  _drawRoundedRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2)
    c.beginPath()
    c.moveTo(x + r, y)
    c.lineTo(x + w - r, y)
    c.quadraticCurveTo(x + w, y, x + w, y + r)
    c.lineTo(x + w, y + h - r)
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    c.lineTo(x + r, y + h)
    c.quadraticCurveTo(x, y + h, x, y + h - r)
    c.lineTo(x, y + r)
    c.quadraticCurveTo(x, y, x + r, y)
    c.closePath()
  }

  update(deltaTime, collisionBlocks) {
    if (!deltaTime) return

    // Store deltaTime for smooth draw animations
    this._deltaTime = deltaTime

    // Updating animation frames
    this.elapsedTime += deltaTime
    const secondsInterval = 0.1
    if (this.elapsedTime > secondsInterval) {
      this.currentFrame = (this.currentFrame + 1) % this.currentSprite.frames
      this.elapsedTime -= secondsInterval
    }

    if (this.isRolling && this.currentFrame === 3) {
      this.isRolling = false
    }

    // Update hitbox position — adjusted offsets for slime cube
    this.hitbox.x = this.x + 6
    this.hitbox.y = this.y + 8

    this.applyGravity(deltaTime)

    // Update horizontal position and check collisions
    this.updateHorizontalPosition(deltaTime)
    this.checkForHorizontalCollisions(collisionBlocks)

    // Check for any platform collisions
    this.checkPlatformCollisions(platforms, deltaTime)

    // Update vertical position and check collisions
    this.updateVerticalPosition(deltaTime)
    this.checkForVerticalCollisions(collisionBlocks)

    this.determineDirection()
    this.switchSprites()
  }

  roll() {
    if (this.isOnGround) {
      this.currentSprite = this.sprites.roll
      this.currentFrame = 0
      this.isRolling = true
      this.isInAirAfterRolling = true
      this._rollAngle = 0
      this.velocity.x = this.facing === 'right' ? 300 : -300
    }
  }

  determineDirection() {
    if (this.velocity.x > 0) {
      this.facing = 'right'
    } else if (this.velocity.x < 0) {
      this.facing = 'left'
    }
  }

  switchSprites() {
    if (this.isRolling) return

    if (
      this.isOnGround &&
      this.velocity.x === 0 &&
      this.currentSprite !== this.sprites.idle
    ) {
      // Idle
      this.currentFrame = 0
      this.currentSprite = this.sprites.idle
    } else if (
      this.isOnGround &&
      this.velocity.x !== 0 &&
      this.currentSprite !== this.sprites.run
    ) {
      // Run
      this.currentFrame = 0
      this.currentSprite = this.sprites.run
    } else if (
      !this.isOnGround &&
      this.velocity.y < 0 &&
      this.currentSprite !== this.sprites.jump
    ) {
      // Jump
      this.currentFrame = 0
      this.currentSprite = this.sprites.jump
    } else if (
      !this.isOnGround &&
      this.velocity.y > 0 &&
      this.currentSprite !== this.sprites.fall
    ) {
      // Fall
      this.currentFrame = 0
      this.currentSprite = this.sprites.fall
    }
  }

  jump() {
    if (this.jumpCount >= 2) return
    this.velocity.y = -JUMP_POWER
    this.isOnGround = false
    this.jumpCount++
  }

  updateHorizontalPosition(deltaTime) {
    this.x += this.velocity.x * deltaTime
    this.hitbox.x += this.velocity.x * deltaTime
  }

  updateVerticalPosition(deltaTime) {
    this.y += this.velocity.y * deltaTime
    this.hitbox.y += this.velocity.y * deltaTime
  }

  applyGravity(deltaTime) {
    this.velocity.y += GRAVITY * deltaTime
  }

  handleInput(keys) {
    if (this.isRolling || this.isInAirAfterRolling) return

    this.velocity.x = 0

    if (keys.d.pressed) {
      this.velocity.x = X_VELOCITY
    } else if (keys.a.pressed) {
      this.velocity.x = -X_VELOCITY
    }
  }

  stopRoll() {
    this.velocity.x = 0
    this.isRolling = false
    this.isInAirAfterRolling = false
  }

  checkForHorizontalCollisions(collisionBlocks) {
    const buffer = 0.0001
    for (let i = 0; i < collisionBlocks.length; i++) {
      const collisionBlock = collisionBlocks[i]

      // Check if a collision exists on all axes
      if (
        this.hitbox.x <= collisionBlock.x + collisionBlock.width &&
        this.hitbox.x + this.hitbox.width >= collisionBlock.x &&
        this.hitbox.y + this.hitbox.height >= collisionBlock.y &&
        this.hitbox.y <= collisionBlock.y + collisionBlock.height
      ) {
        // Check collision while player is going left
        if (this.velocity.x < -0) {
          this.hitbox.x = collisionBlock.x + collisionBlock.width + buffer
          this.x = this.hitbox.x - 6
          this.stopRoll()
          break
        }

        // Check collision while player is going right
        if (this.velocity.x > 0) {
          this.hitbox.x = collisionBlock.x - this.hitbox.width - buffer
          this.x = this.hitbox.x - 6
          this.stopRoll()
          break
        }
      }
    }
  }

  checkForVerticalCollisions(collisionBlocks) {
    const buffer = 0.0001
    for (let i = 0; i < collisionBlocks.length; i++) {
      const collisionBlock = collisionBlocks[i]

      // If a collision exists
      if (
        this.hitbox.x <= collisionBlock.x + collisionBlock.width &&
        this.hitbox.x + this.hitbox.width >= collisionBlock.x &&
        this.hitbox.y + this.hitbox.height >= collisionBlock.y &&
        this.hitbox.y <= collisionBlock.y + collisionBlock.height
      ) {
        // Check collision while player is going up
        if (this.velocity.y < 0) {
          this.velocity.y = 0
          this.hitbox.y = collisionBlock.y + collisionBlock.height + buffer
          this.y = this.hitbox.y - 8
          break
        }

        // Check collision while player is going down
        if (this.velocity.y > 0) {
          this.velocity.y = 0
          this.y = collisionBlock.y - this.height
          this.hitbox.y = collisionBlock.y - this.hitbox.height
          this.isOnGround = true
          this.jumpCount = 0

          if (!this.isRolling) this.isInAirAfterRolling = false
          break
        }
      }
    }
  }

  checkPlatformCollisions(platforms, deltaTime) {
    for (let platform of platforms) {
      if (platform.checkCollision(this, deltaTime)) {
        this.velocity.y = 0
        this.y = platform.y - this.height
        this.isOnGround = true
        this.jumpCount = 0
        return
      }
    }
    this.isOnGround = false
  }
}
