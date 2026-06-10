/**
 * sprites.js — Canvas drawing functions for every AWS service character.
 *
 * Design rules:
 *   - All functions accept (ctx, cx, cy, t) where cx/cy is the hex centre and t is
 *     performance.now() in milliseconds.
 *   - Max sprite radius: ~20px from centre (fits inside HEX_R = 32).
 *   - Idle animation ALWAYS driven by Math.sin(t * speed) — no external state.
 *   - ctx.save() / ctx.restore() wraps every function.
 */

// ─── Animation helpers ────────────────────────────────────────────────────────

/** Smooth 0→1→0 oscillation at given speed (cycles/ms).  ~0.003 = 1 cycle/s */
const osc  = (t, s = 0.003) => (Math.sin(t * s) + 1) / 2
/** -1 → +1 oscillation */
const wave = (t, s = 0.003) => Math.sin(t * s)
/** Bounce (always positive sine) */
const bnce = (t, s = 0.005) => Math.abs(Math.sin(t * s))

// ─── Dispatch table ───────────────────────────────────────────────────────────

export const SPRITE_FNS = {
  igw:         drawIGW,
  cf:          drawCF,
  alb:         drawALB,
  ec2:         drawEC2,
  ecs:         drawECS,
  nat:         drawNAT,
  lambda:      drawLambda,
  rds:         drawRDS,
  dynamo:      drawDynamo,
  s3:          drawS3,
  sqs:         drawSQS,
  iam:         drawIAM,
  sg:          drawSG,
  rt:          drawRT,
  route53:     drawRoute53,
  apigw:       drawAPIGW,
  sns:         drawSNS,
  elasticache: drawElastiCache,
  eventbridge: drawEventBridge,
  waf:         drawWAF,
  cognito:     drawCognito,
  cloudwatch:  drawCloudWatch,
  vpc_endpoint:drawVPCEndpoint,
}

export function drawSprite(ctx, cx, cy, serviceId, t) {
  const fn = SPRITE_FNS[serviceId]
  if (fn) fn(ctx, cx, cy, t)
}

// ─── Internet Gateway — "The Iron Gate" ──────────────────────────────────────
function drawIGW(ctx, cx, cy, t) {
  ctx.save()
  const glow = osc(t, 0.004)

  // Two pillars
  ctx.fillStyle = '#6a8c50'
  ctx.fillRect(cx - 14, cy - 16, 5, 26)
  ctx.fillRect(cx +  9, cy - 16, 5, 26)

  // Arch
  ctx.strokeStyle = '#8ab870'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy - 10, 12, Math.PI, 0)
  ctx.stroke()

  // Portal glow between pillars
  ctx.fillStyle = `rgba(120,220,100,${0.12 + glow * 0.2})`
  ctx.fillRect(cx - 9, cy - 10, 18, 20)

  // Top cap stones
  ctx.fillStyle = '#8ab870'
  ctx.fillRect(cx - 16, cy - 20, 9, 4)
  ctx.fillRect(cx +  7, cy - 20, 9, 4)

  ctx.restore()
}

// ─── CloudFront — "Far Watcher" ───────────────────────────────────────────────
function drawCF(ctx, cx, cy, t) {
  ctx.save()
  const rot = t * 0.0008  // slow rotation

  // Iris (central eye)
  ctx.fillStyle = '#1a3a5a'
  ctx.strokeStyle = '#4a9acc'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(cx, cy, 10, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Pupil
  const pupilR = 4 + osc(t, 0.005) * 1.5
  ctx.fillStyle = '#a0d8f0'
  ctx.beginPath()
  ctx.arc(cx, cy, pupilR, 0, Math.PI * 2)
  ctx.fill()

  // Radiating vision rays (rotate slowly)
  ctx.strokeStyle = 'rgba(80,180,220,0.45)'
  ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    const a = rot + (Math.PI / 3) * i
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 8)
    ctx.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 15)
    ctx.stroke()
  }

  ctx.restore()
}

// ─── Load Balancer — "Siege Shield" ──────────────────────────────────────────
function drawALB(ctx, cx, cy, t) {
  ctx.save()
  const bob = wave(t, 0.003) * 1.5

  ctx.translate(cx, cy + bob)

  // Shield outline
  ctx.fillStyle = '#2a4a7a'
  ctx.strokeStyle = '#6a9acc'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, -18)
  ctx.lineTo(14, -8)
  ctx.lineTo(14,  8)
  ctx.lineTo(0,  20)
  ctx.lineTo(-14, 8)
  ctx.lineTo(-14,-8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Cross emblem
  ctx.strokeStyle = '#8ac0ee'
  ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0,  13); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-8,  1); ctx.lineTo(8,   1); ctx.stroke()

  ctx.restore()
}

// ─── EC2 — "Iron Knight" ─────────────────────────────────────────────────────
function drawEC2(ctx, cx, cy, t) {
  ctx.save()
  const breath = wave(t, 0.002) * 1  // slow breathing

  // Helmet
  ctx.fillStyle = '#7a8a98'
  ctx.beginPath()
  ctx.arc(cx, cy - 11 + breath, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#5a6a78'
  ctx.fillRect(cx - 5, cy - 13 + breath, 10, 5)  // visor slot

  // Body armour
  ctx.fillStyle = '#6a7a88'
  ctx.fillRect(cx - 9, cy - 3 + breath, 18, 13)

  // Shoulder pads
  ctx.fillStyle = '#8a9aa8'
  ctx.fillRect(cx - 12, cy - 4 + breath, 5, 6)
  ctx.fillRect(cx +  7, cy - 4 + breath, 5, 6)

  // Legs
  ctx.fillStyle = '#5a6a78'
  ctx.fillRect(cx - 7, cy + 10, 5, 9)
  ctx.fillRect(cx + 2, cy + 10, 5, 9)

  // Sword
  ctx.strokeStyle = '#c8d8e8'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(cx + 13, cy - 14)
  ctx.lineTo(cx + 13, cy + 8)
  ctx.stroke()
  ctx.fillStyle = '#aa8040'
  ctx.fillRect(cx + 9, cy - 2, 8, 3)  // cross-guard

  ctx.restore()
}

// ─── ECS — "The Barracks" ─────────────────────────────────────────────────────
function drawECS(ctx, cx, cy, t) {
  ctx.save()

  // Building base
  ctx.fillStyle = '#3a3020'
  ctx.fillRect(cx - 16, cy - 6, 32, 16)
  ctx.fillStyle = '#504030'
  ctx.fillRect(cx - 14, cy - 8, 28, 4)  // roof ledge

  // Tent / pitched roof
  ctx.fillStyle = '#6a5030'
  ctx.beginPath()
  ctx.moveTo(cx, cy - 20)
  ctx.lineTo(cx + 18, cy - 8)
  ctx.lineTo(cx - 18, cy - 8)
  ctx.closePath()
  ctx.fill()

  // Three tiny soldiers marching
  const march = Math.floor(t * 0.006) % 2
  for (let i = 0; i < 3; i++) {
    const sx = cx - 8 + i * 8
    const legOff = (i % 2 === march ? 1 : -1) * 2
    ctx.fillStyle = '#8a9060'
    ctx.beginPath(); ctx.arc(sx, cy - 1, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillRect(sx - 2, cy + 2, 2, 5 + legOff)
    ctx.fillRect(sx,     cy + 2, 2, 5 - legOff)
  }

  ctx.restore()
}

// ─── NAT Gateway — "Secret Tunnel" ────────────────────────────────────────────
function drawNAT(ctx, cx, cy, t) {
  ctx.save()
  const spin = t * 0.0015

  // Outer ring
  ctx.strokeStyle = '#4a6a9a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 16, 0, Math.PI * 2)
  ctx.stroke()

  // Spinning inner rings
  for (let i = 0; i < 3; i++) {
    const a = spin + (Math.PI * 2 / 3) * i
    const rx = Math.cos(a) * 7
    const ry = Math.sin(a) * 4
    ctx.strokeStyle = `rgba(80,140,200,${0.3 + i * 0.2})`
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.ellipse(cx + rx * 0.3, cy + ry * 0.3, 9, 5, a, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Dark tunnel core
  ctx.fillStyle = '#050810'
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI * 2)
  ctx.fill()

  // Arrow suggesting outbound flow
  ctx.strokeStyle = 'rgba(100,180,255,0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx - 4, cy)
  ctx.lineTo(cx + 4, cy)
  ctx.moveTo(cx + 2, cy - 2)
  ctx.lineTo(cx + 4, cy)
  ctx.lineTo(cx + 2, cy + 2)
  ctx.stroke()

  ctx.restore()
}

// ─── Lambda — "Shadow Ninja" ──────────────────────────────────────────────────
function drawLambda(ctx, cx, cy, t) {
  ctx.save()

  // Ninja flickers in and out of existence
  const flicker = 0.45 + osc(t, 0.011) * 0.55
  ctx.globalAlpha = flicker

  // Cloak / body
  ctx.fillStyle = '#1a1a2e'
  ctx.beginPath()
  ctx.moveTo(cx, cy - 16)
  ctx.lineTo(cx + 11, cy + 13)
  ctx.lineTo(cx - 11, cy + 13)
  ctx.closePath()
  ctx.fill()

  // Hood
  ctx.fillStyle = '#2a2a4a'
  ctx.beginPath()
  ctx.arc(cx, cy - 12, 7, 0, Math.PI * 2)
  ctx.fill()

  // Glowing eyes
  const eyeGlow = osc(t, 0.013)
  ctx.fillStyle = `rgba(80,200,255,${0.6 + eyeGlow * 0.4})`
  ctx.beginPath(); ctx.arc(cx - 3, cy - 13, 1.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 3, cy - 13, 1.5, 0, Math.PI * 2); ctx.fill()

  // Throwing star (visible on high-alpha frames)
  if (flicker > 0.85) {
    const sa = t * 0.01
    ctx.save()
    ctx.translate(cx + 14, cy - 8)
    ctx.rotate(sa)
    ctx.fillStyle = '#c0c8d0'
    for (let i = 0; i < 4; i++) {
      ctx.save()
      ctx.rotate((Math.PI / 2) * i)
      ctx.fillRect(-1, -6, 2, 12)
      ctx.restore()
    }
    ctx.restore()
  }

  ctx.restore()
}

// ─── RDS — "Great Library" ────────────────────────────────────────────────────
function drawRDS(ctx, cx, cy, t) {
  ctx.save()

  // Stone building body
  ctx.fillStyle = '#2a2818'
  ctx.fillRect(cx - 14, cy - 4, 28, 16)

  // Columns
  ctx.fillStyle = '#4a4830'
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(cx - 13 + i * 8, cy - 18, 4, 22)
  }

  // Pediment (triangular roof)
  ctx.fillStyle = '#3a3820'
  ctx.beginPath()
  ctx.moveTo(cx, cy - 24)
  ctx.lineTo(cx + 18, cy - 14)
  ctx.lineTo(cx - 18, cy - 14)
  ctx.closePath()
  ctx.fill()

  // Glowing windows
  const warmGlow = 0.5 + osc(t, 0.003) * 0.5
  ctx.fillStyle = `rgba(255,200,80,${warmGlow * 0.7})`
  ctx.fillRect(cx - 10, cy - 1, 6, 7)
  ctx.fillRect(cx +  4, cy - 1, 6, 7)

  // Door
  ctx.fillStyle = '#1a1808'
  ctx.beginPath()
  ctx.arc(cx, cy + 12, 5, Math.PI, 0)
  ctx.fillRect(cx - 5, cy + 7, 10, 5)
  ctx.fill()

  ctx.restore()
}

// ─── DynamoDB — "Ancient Ruins" ───────────────────────────────────────────────
function drawDynamo(ctx, cx, cy, t) {
  ctx.save()

  // Broken columns
  const offsets = [[-12, 0, 20], [0, -4, 16], [10, 0, 18]]
  for (const [ox, oy, h] of offsets) {
    ctx.fillStyle = '#3a3428'
    ctx.fillRect(cx + ox - 3, cy + oy - h + 14, 7, h)
    // Crumbled top
    ctx.fillStyle = '#5a5040'
    ctx.fillRect(cx + ox - 4, cy + oy - h + 12, 9, 4)
  }

  // Floating rune particles
  for (let i = 0; i < 5; i++) {
    const seed = i * 1.7
    const px = cx + Math.sin(t * 0.0009 + seed) * 14
    const py = cy - 5 - bnce(t * 0.0007 + seed * 1.3) * 14
    const alpha = osc(t * 0.0008 + seed * 0.5)
    ctx.fillStyle = `rgba(180,100,255,${alpha * 0.7})`
    ctx.fillRect(px - 1, py - 1, 3, 3)
  }

  ctx.restore()
}

// ─── S3 — "Endless Vault" ─────────────────────────────────────────────────────
function drawS3(ctx, cx, cy, t) {
  ctx.save()
  const glow = osc(t, 0.004)

  // Vault body
  ctx.fillStyle = '#3a2a10'
  ctx.strokeStyle = '#aa7820'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(cx - 14, cy - 10, 28, 22, 3)
  ctx.fill()
  ctx.stroke()

  // Vault door circle
  ctx.fillStyle = '#201808'
  ctx.strokeStyle = `rgba(200,160,60,${0.5 + glow * 0.5})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy + 1, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Spoke handles on door
  ctx.strokeStyle = `rgba(180,140,50,${0.6 + glow * 0.4})`
  ctx.lineWidth = 1.5
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * 3, cy + 1 + Math.sin(a) * 3)
    ctx.lineTo(cx + Math.cos(a) * 9, cy + 1 + Math.sin(a) * 9)
    ctx.stroke()
  }

  // Lock symbol
  ctx.fillStyle = `rgba(220,180,80,${0.4 + glow * 0.6})`
  ctx.beginPath()
  ctx.arc(cx, cy + 1, 3, 0, Math.PI * 2)
  ctx.fill()

  // Lid / overhang
  ctx.fillStyle = '#504020'
  ctx.fillRect(cx - 16, cy - 14, 32, 6)

  ctx.restore()
}

// ─── SQS — "Raven Queue" ──────────────────────────────────────────────────────
function drawSQS(ctx, cx, cy, t) {
  ctx.save()

  // Draw 3 ravens in a row, each slightly staggered
  for (let i = 0; i < 3; i++) {
    const rx = cx - 10 + i * 10
    const ry = cy + 4
    const wingFlapOffset = (i % 2 === 0 ? 1 : -1)
    const wingAngle = wave(t * 0.008 + i * 1.5) * 5 * wingFlapOffset

    ctx.save()
    ctx.translate(rx, ry)

    // Body
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath()
    ctx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2)
    ctx.fill()

    // Head
    ctx.beginPath()
    ctx.arc(-4, -3, 3, 0, Math.PI * 2)
    ctx.fill()

    // Beak
    ctx.fillStyle = '#606060'
    ctx.beginPath()
    ctx.moveTo(-7, -3)
    ctx.lineTo(-11, -2)
    ctx.lineTo(-7,  -1)
    ctx.closePath()
    ctx.fill()

    // Wings
    ctx.fillStyle = '#2a2a2a'
    ctx.save()
    ctx.rotate((wingAngle * Math.PI) / 180)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(8, -7)
    ctx.lineTo(6, 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.scale(-1, 1)
    ctx.rotate((wingAngle * Math.PI) / 180)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(8, -7)
    ctx.lineTo(6, 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.restore()
  }

  // Queue line connecting them
  ctx.strokeStyle = 'rgba(80,80,80,0.5)'
  ctx.lineWidth = 0.8
  ctx.setLineDash([2, 3])
  ctx.beginPath()
  ctx.moveTo(cx - 10, cy + 6)
  ctx.lineTo(cx + 10, cy + 6)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.restore()
}

// ─── IAM — "Royal Decree" ─────────────────────────────────────────────────────
function drawIAM(ctx, cx, cy, t) {
  ctx.save()
  const float = wave(t, 0.003) * 2.5

  ctx.translate(cx, cy + float)

  // Scroll body
  ctx.fillStyle = '#c8b870'
  ctx.fillRect(-10, -12, 20, 24)

  // Rolled ends
  ctx.fillStyle = '#b0a058'
  ctx.beginPath(); ctx.ellipse(0, -12, 10, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(0,  12, 10, 4, 0, 0, Math.PI * 2); ctx.fill()

  // Text lines on scroll
  ctx.fillStyle = '#604010'
  ctx.fillRect(-6, -7, 12, 1.5)
  ctx.fillRect(-6, -3, 12, 1.5)
  ctx.fillRect(-6,  1, 12, 1.5)
  ctx.fillRect(-4,  5,  8, 1.5)

  // Wax seal
  const sealGlow = osc(t, 0.005)
  ctx.fillStyle = `rgba(160,30,30,${0.7 + sealGlow * 0.3})`
  ctx.beginPath()
  ctx.arc(4, 8, 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ─── Security Group — "Permission Scroll" ─────────────────────────────────────
function drawSG(ctx, cx, cy, t) {
  ctx.save()
  const pulse = osc(t, 0.004)
  ctx.translate(cx, cy)

  // Shield shape
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(12, -8)
  ctx.lineTo(12, 2)
  ctx.bezierCurveTo(12, 10, 6, 16, 0, 18)
  ctx.bezierCurveTo(-6, 16, -12, 10, -12, 2)
  ctx.lineTo(-12, -8)
  ctx.closePath()
  ctx.fillStyle = `rgba(60,120,200,${0.4 + pulse * 0.2})`
  ctx.fill()
  ctx.strokeStyle = `rgba(100,160,255,${0.6 + pulse * 0.3})`
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = `rgba(160,210,255,${0.7 + pulse * 0.3})`
  ctx.font = 'bold 8px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('SG', 0, 2)

  ctx.restore()
}

// ─── Route Table — "Road Map" ──────────────────────────────────────────────────
function drawRT(ctx, cx, cy, t) {
  ctx.save()
  const float = wave(t, 0.0025) * 2
  ctx.translate(cx, cy + float)

  ctx.fillStyle = '#c8a860'
  ctx.beginPath()
  ctx.roundRect(-12, -12, 24, 24, 2)
  ctx.fill()
  ctx.strokeStyle = '#907840'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.strokeStyle = '#604820'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-8, 0); ctx.lineTo(8, 0)
  ctx.moveTo(0, -8); ctx.lineTo(0, 8)
  ctx.stroke()

  ctx.fillStyle = '#604820'
  ctx.beginPath()
  ctx.moveTo(8, 0); ctx.lineTo(5, -2); ctx.lineTo(5, 2)
  ctx.closePath(); ctx.fill()

  ctx.restore()
}

// ─── Route53 — "The Cartographer" ─────────────────────────────────────────────
function drawRoute53(ctx, cx, cy, t) {
  ctx.save()
  const spin = (t * 0.0004) % (Math.PI * 2)
  const pulse = osc(t, 0.003)
  ctx.translate(cx, cy)

  ctx.strokeStyle = `rgba(100,180,255,${0.6 + pulse * 0.3})`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(0, 0, 13, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(80,150,220,0.4)'
  ctx.lineWidth = 0.8
  for (const dy of [-5, 0, 5]) {
    const r = Math.sqrt(Math.max(0, 169 - dy * dy))
    ctx.beginPath(); ctx.ellipse(0, dy, r, r * 0.35, 0, 0, Math.PI * 2); ctx.stroke()
  }

  ctx.save()
  ctx.rotate(spin)
  ctx.strokeStyle = `rgba(100,180,255,0.5)`
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.ellipse(0, 0, 5, 13, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()

  ctx.fillStyle = `rgba(160,210,255,${0.8 + pulse * 0.2})`
  ctx.font = 'bold 7px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('53', 0, 0)

  ctx.restore()
}

// ─── API Gateway — "The Drawbridge" ───────────────────────────────────────────
function drawAPIGW(ctx, cx, cy, t) {
  ctx.save()
  const lift = osc(t, 0.002) * 5
  ctx.translate(cx, cy)

  ctx.fillStyle = '#7a9060'
  ctx.fillRect(-14, -14, 6, 28)
  ctx.fillRect(8, -14, 6, 28)

  ctx.save()
  ctx.translate(-4, -2)
  ctx.rotate(-lift * 0.08)
  ctx.fillStyle = '#b09060'
  ctx.fillRect(0, 0, 8, 12)
  ctx.strokeStyle = '#907840'
  ctx.lineWidth = 1
  for (let i = 2; i < 12; i += 3) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(8, i); ctx.stroke()
  }
  ctx.restore()

  ctx.strokeStyle = '#c0a060'
  ctx.lineWidth = 1.5
  ctx.setLineDash([2, 2])
  ctx.beginPath()
  ctx.moveTo(-8, -6); ctx.lineTo(-4, 2 - lift)
  ctx.moveTo(8, -6); ctx.lineTo(4, 2 - lift)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.restore()
}

// ─── SNS — "The Herald" ───────────────────────────────────────────────────────
function drawSNS(ctx, cx, cy, t) {
  ctx.save()
  ctx.translate(cx, cy)

  ctx.beginPath()
  ctx.moveTo(-4, -4)
  ctx.lineTo(-4, 4)
  ctx.lineTo(10, 10)
  ctx.lineTo(10, -10)
  ctx.closePath()
  ctx.fillStyle = '#e09040'
  ctx.fill()
  ctx.strokeStyle = '#c07020'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#c07020'
  ctx.fillRect(-10, -3, 7, 6)

  const ringPulse = (t * 0.003) % 1
  for (let i = 0; i < 3; i++) {
    const phase = (ringPulse + i / 3) % 1
    const r = 4 + phase * 12
    const alpha = (1 - phase) * 0.5
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.strokeStyle = '#f0b060'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(12, 0, r, -Math.PI * 0.5, Math.PI * 0.5)
    ctx.stroke()
    ctx.restore()
  }

  ctx.restore()
}

// ─── ElastiCache — "Crystal Orb" ─────────────────────────────────────────────
function drawElastiCache(ctx, cx, cy, t) {
  ctx.save()
  const glow = osc(t, 0.004)
  const spin = (t * 0.0005) % (Math.PI * 2)
  ctx.translate(cx, cy)

  ctx.fillStyle = '#405080'
  ctx.beginPath()
  ctx.ellipse(0, 10, 8, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(-4, 6, 8, 5)

  const grad = ctx.createRadialGradient(-3, -5, 1, 0, 0, 12)
  grad.addColorStop(0, `rgba(180,220,255,${0.6 + glow * 0.4})`)
  grad.addColorStop(0.5, `rgba(80,140,220,${0.4 + glow * 0.2})`)
  grad.addColorStop(1, 'rgba(40,80,160,0.2)')
  ctx.beginPath()
  ctx.arc(0, 0, 12, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = `rgba(140,200,255,${0.5 + glow * 0.4})`
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.save()
  ctx.rotate(spin)
  ctx.strokeStyle = `rgba(200,230,255,${0.3 + glow * 0.2})`
  ctx.lineWidth = 0.8
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()

  ctx.restore()
}

// ─── EventBridge — "Prophecy Engine" ─────────────────────────────────────────
function drawEventBridge(ctx, cx, cy, t) {
  ctx.save()
  const pulse = osc(t, 0.005)
  ctx.translate(cx, cy)

  ctx.fillStyle = '#302060'
  ctx.beginPath()
  ctx.ellipse(0, 12, 10, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.arc(0, 0, 11, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(80,40,120,0.7)'
  ctx.fill()
  ctx.strokeStyle = `rgba(160,100,220,${0.6 + pulse * 0.4})`
  ctx.lineWidth = 1.5
  ctx.stroke()

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + t * 0.002
    const r = 6 + pulse * 2
    ctx.fillStyle = `rgba(200,150,255,${0.4 + pulse * 0.4})`
    ctx.beginPath()
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = `rgba(220,180,255,${0.7 + pulse * 0.3})`
  ctx.beginPath(); ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(60,20,100,1)'
  ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill()

  ctx.restore()
}

// ─── WAF — "The Ward" ─────────────────────────────────────────────────────────
function drawWAF(ctx, cx, cy, t) {
  ctx.save()
  const ripple = (t * 0.004) % (Math.PI * 2)
  ctx.translate(cx, cy)

  for (let i = 2; i >= 0; i--) {
    const r = 8 + i * 3
    const phase = (ripple + i * 1.0) % (Math.PI * 2)
    const alpha = 0.15 + 0.1 * Math.sin(phase)
    ctx.strokeStyle = `rgba(255,160,60,${alpha})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
  }

  ctx.strokeStyle = '#e09040'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    const x = Math.cos(a) * 10, y = Math.sin(a) * 10
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath(); ctx.stroke()

  ctx.strokeStyle = `rgba(255,80,40,${0.7 + osc(t, 0.006) * 0.3})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-4, -4); ctx.lineTo(4, 4)
  ctx.moveTo(4, -4); ctx.lineTo(-4, 4)
  ctx.stroke()

  ctx.restore()
}

// ─── Cognito — "The Gatekeeper" ───────────────────────────────────────────────
function drawCognito(ctx, cx, cy, t) {
  ctx.save()
  const float = wave(t, 0.003) * 2
  ctx.translate(cx, cy + float)

  ctx.fillStyle = '#486078'
  ctx.fillRect(-8, -4, 16, 16)
  for (let x = -8; x < 8; x += 4) {
    ctx.fillRect(x, -8, 3, 5)
  }
  ctx.fillStyle = '#1a2a38'
  ctx.beginPath()
  ctx.arc(0, 8, 5, Math.PI, 0)
  ctx.lineTo(5, 14); ctx.lineTo(-5, 14)
  ctx.fill()

  const keyGlow = osc(t, 0.004)
  ctx.fillStyle = `rgba(100,200,255,${0.6 + keyGlow * 0.4})`
  ctx.beginPath(); ctx.arc(0, -12, 4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = `rgba(100,200,255,0.8)`
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(2, -2); ctx.stroke()

  ctx.restore()
}

// ─── CloudWatch — "All-Seeing Eye" ────────────────────────────────────────────
function drawCloudWatch(ctx, cx, cy, t) {
  ctx.save()
  const blink = osc(t, 0.0015)
  const scan = (t * 0.001) % (Math.PI * 2)
  ctx.translate(cx, cy)

  const lidH = Math.max(1, 10 - blink * 8)
  ctx.beginPath()
  ctx.ellipse(0, 0, 13, lidH, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(20,30,20,0.8)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(100,200,100,0.7)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  if (lidH > 3) {
    ctx.beginPath()
    ctx.arc(0, 0, 6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(40,160,40,0.8)'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(0, 0, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#080808'
    ctx.fill()

    ctx.save()
    ctx.rotate(scan)
    ctx.strokeStyle = 'rgba(100,255,100,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.stroke()
    ctx.restore()
  }

  ctx.restore()
}

// ─── VPC Endpoint — "Secret Passage" ──────────────────────────────────────────
function drawVPCEndpoint(ctx, cx, cy, t) {
  ctx.save()
  const pulse = osc(t, 0.004)
  ctx.translate(cx, cy)

  ctx.fillStyle = '#3a5030'
  ctx.fillRect(-14, -10, 28, 20)

  ctx.strokeStyle = `rgba(100,200,80,${0.2 + pulse * 0.4})`
  ctx.lineWidth = 1
  ctx.strokeRect(-7, -8, 14, 18)

  ctx.beginPath()
  ctx.arc(0, -8, 7, Math.PI, 0)
  ctx.stroke()

  ctx.strokeStyle = `rgba(120,220,100,${0.6 + pulse * 0.4})`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-5, 2); ctx.lineTo(5, 2)
  ctx.moveTo(2, -1); ctx.lineTo(5, 2); ctx.lineTo(2, 5)
  ctx.stroke()

  ctx.fillStyle = `rgba(120,255,100,${0.5 + pulse * 0.5})`
  ctx.beginPath(); ctx.arc(5, 2, 2, 0, Math.PI * 2); ctx.fill()

  ctx.restore()
}
