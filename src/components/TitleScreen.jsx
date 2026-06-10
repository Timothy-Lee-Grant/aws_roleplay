import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../store/gameStore.js'
import { buildGrid } from '../game/hexGrid.js'
import { hexCenter } from '../game/hexGrid.js'
import {
  COLS, ROWS, HEX_R, BOARD_PAD_X, BOARD_PAD_Y,
} from '../game/constants.js'

// ── Terrain colours (same as GameBoard, duplicated here to stay decoupled) ────
const TERRAIN_FILL = {
  void:    '#060810',
  outside: '#0e1018',
  edge:    '#0c1822',
  wall:    '#18261a',
  gate:    '#1e2e1a',
  public:  '#1b2e18',
  private: '#122518',
}
const TERRAIN_STROKE = {
  void:    '#090b12',
  outside: '#121520',
  edge:    '#1a3040',
  wall:    '#283a26',
  gate:    '#607840',
  public:  '#2c4e28',
  private: '#1c4836',
}

function drawHexPath(ctx, cx, cy, r) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30)
    const px = cx + r * Math.cos(a)
    const py = cy + r * Math.sin(a)
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
  }
  ctx.closePath()
}

/**
 * Draw the terrain-only board (no sprites, no labels) for the title background.
 * Scales to fill the canvas, panned/zoomed to show the full grid centered.
 */
function drawBackground(canvas, t) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w   = canvas.clientWidth
  const h   = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width  = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  // Fit the whole grid inside the canvas with some padding
  const gridW  = BOARD_PAD_X * 2 + (COLS - 1) * (HEX_R * Math.sqrt(3)) + HEX_R * Math.sqrt(3)
  const gridH  = BOARD_PAD_Y * 2 + (ROWS - 1) * (HEX_R * 1.5) + HEX_R * 2
  const scale  = Math.min(w / gridW, h / gridH) * 0.9
  const offX   = (w - gridW * scale) / 2
  const offY   = (h - gridH * scale) / 2

  ctx.save()
  ctx.translate(offX, offY)
  ctx.scale(scale, scale)

  const grid = buildGrid()

  // Subtle pulse on the outside zone to give a "breathing" feel
  const pulse = 0.75 + 0.25 * Math.sin(t / 2000)

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell    = grid[row][col]
      const { x, y } = hexCenter(row, col)
      const terrain = cell.terrain

      drawHexPath(ctx, x, y, HEX_R - 1)

      // Animate the outside/edge tiles slightly
      let fill = TERRAIN_FILL[terrain] ?? '#060810'
      if (terrain === 'outside' || terrain === 'edge') {
        // Parse the hex color and lighten/darken by pulse factor
        fill = fill  // keep as-is; subtle enough
      }

      ctx.fillStyle   = fill
      ctx.strokeStyle = TERRAIN_STROKE[terrain] ?? '#090b12'
      ctx.lineWidth   = 1
      ctx.fill()
      ctx.stroke()
    }
  }

  // Draw glowing gate tiles
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = grid[row][col]
      if (cell.terrain !== 'gate') continue
      const { x, y } = hexCenter(row, col)
      const glow = 0.4 + 0.4 * Math.abs(Math.sin(t / 900 + col * 0.8))
      ctx.save()
      ctx.globalAlpha = glow
      drawHexPath(ctx, x, y, HEX_R - 1)
      ctx.fillStyle = '#3a6030'
      ctx.fill()
      ctx.restore()
    }
  }

  ctx.restore()
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  root: {
    position: 'relative',
    width: '100%', height: '100%',
    overflow: 'hidden',
    background: '#060810',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Cinzel', serif",
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    opacity: 0.45,
  },
  overlay: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '48px 64px',
    background: 'rgba(6, 8, 16, 0.82)',
    border: '1px solid rgba(96, 120, 64, 0.3)',
    borderRadius: '4px',
    boxShadow: '0 0 60px rgba(60, 96, 48, 0.15), 0 0 120px rgba(6, 8, 16, 0.9)',
  },
  crown: {
    fontSize: '36px',
    marginBottom: '-4px',
    filter: 'drop-shadow(0 0 8px rgba(180, 140, 60, 0.7))',
  },
  title: {
    fontSize: '52px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#c8d8a0',
    textShadow: '0 0 20px rgba(96, 160, 80, 0.4), 0 2px 4px rgba(0,0,0,0.8)',
    margin: 0,
    lineHeight: 1,
  },
  subtitle: {
    fontSize: '12px',
    letterSpacing: '0.3em',
    color: '#5a8060',
    textTransform: 'uppercase',
    margin: '0 0 24px',
  },
  divider: {
    width: '200px',
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(96,120,64,0.6), transparent)',
    margin: '8px 0',
  },
  menuGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '260px',
    marginTop: '8px',
  },
  btnPrimary: {
    padding: '13px 0',
    background: 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)',
    border: '1px solid rgba(96,160,64,0.5)',
    borderRadius: '3px',
    color: '#a8d080',
    fontFamily: "'Cinzel', serif",
    fontSize: '14px',
    letterSpacing: '0.15em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textTransform: 'uppercase',
    width: '100%',
  },
  btnSecondary: {
    padding: '11px 0',
    background: 'transparent',
    border: '1px solid rgba(80,100,60,0.4)',
    borderRadius: '3px',
    color: '#6a9060',
    fontFamily: "'Cinzel', serif",
    fontSize: '13px',
    letterSpacing: '0.12em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    textTransform: 'uppercase',
    width: '100%',
  },
  footer: {
    marginTop: '32px',
    fontSize: '10px',
    letterSpacing: '0.2em',
    color: '#2a3a28',
    textTransform: 'uppercase',
  },
  hasSave: {
    fontSize: '10px',
    color: '#4a6a40',
    letterSpacing: '0.1em',
    marginTop: '-4px',
    textAlign: 'center',
  },
}

// ── HowToPlay modal ────────────────────────────────────────────────────────────

const SLIDES = [
  {
    icon: '🏰',
    title: 'Your VPC — the Kingdom',
    body: 'This is your Virtual Private Cloud. The stone walls are the VPC perimeter — nothing enters or leaves without explicit permission. In real AWS, a VPC is your isolated network slice of the cloud.',
  },
  {
    icon: '🌐',
    title: 'The Edge — Outside the Walls',
    body: 'The blue strip outside the walls holds internet-edge services: Internet Gateways, CloudFront, and Route53. These services are not inside your VPC — they sit at the boundary of AWS\'s global network.',
  },
  {
    icon: '🛡',
    title: 'Public vs Private Subnets',
    body: 'Green tiles are the Public Subnet — facing the Outer Realm, internet-reachable. Teal tiles are the Private Subnet (Inner Sanctum) — isolated, no direct internet access. Databases belong here.',
  },
  {
    icon: '🪙',
    title: 'Gold = Your AWS Budget',
    body: 'Every service costs gold to deploy. You get 50% back when you remove one. Plan your architecture carefully — over-engineering costs more gold and real AWS charges are proportional to complexity.',
  },
  {
    icon: '⚔️',
    title: 'Place. Connect. Defend.',
    body: 'Select a service from the left panel, then click a valid tile to place it. Adjacent compatible services connect automatically. Complete missions to earn more gold and unlock the next challenge.',
  },
]

function HowToPlayModal({ onClose }) {
  const [slide, setSlide] = useState(0)
  const cur = SLIDES[slide]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(4, 6, 12, 0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Cinzel', serif",
    }}>
      <div style={{
        width: '480px',
        background: 'rgba(10, 14, 24, 0.97)',
        border: '1px solid rgba(96, 120, 64, 0.35)',
        borderRadius: '4px',
        padding: '40px 48px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '16px',
        boxShadow: '0 0 80px rgba(40, 70, 30, 0.2)',
      }}>
        {/* Progress pips */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {SLIDES.map((_, i) => (
            <div key={i} style={{
              width: i === slide ? '24px' : '8px', height: '8px',
              borderRadius: '4px',
              background: i === slide ? '#5a9040' : '#1e2e1a',
              transition: 'width 0.2s ease',
            }} />
          ))}
        </div>

        {/* Slide content */}
        <div style={{ fontSize: '40px', marginTop: '8px' }}>{cur.icon}</div>
        <h2 style={{
          color: '#c8d8a0', fontSize: '18px', letterSpacing: '0.1em',
          margin: 0, textAlign: 'center',
        }}>{cur.title}</h2>
        <p style={{
          color: '#6a8860', fontSize: '13px', lineHeight: 1.7,
          textAlign: 'center', margin: 0, fontFamily: 'sans-serif',
          letterSpacing: '0.02em',
        }}>{cur.body}</p>

        {/* Nav */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', width: '100%' }}>
          {slide > 0 && (
            <button
              style={{ ...S.btnSecondary, flex: 1 }}
              onMouseEnter={e => { e.target.style.borderColor = 'rgba(80,120,60,0.7)'; e.target.style.color = '#8ab870' }}
              onMouseLeave={e => { e.target.style.borderColor = 'rgba(80,100,60,0.4)'; e.target.style.color = '#6a9060' }}
              onClick={() => setSlide(s => s - 1)}
            >← Back</button>
          )}
          {slide < SLIDES.length - 1 ? (
            <button
              style={{ ...S.btnPrimary, flex: 1 }}
              onMouseEnter={e => { e.target.style.background = 'linear-gradient(180deg, #3a6030 0%, #2a4820 100%)'; e.target.style.borderColor = 'rgba(96,160,64,0.8)' }}
              onMouseLeave={e => { e.target.style.background = 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)'; e.target.style.borderColor = 'rgba(96,160,64,0.5)' }}
              onClick={() => setSlide(s => s + 1)}
            >Next →</button>
          ) : (
            <button
              style={{ ...S.btnPrimary, flex: 1 }}
              onMouseEnter={e => { e.target.style.background = 'linear-gradient(180deg, #3a6030 0%, #2a4820 100%)' }}
              onMouseLeave={e => { e.target.style.background = 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)' }}
              onClick={onClose}
            >Begin the Siege</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main TitleScreen ───────────────────────────────────────────────────────────

export default function TitleScreen() {
  const canvasRef  = useRef(null)
  const rafRef     = useRef(null)
  const startGame  = useGameStore(s => s.startGame)
  const continueGame = useGameStore(s => s.continueGame)
  const [showHowTo, setShowHowTo]   = useState(false)
  const [hasSave, setHasSave]       = useState(false)

  // Check for existing save
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cloudRealm_save')
      if (saved) setHasSave(true)
    } catch { /* ignore */ }
  }, [])

  // Animate the terrain background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let startTime = null
    function frame(ts) {
      if (!startTime) startTime = ts
      drawBackground(canvas, ts - startTime)
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const handleHowToClose = () => {
    setShowHowTo(false)
    startGame()
  }

  return (
    <div style={S.root}>
      <canvas ref={canvasRef} style={S.canvas} />

      {showHowTo && <HowToPlayModal onClose={handleHowToClose} />}

      <div style={S.overlay}>
        <div style={S.crown}>👑</div>
        <h1 style={S.title}>CloudRealm</h1>
        <p style={S.subtitle}>AWS Architecture · Strategy · Education</p>
        <div style={S.divider} />

        <div style={S.menuGroup}>
          <button
            style={S.btnPrimary}
            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #3a6030 0%, #2a4820 100%)'; e.currentTarget.style.borderColor = 'rgba(96,160,64,0.8)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)'; e.currentTarget.style.borderColor = 'rgba(96,160,64,0.5)' }}
            onClick={startGame}
          >
            ⚔ New Game
          </button>

          <button
            style={{ ...S.btnSecondary, opacity: hasSave ? 1 : 0.4, cursor: hasSave ? 'pointer' : 'not-allowed' }}
            onMouseEnter={e => { if (hasSave) { e.currentTarget.style.borderColor = 'rgba(80,120,60,0.7)'; e.currentTarget.style.color = '#8ab870' } }}
            onMouseLeave={e => { if (hasSave) { e.currentTarget.style.borderColor = 'rgba(80,100,60,0.4)'; e.currentTarget.style.color = '#6a9060' } }}
            onClick={hasSave ? continueGame : undefined}
          >
            📜 Continue
          </button>

          <button
            style={S.btnSecondary}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(80,120,60,0.7)'; e.currentTarget.style.color = '#8ab870' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(80,100,60,0.4)'; e.currentTarget.style.color = '#6a9060' }}
            onClick={() => setShowHowTo(true)}
          >
            📖 How to Play
          </button>
        </div>

        {hasSave && (
          <p style={S.hasSave}>Save detected — progress will continue</p>
        )}

        <p style={S.footer}>CloudRealm · AWS Education Game</p>
      </div>
    </div>
  )
}
