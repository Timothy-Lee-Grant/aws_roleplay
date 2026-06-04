import React, { useRef, useEffect, useCallback } from 'react'
import { useGameStore }        from '../store/gameStore.js'
import { SERVICES, COLS, ROWS, HEX_R, TERRAIN } from '../game/constants.js'
import { hexCenter, pixelToHex, getNeighbors, drawHexPath, canPlaceHere } from '../game/hexGrid.js'
import { drawSprite } from '../game/sprites.js'
import { startAmbient, stopAmbient, playHover } from '../game/audio.js'

/**
 * GameBoard — the canvas component.
 *
 * Architecture notes:
 *
 *   1. A single <canvas> fills the centre column.
 *   2. A requestAnimationFrame loop runs continuously, clearing and redrawing
 *      every frame. This is the foundation for future moving characters and effects.
 *   3. The RAF loop reads state through REFS, not Zustand subscriptions, so the
 *      loop never restarts on state changes (which would cause flickering).
 *   4. Zoom and pan are applied via ctx.translate / ctx.scale before drawing,
 *      so all game-world coordinates are in "world space" (no manual offset math).
 *   5. Click and right-click convert canvas coordinates → world → hex via pixelToHex.
 */
export default function GameBoard() {
  const canvasRef = useRef(null)
  const animRef   = useRef(null)   // current RAF id (for cleanup)

  // ── Store subscriptions (for UI state that drives canvas appearance) ─────────
  const grid              = useGameStore(s => s.grid)
  const placed            = useGameStore(s => s.placed)
  const selectedServiceId = useGameStore(s => s.selectedServiceId)
  const panX              = useGameStore(s => s.panX)
  const panY              = useGameStore(s => s.panY)
  const zoom              = useGameStore(s => s.zoom)

  // ── Store actions ────────────────────────────────────────────────────────────
  const placeService   = useGameStore(s => s.placeService)
  const removeService  = useGameStore(s => s.removeService)
  const clearSelection = useGameStore(s => s.clearSelection)
  const setCamera      = useGameStore(s => s.setCamera)

  // ── Refs for the RAF loop (never stale, never restart the loop) ──────────────
  const gridRef      = useRef(grid)
  const placedRef    = useRef(placed)
  const selectedRef  = useRef(selectedServiceId)
  const cameraRef    = useRef({ panX, panY, zoom })

  gridRef.current     = grid
  placedRef.current   = placed
  selectedRef.current = selectedServiceId
  cameraRef.current   = { panX, panY, zoom }

  // ── Toast (simple in-canvas notification, no DOM element needed) ─────────────
  const toastRef = useRef({ msg: '', until: 0 })

  function showToast(msg, isError = false) {
    toastRef.current = { msg, until: performance.now() + 2200, isError }
  }

  // ── Ambient audio — starts on first user interaction, stops on unmount ───────
  // We attach a one-time 'pointerdown' listener to the canvas. The first click
  // both satisfies the browser's user-gesture requirement for AudioContext AND
  // starts the drone. After that we remove the listener so it only fires once.
  useEffect(() => {
    const canvas = canvasRef.current
    const onFirstInteraction = () => {
      startAmbient()
      canvas.removeEventListener('pointerdown', onFirstInteraction)
    }
    canvas.addEventListener('pointerdown', onFirstInteraction)
    return () => {
      canvas.removeEventListener('pointerdown', onFirstInteraction)
      stopAmbient()
    }
  }, [])

  // ── Canvas resize ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const resize = () => {
      canvas.width  = canvas.clientWidth
      canvas.height = canvas.clientHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // ── Draw loop ────────────────────────────────────────────────────────────────
  const draw = useCallback((now) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx  = canvas.getContext('2d')
    const W    = canvas.width
    const H    = canvas.height
    const { panX, panY, zoom } = cameraRef.current
    const grid    = gridRef.current
    const placed  = placedRef.current
    const selId   = selectedRef.current
    const selDef  = SERVICES.find(s => s.id === selId) || null

    // 1. Clear ──────────────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H)

    // Subtle background texture
    ctx.fillStyle = '#090b10'
    ctx.fillRect(0, 0, W, H)

    // 2. Apply camera transform ────────────────────────────────────────────────
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    // 3. Draw terrain ──────────────────────────────────────────────────────────
    drawTerrain(ctx, grid, selDef, placed, now)

    // 4. Draw connection lines ─────────────────────────────────────────────────
    drawConnections(ctx, grid, placed, now)

    // 5. Draw placed service sprites ───────────────────────────────────────────
    for (const p of placed) {
      const { x, y } = hexCenter(p.row, p.col)
      ctx.save()
      ctx.beginPath()
      drawHexPath(ctx, x, y, HEX_R - 2)
      ctx.clip()
      drawSprite(ctx, x, y, p.id, now)
      ctx.restore()
    }

    // 6. Draw hover ring (tracked via mousemove ref) ───────────────────────────
    if (hoverRef.current) {
      const { row, col } = hoverRef.current
      const { x, y } = hexCenter(row, col)
      const cell = grid[row]?.[col]
      const isValid = cell && !cell.service && selDef && canPlaceHere(cell.terrain, selDef)

      if (selDef) {
        ctx.save()
        drawHexPath(ctx, x, y, HEX_R - 1)
        ctx.strokeStyle = isValid ? 'rgba(120,220,100,0.9)' : 'rgba(200,80,80,0.7)'
        ctx.lineWidth = 2 / zoom
        ctx.stroke()
        ctx.restore()
      } else if (cell?.service) {
        ctx.save()
        drawHexPath(ctx, x, y, HEX_R - 1)
        ctx.strokeStyle = 'rgba(201,168,76,0.7)'
        ctx.lineWidth = 1.5 / zoom
        ctx.stroke()
        ctx.restore()
      }
    }

    ctx.restore()  // end camera transform

    // 7. Toast notification (in screen space, outside camera transform) ─────────
    if (toastRef.current.until > now) {
      const { msg, isError } = toastRef.current
      const age      = toastRef.current.until - now
      const alpha    = Math.min(1, age / 300)
      const isError2 = isError || false

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.font = '13px Cinzel, serif'
      const tw = ctx.measureText(msg).width
      const tx = (W - tw) / 2
      const ty = H - 36

      ctx.fillStyle = isError2 ? 'rgba(80,20,20,0.88)' : 'rgba(20,18,14,0.88)'
      roundRect(ctx, tx - 18, ty - 18, tw + 36, 28, 8)
      ctx.fill()

      ctx.strokeStyle = isError2 ? 'rgba(200,80,80,0.6)' : 'rgba(201,168,76,0.6)'
      ctx.lineWidth = 1
      roundRect(ctx, tx - 18, ty - 18, tw + 36, 28, 8)
      ctx.stroke()

      ctx.fillStyle = isError2 ? '#e88080' : '#f0cc70'
      ctx.fillText(msg, tx, ty)
      ctx.restore()
    }

    // Schedule next frame
    animRef.current = requestAnimationFrame(draw)
  }, [])  // ← empty deps: loop created once, reads only via refs

  // Start / stop the RAF loop
  useEffect(() => {
    animRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animRef.current)
  }, [draw])

  // ── Pan / Zoom ───────────────────────────────────────────────────────────────
  const dragRef  = useRef(null)
  const hoverRef = useRef(null)
  // Track previous hover position so we only fire playHover when the hex changes
  const lastHoverKey = useRef(null)

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const canvas  = canvasRef.current
    const rect    = canvas.getBoundingClientRect()
    const mx      = e.clientX - rect.left
    const my      = e.clientY - rect.top
    const { panX, panY, zoom } = cameraRef.current
    const factor  = e.deltaY < 0 ? 1.12 : 0.89
    const newZoom = Math.max(0.4, Math.min(3.5, zoom * factor))

    // Keep the world point under the cursor stationary while zooming
    const newPanX = mx - (mx - panX) * (newZoom / zoom)
    const newPanY = my - (my - panY) * (newZoom / zoom)
    setCamera({ panX: newPanX, panY: newPanY, zoom: newZoom })
  }, [setCamera])

  useEffect(() => {
    const canvas = canvasRef.current
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Mouse events ─────────────────────────────────────────────────────────────
  const canvasToWorld = useCallback((cx, cy) => {
    const { panX, panY, zoom } = cameraRef.current
    return { wx: (cx - panX) / zoom, wy: (cy - panY) / zoom }
  }, [])

  const handleMouseDown = useCallback((e) => {
    // Middle mouse or Alt+drag → pan
    if (e.button === 1 || e.altKey) {
      dragRef.current = {
        startX: e.clientX, startY: e.clientY,
        startPanX: cameraRef.current.panX,
        startPanY: cameraRef.current.panY,
      }
      e.preventDefault()
    }
  }, [])

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const { wx, wy } = canvasToWorld(cx, cy)
    const hex = pixelToHex(wx, wy)
    hoverRef.current = hex

    // Only play hover tick when the cursor moves to a different tile
    const key = `${hex.row},${hex.col}`
    if (key !== lastHoverKey.current) {
      lastHoverKey.current = key
      // Only tick when a service is selected (user is actively placing)
      if (selectedRef.current) playHover()
    }

    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      setCamera({
        panX: dragRef.current.startPanX + dx,
        panY: dragRef.current.startPanY + dy,
      })
    }
  }, [canvasToWorld, setCamera])

  const handleMouseUp = useCallback(() => { dragRef.current = null }, [])
  const handleMouseLeave = useCallback(() => { hoverRef.current = null }, [])

  // ── Click — place service ─────────────────────────────────────────────────────
  const handleClick = useCallback((e) => {
    if (dragRef.current) return   // was a pan gesture, not a click
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const { wx, wy } = canvasToWorld(cx, cy)
    const { row, col } = pixelToHex(wx, wy)

    const result = placeService(row, col)
    if (result) showToast(result.message, !result.ok)
  }, [canvasToWorld, placeService])

  // ── Right-click — remove service ──────────────────────────────────────────────
  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const { wx, wy } = canvasToWorld(cx, cy)
    const { row, col } = pixelToHex(wx, wy)

    const result = removeService(row, col)
    if (result) showToast(result.message, !result.ok)
  }, [canvasToWorld, removeService])

  // ── Escape to cancel selection ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') clearSelection() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection])

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    />
  )
}

// ─── Internal draw functions ──────────────────────────────────────────────────

function drawTerrain(ctx, grid, selDef, placed, t) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell    = grid[r][c]
      const terrain = cell.terrain
      const { x, y } = hexCenter(r, c)

      // Base fill
      drawHexPath(ctx, x, y)
      ctx.fillStyle = TERRAIN_FILL[terrain] || '#090b10'
      ctx.fill()

      // Selection overlay: pulse valid, dim invalid
      if (selDef && !cell.service) {
        const valid = canPlaceHere(terrain, selDef)
        if (valid) {
          const pulse = (Math.sin(t * 0.006) + 1) / 2
          drawHexPath(ctx, x, y)
          ctx.fillStyle = `rgba(100,210,90,${0.07 + pulse * 0.16})`
          ctx.fill()
        } else if (terrain !== TERRAIN.OUTSIDE && terrain !== TERRAIN.VOID) {
          drawHexPath(ctx, x, y)
          ctx.fillStyle = 'rgba(0,0,0,0.38)'
          ctx.fill()
        }
      }

      // Wall stripe pattern (clipped to hex)
      if (terrain === TERRAIN.WALL || terrain === TERRAIN.GATE) {
        ctx.save()
        ctx.beginPath(); drawHexPath(ctx, x, y); ctx.clip()
        ctx.strokeStyle = 'rgba(80,140,60,0.17)'
        ctx.lineWidth = 0.8
        for (let d = -HEX_R * 2; d < HEX_R * 2; d += 7) {
          ctx.beginPath()
          ctx.moveTo(x - HEX_R, y + d)
          ctx.lineTo(x + HEX_R, y + d - HEX_R * 0.8)
          ctx.stroke()
        }
        ctx.restore()
      }

      // Border stroke
      drawHexPath(ctx, x, y)
      ctx.strokeStyle = TERRAIN_STROKE_MAP[terrain] || '#0d1014'
      ctx.lineWidth = 0.8
      ctx.stroke()

      // Gate glow ring
      if (terrain === TERRAIN.GATE) {
        const glow = (Math.sin(t * 0.004) + 1) / 2
        drawHexPath(ctx, x, y, HEX_R - 5)
        ctx.strokeStyle = `rgba(160,220,80,${0.2 + glow * 0.35})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }
}

const TERRAIN_FILL = {
  void:    '#060810',
  outside: '#0e1018',
  wall:    '#17251a',
  gate:    '#1c2c18',
  public:  '#1a2d18',
  private: '#112418',
}
const TERRAIN_STROKE_MAP = {
  void:    '#090b12',
  outside: '#121520',
  wall:    '#283a26',
  gate:    '#607840',
  public:  '#2c4e28',
  private: '#1c4836',
}

function drawConnections(ctx, grid, placed, t) {
  const drawn = new Set()

  for (const p of placed) {
    const nbrs = getNeighbors(p.row, p.col)
    for (const { row: nr, col: nc } of nbrs) {
      const nb = grid[nr]?.[nc]
      if (!nb?.service) continue

      const key = [[p.id, p.row, p.col].join(','), [nb.service, nr, nc].join(',')].sort().join('|')
      if (drawn.has(key)) continue
      drawn.add(key)

      const linked = p.conns?.includes(nb.service) || false
      const { x: x1, y: y1 } = hexCenter(p.row, p.col)
      const { x: x2, y: y2 } = hexCenter(nr, nc)

      ctx.save()
      ctx.setLineDash([5, 4])
      ctx.lineDashOffset = -(t * 0.04 % 12)
      ctx.strokeStyle = linked ? 'rgba(201,168,76,0.52)' : 'rgba(70,66,60,0.28)'
      ctx.lineWidth   = linked ? 1.5 : 0.6
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      if (linked) {
        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2
        ctx.beginPath()
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(201,168,76,0.8)'
        ctx.fill()
      }
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}
