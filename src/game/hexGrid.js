import {
  COLS, ROWS, HEX_R, COL_STEP, ROW_STEP,
  BOARD_PAD_X, BOARD_PAD_Y,
  TERRAIN, TERRAIN_COLOR, TERRAIN_STROKE,
} from './constants.js'

// ─── Coordinate conversions ───────────────────────────────────────────────────

/**
 * Convert grid (row, col) to world-space pixel centre.
 * Uses odd-r offset layout (odd rows shifted right by half a column).
 */
export function hexCenter(row, col) {
  const x = BOARD_PAD_X + col * COL_STEP + (row % 2 === 1 ? COL_STEP / 2 : 0)
  const y = BOARD_PAD_Y + row * ROW_STEP
  return { x, y }
}

/**
 * Convert a world-space pixel coordinate back to the nearest hex (row, col).
 * This is the inverse of hexCenter — used for click detection.
 */
export function pixelToHex(wx, wy) {
  // Undo the board padding
  const px = wx - BOARD_PAD_X
  const py = wy - BOARD_PAD_Y

  // Estimate row first (each row is ROW_STEP apart)
  let row = Math.round(py / ROW_STEP)

  // For odd rows, subtract the column offset before estimating column
  const isOdd = row % 2 === 1
  const adjustedX = isOdd ? px - COL_STEP / 2 : px
  let col = Math.round(adjustedX / COL_STEP)

  // Clamp to valid grid range
  row = Math.max(0, Math.min(ROWS - 1, row))
  col = Math.max(0, Math.min(COLS - 1, col))
  return { row, col }
}

// ─── Neighbour calculation ────────────────────────────────────────────────────

/**
 * Returns all valid grid neighbours of (row, col).
 * Direction vectors differ for even vs odd rows in the odd-r offset scheme.
 */
export function getNeighbors(row, col) {
  const isOdd = row % 2 === 1
  const dirs = isOdd
    ? [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]]
    : [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]]
  return dirs
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter(({ row: r, col: c }) => r >= 0 && r < ROWS && c >= 0 && c < COLS)
}

// ─── Grid initialisation ─────────────────────────────────────────────────────

/**
 * Build the initial 2D grid. Each cell: { terrain, service: null }
 */
export function buildGrid() {
  const g = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ terrain: TERRAIN.OUTSIDE, service: null }))
  )

  // VPC wall border
  ;[[1,[2,8]],[2,[1,9]],[3,[1,9]],[4,[1,9]],[5,[1,9]],[6,[1,9]],[7,[2,8]]].forEach(([r,[a,b]])=>{
    for (let c = a; c <= b; c++) g[r][c].terrain = TERRAIN.WALL
  })

  // Public subnet
  ;[[2,[2,8]],[3,[2,8]],[4,[2,8]],[5,[2,8]],[6,[2,8]]].forEach(([r,[a,b]])=>{
    for (let c = a; c <= b; c++) g[r][c].terrain = TERRAIN.PUBLIC
  })

  // Private subnet (inner sanctum)
  ;[[3,[4,7]],[4,[3,7]],[5,[4,7]]].forEach(([r,[a,b]])=>{
    for (let c = a; c <= b; c++) g[r][c].terrain = TERRAIN.PRIVATE
  })

  // Gate tiles
  g[1][5].terrain = TERRAIN.GATE
  g[7][5].terrain = TERRAIN.GATE

  // Edge zone: the row outside the VPC wall (row 0, cols 2–8).
  // This is where internet-edge AWS services live: IGW, CloudFront, S3.
  // They are NOT inside the VPC — they sit at the boundary of AWS infrastructure.
  // In real AWS: IGW attaches to the VPC (not inside it). CloudFront and S3 are
  // regional/global services that exist entirely outside any VPC subnet.
  for (let c = 2; c <= 8; c++) g[0][c].terrain = TERRAIN.EDGE

  return g
}

// ─── Canvas drawing ───────────────────────────────────────────────────────────

/**
 * Draw a single hex tile at world-space centre (cx, cy) with radius r.
 * Pointy-top orientation: vertex at top (angle = -π/2), then every 60°.
 */
export function drawHexPath(ctx, cx, cy, r = HEX_R) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2
    const x = cx + r * Math.cos(a)
    const y = cy + r * Math.sin(a)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/**
 * Draw the full hex grid — all terrain fills and borders.
 * `selectedId` and `placed` are passed in so we can highlight valid/invalid tiles.
 */
export function drawGrid(ctx, grid, selectedServiceDef, placed, t) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c]
      const { x, y } = hexCenter(r, c)
      const terrain = cell.terrain

      // Base fill
      drawHexPath(ctx, x, y)
      ctx.fillStyle = TERRAIN_COLOR[terrain] || '#0a0c10'
      ctx.fill()

      // Selection-mode overlay: pulse valid tiles, dim invalid ones
      if (selectedServiceDef && !cell.service) {
        const valid = canPlaceHere(terrain, selectedServiceDef)
        if (valid) {
          const pulse = (Math.sin(t * 0.006) + 1) / 2   // 0→1→0
          drawHexPath(ctx, x, y)
          ctx.fillStyle = `rgba(100,200,100,${0.08 + pulse * 0.18})`
          ctx.fill()
        } else if (terrain !== TERRAIN.OUTSIDE && terrain !== TERRAIN.VOID) {
          drawHexPath(ctx, x, y)
          ctx.fillStyle = 'rgba(0,0,0,0.35)'
          ctx.fill()
        }
      }

      // Wall hash pattern
      if (terrain === TERRAIN.WALL || terrain === TERRAIN.GATE) {
        ctx.save()
        drawHexPath(ctx, x, y)
        ctx.clip()
        ctx.strokeStyle = 'rgba(80,140,60,0.18)'
        ctx.lineWidth = 0.8
        for (let d = -HEX_R * 2; d < HEX_R * 2; d += 6) {
          ctx.beginPath()
          ctx.moveTo(x - HEX_R, y + d)
          ctx.lineTo(x + HEX_R, y + d - HEX_R)
          ctx.stroke()
        }
        ctx.restore()
      }

      // Stroke border
      drawHexPath(ctx, x, y)
      ctx.strokeStyle = TERRAIN_STROKE[terrain] || '#111'
      ctx.lineWidth = 0.8
      ctx.stroke()

      // Gate glow ring
      if (terrain === TERRAIN.GATE) {
        const glow = (Math.sin(t * 0.004) + 1) / 2
        drawHexPath(ctx, x, y, HEX_R - 4)
        ctx.strokeStyle = `rgba(180,220,80,${0.2 + glow * 0.3})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }
  }
}

// ─── Zone / placement helpers ─────────────────────────────────────────────────

export function canPlaceHere(terrain, svcDef) {
  if (!svcDef) return false
  // Edge-zone services (IGW, CloudFront, S3) live OUTSIDE the VPC —
  // they must go on edge tiles (row 0 strip), not inside any subnet.
  if (svcDef.zone === 'edge'    && terrain !== TERRAIN.EDGE)    return false
  if (svcDef.zone === 'public'  && terrain !== TERRAIN.PUBLIC)  return false
  if (svcDef.zone === 'private' && terrain !== TERRAIN.PRIVATE) return false
  if (svcDef.zone === 'wall'    && terrain !== TERRAIN.GATE && terrain !== TERRAIN.WALL) return false
  // 'any' = Lambda, IAM, SG, RT — they can go in either subnet
  if (svcDef.zone === 'any'     && terrain !== TERRAIN.PUBLIC && terrain !== TERRAIN.PRIVATE) return false
  return true
}

/**
 * Draw dotted connection lines between adjacent placed services that can communicate.
 */
export function drawConnections(ctx, grid, placed, t) {
  const drawn = new Set()

  for (const p of placed) {
    const nbrs = getNeighbors(p.row, p.col)
    for (const { row: nr, col: nc } of nbrs) {
      const nb = grid[nr]?.[nc]
      if (!nb?.service) continue

      const key = [p.id + p.row + p.col, nb.service + nr + nc].sort().join('|')
      if (drawn.has(key)) continue
      drawn.add(key)

      const linked = p.conns?.includes(nb.service) || false

      const { x: x1, y: y1 } = hexCenter(p.row, p.col)
      const { x: x2, y: y2 } = hexCenter(nr, nc)

      const dashOffset = -(t * 0.04 % 12)  // animated dash flow

      ctx.save()
      ctx.setLineDash([5, 4])
      ctx.lineDashOffset = dashOffset
      ctx.strokeStyle = linked ? 'rgba(201,168,76,0.55)' : 'rgba(80,76,70,0.3)'
      ctx.lineWidth   = linked ? 1.5 : 0.6
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      ctx.restore()

      if (linked) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
        ctx.beginPath()
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(201,168,76,0.8)'
        ctx.fill()
      }
    }
  }
}
