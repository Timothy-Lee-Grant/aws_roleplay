import React, { useRef, useEffect, useCallback } from 'react'
import { useGameStore }        from '../store/gameStore.js'
import { SERVICES, COLS, ROWS, HEX_R, TERRAIN } from '../game/constants.js'
import { hexCenter, pixelToHex, getNeighbors, drawHexPath, canPlaceHere } from '../game/hexGrid.js'
import { drawSprite } from '../game/sprites.js'
import { startAmbient, stopAmbient, playHover } from '../game/audio.js'
import { buildInitialWaveState, simulationTick, computeWaveResult } from '../game/simulation.js'

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
  const phase             = useGameStore(s => s.phase)
  const panX              = useGameStore(s => s.panX)
  const panY              = useGameStore(s => s.panY)
  const zoom              = useGameStore(s => s.zoom)

  // ── Store actions ────────────────────────────────────────────────────────────
  const placeService       = useGameStore(s => s.placeService)
  const removeService      = useGameStore(s => s.removeService)
  const clearSelection     = useGameStore(s => s.clearSelection)
  const setCamera          = useGameStore(s => s.setCamera)
  const endWave            = useGameStore(s => s.endWave)
  const dispatchSimEvents  = useGameStore(s => s.dispatchSimEvents)
  const updateWaveTimer    = useGameStore(s => s.updateWaveTimer)

  // ── Refs for the RAF loop (never stale, never restart the loop) ──────────────
  const gridRef      = useRef(grid)
  const placedRef    = useRef(placed)
  const selectedRef  = useRef(selectedServiceId)
  const phaseRef     = useRef(phase)
  const cameraRef    = useRef({ panX, panY, zoom })
  // dprRef tracks the current device pixel ratio for HiDPI canvas scaling.
  // It's a ref (not state) so we don't re-render or restart the RAF loop on change.
  const dprRef       = useRef(window.devicePixelRatio || 1)

  gridRef.current     = grid
  placedRef.current   = placed
  selectedRef.current = selectedServiceId
  phaseRef.current    = phase
  cameraRef.current   = { panX, panY, zoom }

  // Action refs — stable Zustand references; stored in refs so the RAF loop
  // can call them without the draw callback having stale closures.
  const endWaveRef           = useRef(endWave)
  const dispatchSimEventsRef = useRef(dispatchSimEvents)
  const updateWaveTimerRef   = useRef(updateWaveTimer)
  endWaveRef.current           = endWave
  dispatchSimEventsRef.current = dispatchSimEvents
  updateWaveTimerRef.current   = updateWaveTimer

  // ── Simulation state (lives in refs — not Zustand — for 60fps access) ────────
  const waveStateRef     = useRef(null)   // current SimWaveState object
  const waveTimerRef     = useRef(60)     // seconds remaining (counts down in RAF)
  const waveEndedRef     = useRef(false)  // prevents double-calling endWave
  const lastTickTimeRef  = useRef(null)   // previous RAF `now` value for delta
  const activationsRef   = useRef([])     // { pos, startTime } rings animation
  const lastDispatchRef  = useRef(0)      // throttle store dispatch (performance.now)

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

  // ── Wave initialisation ─────────────────────────────────────────────────────
  // When phase changes to 'wave', snapshot the current board and build initial
  // simulation state. The RAF loop picks this up on the very next frame.
  // Note: `placed` is intentionally captured here (not placedRef) so we get a
  // clean snapshot of the board at the moment the wave starts.
  useEffect(() => {
    if (phase === 'wave') {
      waveStateRef.current    = buildInitialWaveState(placed, getNeighbors)
      waveTimerRef.current    = 60
      waveEndedRef.current    = false
      lastTickTimeRef.current = null
      activationsRef.current  = []
      lastDispatchRef.current = 0
    } else {
      waveStateRef.current = null
      waveEndedRef.current = false
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canvas resize (HiDPI / Retina fix) ──────────────────────────────────────
  // The canvas physical buffer must be (clientWidth * dpr) × (clientHeight * dpr).
  // Without this every drawn pixel occupies a 2×2 block on Retina screens — the
  // entire game looks blurry. The draw loop then applies setTransform(dpr,…) so
  // all drawing coordinates remain in CSS pixels (no other code changes needed).
  useEffect(() => {
    const canvas = canvasRef.current
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      dprRef.current        = dpr
      canvas.width          = Math.round(canvas.clientWidth  * dpr)
      canvas.height         = Math.round(canvas.clientHeight * dpr)
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
    const dpr  = dprRef.current
    // cssW/cssH are CSS pixel dimensions — all drawing and positioning uses these.
    // The dpr base transform below maps them to the correct physical pixel count.
    const cssW = canvas.width  / dpr   // = canvas.clientWidth
    const cssH = canvas.height / dpr   // = canvas.clientHeight
    const { panX, panY, zoom } = cameraRef.current
    const grid    = gridRef.current
    const placed  = placedRef.current
    const selId   = selectedRef.current
    const selDef  = SERVICES.find(s => s.id === selId) || null

    // 1. Reset transform to DPR base and clear ────────────────────────────────
    // setTransform(dpr,0,0,dpr,0,0) snaps the matrix to a fresh DPR-only scale
    // each frame — no transform accumulation across frames. After this call,
    // all coordinates are in CSS pixels; the dpr factor is applied automatically.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    // Subtle background texture
    ctx.fillStyle = '#090b10'
    ctx.fillRect(0, 0, cssW, cssH)

    // 2. Apply camera transform (on top of dpr base) ──────────────────────────
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    // 3. Draw terrain ──────────────────────────────────────────────────────────
    drawTerrain(ctx, grid, selDef, placed, now)

    // 3b. Zone labels — behind services, on top of terrain fill ────────────────
    drawZoneLabels(ctx)

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

    // 5b. Security Group warning badges (Gap 2 visibility) ────────────────────
    // Services with requiresSG:true need a Security Group on an adjacent tile.
    // Without one, they have no stateful firewall — a critical misconfiguration.
    // Teach this visually: a red "!SG" badge on any unprotected service.
    // Real AWS: EC2 without SG rules = ALL traffic blocked (implicit deny).
    {
      const sgPlacedMap = new Map(placed.map(p => [`${p.row},${p.col}`, p]))
      for (const p of placed) {
        const svcDef = SERVICES.find(s => s.id === p.id)
        if (!svcDef?.requiresSG) continue
        const nbrs  = getNeighbors(p.row, p.col)
        const hasSG = nbrs.some(({ row: nr, col: nc }) =>
          sgPlacedMap.get(`${nr},${nc}`)?.id === 'sg'
        )
        if (!hasSG) {
          const { x, y } = hexCenter(p.row, p.col)
          ctx.save()
          // Red badge with !SG text — top-right corner of the tile
          ctx.fillStyle = 'rgba(210,55,45,0.92)'
          ctx.beginPath()
          ctx.arc(x + 15, y - 15, 7.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 6px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('!SG', x + 15, y - 15)
          ctx.restore()
        }
      }
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

    // ── Wave simulation: tick + render ──────────────────────────────────────────
    // All of this is inside the camera transform so world-space coordinates work.
    if (phaseRef.current === 'wave' && waveStateRef.current) {
      // Delta time ────────────────────────────────────────────────────────────────
      const prevTickTime = lastTickTimeRef.current
      const deltaMs = prevTickTime ? Math.min(now - prevTickTime, 50) : 0
      lastTickTimeRef.current = now

      if (deltaMs > 0 && !waveEndedRef.current) {
        // ── Advance simulation ───────────────────────────────────────────────────
        const { waveState: nextState, events } = simulationTick(waveStateRef.current, deltaMs)
        waveStateRef.current = nextState

        // Queue activation rings (visual only — not dispatched to store)
        for (const e of events) {
          if (e.type === 'SERVICE_ACTIVATED') {
            activationsRef.current.push({ pos: e.pos, startTime: now })
          }
        }

        // Dispatch meaningful events to store (stats + battle log) — throttled
        const hasMeaningful = events.some(e =>
          e.type === 'PACKET_COMPLETE' || e.type === 'PACKET_FAILED' || e.type === 'THREAT_STRUCK'
        )
        if (hasMeaningful || now - lastDispatchRef.current > 400) {
          if (events.length > 0) {
            dispatchSimEventsRef.current(events)
            lastDispatchRef.current = now
          }
        }

        // ── Wave timer countdown ─────────────────────────────────────────────────
        const prevTimer = waveTimerRef.current
        waveTimerRef.current -= deltaMs / 1000
        // Sync display to store once per second
        if (Math.ceil(waveTimerRef.current) < Math.ceil(prevTimer)) {
          updateWaveTimerRef.current(waveTimerRef.current)
        }
        // End wave when timer reaches 0
        if (waveTimerRef.current <= 0 && !waveEndedRef.current) {
          waveEndedRef.current = true
          const result = computeWaveResult(waveStateRef.current, placedRef.current, getNeighbors)
          endWaveRef.current(result)
        }
      }

      // Prune old activation rings
      activationsRef.current = activationsRef.current.filter(a => now - a.startTime < 600)

      // ── Draw activation rings ────────────────────────────────────────────────
      for (const act of activationsRef.current) {
        const t2 = (now - act.startTime) / 600
        const radius = 8 + t2 * 22
        const alpha  = (1 - t2) * 0.65
        ctx.save()
        ctx.beginPath()
        ctx.arc(act.pos.x, act.pos.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(160,220,80,${alpha})`
        ctx.lineWidth = 2 / zoom
        ctx.stroke()
        ctx.restore()
      }

      // ── Draw data packets ────────────────────────────────────────────────────
      const ws = waveStateRef.current
      if (ws) {
        for (const pkt of ws.packets) {
          const px = pkt.fromPos.x + (pkt.toPos.x - pkt.fromPos.x) * pkt.progress
          const py = pkt.fromPos.y + (pkt.toPos.y - pkt.fromPos.y) * pkt.progress

          ctx.save()
          ctx.globalAlpha = pkt.dying ? 0.4 : 1

          // Glow halo
          const grd = ctx.createRadialGradient(px, py, 0, px, py, 8)
          grd.addColorStop(0, pkt.color + 'cc')
          grd.addColorStop(1, pkt.color + '00')
          ctx.beginPath()
          ctx.arc(px, py, 8, 0, Math.PI * 2)
          ctx.fillStyle = grd
          ctx.fill()

          // Core dot
          ctx.beginPath()
          ctx.arc(px, py, 3.5, 0, Math.PI * 2)
          ctx.fillStyle = pkt.dying ? '#ff6060' : '#ffffff'
          ctx.fill()

          ctx.restore()
        }

        // ── Draw threats ───────────────────────────────────────────────────────
        for (const threat of ws.threats) {
          if (threat.deflected) continue
          const tp = {
            x: threat.startPos.x + (threat.targetPos.x - threat.startPos.x) * threat.progress,
            y: threat.startPos.y + (threat.targetPos.y - threat.startPos.y) * threat.progress,
          }

          ctx.save()
          ctx.globalAlpha = threat.struck ? 0.22 : 1

          // Glow aura
          const grd = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, 20)
          grd.addColorStop(0, threat.color + '55')
          grd.addColorStop(1, 'transparent')
          ctx.beginPath()
          ctx.arc(tp.x, tp.y, 20, 0, Math.PI * 2)
          ctx.fillStyle = grd
          ctx.fill()

          // Emoji icon — scale inversely with zoom so threats stay readable
          const iconSize = Math.max(14, 18 / zoom)
          ctx.font = `${iconSize}px serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(threat.icon, tp.x, tp.y)

          ctx.restore()
        }
      }
    }
    // ── End wave simulation ──────────────────────────────────────────────────────

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
      const tx = (cssW - tw) / 2   // cssW = CSS pixel width (correct after dpr fix)
      const ty = cssH - 36

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

      // Edge zone: subtle blue inner ring — visually marks this as "internet-edge"
      // not just void space. The blue tint signals "AWS infrastructure, but not YOUR VPC."
      if (terrain === TERRAIN.EDGE) {
        const edgePulse = (Math.sin(t * 0.0025 + 1.2) + 1) / 2  // slow, offset pulse
        drawHexPath(ctx, x, y, HEX_R - 6)
        ctx.strokeStyle = `rgba(50,120,210,${0.10 + edgePulse * 0.12})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    }
  }
}

/**
 * Draw zone labels (INTERNET EDGE, PUBLIC SUBNET, PRIVATE SUBNET) as subtle
 * background text. They appear on empty tiles and are occluded by sprites.
 * Low opacity — they guide new players without cluttering the board.
 */
function drawZoneLabels(ctx) {
  ctx.save()
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.font         = 'bold 7px "Courier New", monospace'
  ctx.letterSpacing = '0.5px'

  // INTERNET EDGE — centered over the edge strip (row 0, col 5)
  const edge = hexCenter(0, 5)
  ctx.globalAlpha = 0.22
  ctx.fillStyle   = '#5aaadc'
  ctx.fillText('INTERNET EDGE', edge.x, edge.y)

  // PUBLIC SUBNET — top of the public zone, left and right flanks
  ctx.globalAlpha = 0.16
  ctx.fillStyle   = '#70b860'
  const pubL = hexCenter(2, 2)
  ctx.fillText('PUBLIC', pubL.x, pubL.y)
  const pubR = hexCenter(2, 8)
  ctx.fillText('PUBLIC', pubR.x, pubR.y)

  // PRIVATE SUBNET — center of the private zone
  const prv = hexCenter(4, 5)
  ctx.globalAlpha = 0.20
  ctx.fillStyle   = '#4ab898'
  ctx.fillText('PRIVATE SUBNET', prv.x, prv.y)

  ctx.restore()
}

const TERRAIN_FILL = {
  void:    '#060810',
  outside: '#0e1018',
  // Edge zone: blue tint — "AWS-managed internet edge, outside your VPC"
  // In real AWS: IGW attaches to VPC. CloudFront + S3 are regional/global.
  // None of these live inside a subnet — this strip teaches that distinction.
  edge:    '#0c1822',
  wall:    '#17251a',
  gate:    '#1c2c18',
  public:  '#1a2d18',
  private: '#112418',
}
const TERRAIN_STROKE_MAP = {
  void:    '#090b12',
  outside: '#121520',
  edge:    '#1a3040',   // blue border distinguishes edge from the void outside
  wall:    '#283a26',
  gate:    '#607840',
  public:  '#2c4e28',
  private: '#1c4836',
}

/**
 * drawConnections — draws animated, directional connection lines.
 *
 * Two passes:
 *
 *  Pass 1 — Adjacent within-VPC connections (local topology).
 *    Only neighbouring tiles get lines. This teaches that in-VPC routing
 *    depends on subnet placement. EC2 can only talk to RDS if they're nearby.
 *
 *  Pass 2 — Cross-zone connections (edge ↔ VPC).
 *    Edge services (IGW, CloudFront, S3) are REGIONAL/GLOBAL — they sit
 *    outside the VPC and can reach any VPC service regardless of position.
 *    These long lines crossing the board teach: "S3 is not in your subnet."
 *    Real AWS equivalent: traffic routes through AWS-managed infrastructure,
 *    not through your VPC routing tables.
 *
 * Directional arrows (Gap 9 fix):
 *    Each service's `conns` lists services it SENDS TRAFFIC TO.
 *    Arrowheads appear at the receiving end.
 *    EC2 → RDS: one arrow (EC2 initiates DB queries).
 *    EC2 ↔ ALB: two arrows (request in, response out).
 */
function drawConnections(ctx, grid, placed, t) {
  const drawn     = new Set()
  const placedMap = new Map(placed.map(p => [`${p.row},${p.col}`, p]))
  const dashOff   = -(t * 0.04 % 12)

  // ─── Pass 1: Adjacent within-VPC connections ────────────────────────────────
  for (const p of placed) {
    if (p.zone === 'edge') continue  // edge services handled in Pass 2

    for (const { row: nr, col: nc } of getNeighbors(p.row, p.col)) {
      const nb = grid[nr]?.[nc]
      if (!nb?.service) continue

      const key = [[p.id, p.row, p.col].join(','), [nb.service, nr, nc].join(',')].sort().join('|')
      if (drawn.has(key)) continue
      drawn.add(key)

      const nbP   = placedMap.get(`${nr},${nc}`)
      const pToNb = p.conns?.includes(nb.service)   || false  // p → nb
      const nbToP = nbP?.conns?.includes(p.id)      || false  // nb → p
      const linked = pToNb || nbToP

      const { x: x1, y: y1 } = hexCenter(p.row, p.col)
      const { x: x2, y: y2 } = hexCenter(nr, nc)

      ctx.save()
      ctx.setLineDash([5, 4])
      ctx.lineDashOffset = dashOff
      ctx.strokeStyle = linked ? 'rgba(201,168,76,0.52)' : 'rgba(70,66,60,0.28)'
      ctx.lineWidth   = linked ? 1.5 : 0.6
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      if (linked) {
        ctx.fillStyle = 'rgba(201,168,76,0.80)'
        if (pToNb) drawArrowhead(ctx, x1, y1, x2, y2)   // arrow at nb end
        if (nbToP) drawArrowhead(ctx, x2, y2, x1, y1)   // arrow at p end
        // Midpoint dot on unidirectional lines makes the single direction obvious
        if (!pToNb || !nbToP) {
          ctx.beginPath()
          ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }

  // ─── Pass 2: Cross-zone connections (edge ↔ any VPC service) ───────────────
  const edgePlaced = placed.filter(p => p.zone === 'edge')
  const vpcPlaced  = placed.filter(p => p.zone !== 'edge')

  for (const ep of edgePlaced) {
    for (const vp of vpcPlaced) {
      const epToVp = ep.conns?.includes(vp.id) || false
      const vpToEp = vp.conns?.includes(ep.id) || false
      if (!epToVp && !vpToEp) continue

      const key = [[ep.id, ep.row, ep.col].join(','), [vp.id, vp.row, vp.col].join(',')].sort().join('|')
      if (drawn.has(key)) continue
      drawn.add(key)

      const { x: x1, y: y1 } = hexCenter(ep.row, ep.col)
      const { x: x2, y: y2 } = hexCenter(vp.row, vp.col)

      // Slightly fainter / slower dash → cross-zone line reads differently from local
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.lineDashOffset = -(t * 0.028 % 10)
      ctx.strokeStyle = 'rgba(201,168,76,0.36)'
      ctx.lineWidth   = 1.3
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = 'rgba(201,168,76,0.65)'
      if (epToVp) drawArrowhead(ctx, x1, y1, x2, y2)
      if (vpToEp) drawArrowhead(ctx, x2, y2, x1, y1)
      ctx.restore()
    }
  }
}

/**
 * Draw a filled arrowhead pointing FROM (x1,y1) TOWARD (x2,y2).
 * Placed at 65% along the line — clearly near the destination without
 * overlapping the sprite at the centre of the tile.
 */
function drawArrowhead(ctx, x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const ax    = x1 + (x2 - x1) * 0.65
  const ay    = y1 + (y2 - y1) * 0.65
  const size  = 5
  ctx.beginPath()
  ctx.moveTo(ax + Math.cos(angle)       * size,  ay + Math.sin(angle)       * size)
  ctx.lineTo(ax + Math.cos(angle - 2.4) * size,  ay + Math.sin(angle - 2.4) * size)
  ctx.lineTo(ax + Math.cos(angle + 2.4) * size,  ay + Math.sin(angle + 2.4) * size)
  ctx.closePath()
  ctx.fill()
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
