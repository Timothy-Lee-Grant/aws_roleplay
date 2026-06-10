import {
  COLS, ROWS, HEX_R, COL_STEP, ROW_STEP,
  BOARD_PAD_X, BOARD_PAD_Y,
  TERRAIN,
} from './constants.js'
// NOTE: TERRAIN_COLOR and TERRAIN_STROKE (from constants.js) are intentionally NOT
// imported here. They were only used by the removed drawGrid() / drawConnections()
// dead-code exports. The live rendering uses TERRAIN_FILL / TERRAIN_STROKE_MAP
// defined locally in GameBoard.jsx, which is the only file that draws to canvas.

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
 *
 * Uses proper axial cube-coordinate rounding for pointy-top hex grids.
 * The old approach (Math.round(py / ROW_STEP)) created a ~10px dead zone at
 * the top and bottom of each tile because hex rows overlap by HEX_R * 0.5 —
 * the simple round snaps to the wrong row for clicks in that overlap band.
 *
 * The cube-rounding algorithm works in 3D (x + y + z = 0 constraint) and
 * always produces the nearest hex centre, even in the overlap band.
 *
 * Derivation:
 *   Pointy-top axial formula (exact inverse of hexCenter):
 *     q = (√3/3 · px − 1/3 · py) / HEX_R
 *     r = (2/3 · py) / HEX_R
 *   where px = wx − BOARD_PAD_X, py = wy − BOARD_PAD_Y.
 *
 *   Then cube-round (q, −q−r, r), reset the largest-delta component to
 *   maintain x+y+z=0, and convert back to odd-r offset.
 */
export function pixelToHex(wx, wy) {
  const px = wx - BOARD_PAD_X
  const py = wy - BOARD_PAD_Y

  // Pointy-top axial coordinates (exact inverse of hexCenter)
  const q = (Math.sqrt(3) / 3 * px - 1 / 3 * py) / HEX_R
  const r = (2 / 3 * py) / HEX_R

  // Cube coordinates (x + y + z = 0 is always satisfied here)
  let cx = q, cy = -q - r, cz = r

  // Round each axis independently
  let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz)

  // The rounded values may violate x+y+z=0 by ±1.
  // Fix it by resetting the component with the largest rounding error.
  const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz)
  if      (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz)             ry = -rx - rz
  else                          rz = -rx - ry

  // Convert axial (rx = q, rz = r) back to odd-r offset
  const col = rx + (rz - (rz & 1)) / 2
  const row = rz

  return {
    row: Math.max(0, Math.min(ROWS - 1, row)),
    col: Math.max(0, Math.min(COLS - 1, col)),
  }
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
 * Build the initial 2D grid.
 *
 * Each cell: { terrain, service: null, az: 'az1'|'az2'|'boundary'|null }
 *
 * Multi-AZ layout (col 5 = AZ boundary divider):
 *   AZ-1: cols 2–4  (public + private subnet)
 *   AZ boundary: col 5  (AZ_BOUNDARY terrain — no service placement allowed)
 *   AZ-2: cols 6–8  (public + private subnet)
 *
 * Real AWS: deploying across Availability Zones is the foundation of high
 * availability. Each AZ is an isolated data centre. If AZ-1 fails, AZ-2
 * continues serving traffic — but only if you placed resources in both.
 */
export function buildGrid() {
  const g = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ terrain: TERRAIN.OUTSIDE, service: null, az: null }))
  )

  // VPC wall border
  ;[[1,[2,8]],[2,[1,9]],[3,[1,9]],[4,[1,9]],[5,[1,9]],[6,[1,9]],[7,[2,8]]].forEach(([r,[a,b]])=>{
    for (let c = a; c <= b; c++) g[r][c].terrain = TERRAIN.WALL
  })

  // Public subnet — cols 2–4 (AZ-1) and 6–8 (AZ-2); col 5 stays WALL for now
  ;[[2,[2,4]],[3,[2,4]],[4,[2,4]],[5,[2,4]],[6,[2,4]],
    [2,[6,8]],[3,[6,8]],[4,[6,8]],[5,[6,8]],[6,[6,8]]].forEach(([r,[a,b]])=>{
    for (let c = a; c <= b; c++) g[r][c].terrain = TERRAIN.PUBLIC
  })

  // Private subnet — AZ-1 cols 3–4, AZ-2 cols 6–7 (col 5 never private)
  ;[[3,[3,4]],[4,[3,4]],[5,[3,4]],
    [3,[6,7]],[4,[6,7]],[5,[6,7]]].forEach(([r,[a,b]])=>{
    for (let c = a; c <= b; c++) g[r][c].terrain = TERRAIN.PRIVATE
  })

  // Gate tiles on the top and bottom wall (VPC attachment points)
  g[1][2].terrain = TERRAIN.GATE   // AZ-1 top entry
  g[1][7].terrain = TERRAIN.GATE   // AZ-2 top entry
  g[7][2].terrain = TERRAIN.GATE   // AZ-1 bottom entry
  g[7][7].terrain = TERRAIN.GATE   // AZ-2 bottom entry

  // AZ Boundary column — col 5, rows 1–7 (within the VPC)
  // Non-placeable; acts as visual separator between the two Availability Zones.
  for (let r = 1; r <= 7; r++) {
    g[r][5].terrain = TERRAIN.AZ_BOUNDARY
  }

  // Edge zone: the row outside the VPC wall (row 0, cols 2–8).
  // Internet-edge AWS services (IGW, CloudFront, S3, Route53) live here —
  // outside the VPC entirely, not in any subnet.
  for (let c = 2; c <= 8; c++) g[0][c].terrain = TERRAIN.EDGE

  // ── Assign AZ properties ──────────────────────────────────────────────────
  // All cells inside the VPC (wall rows 1–7) get an az tag based on column.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = g[r][c]
      if (c >= 2 && c <= 4 && r >= 1 && r <= 7) cell.az = 'az1'
      else if (c === 5 && r >= 1 && r <= 7)      cell.az = 'boundary'
      else if (c >= 6 && c <= 8 && r >= 1 && r <= 7) cell.az = 'az2'
      // else: edge, outside, void → az stays null
    }
  }

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

// ─── Zone / placement helpers ─────────────────────────────────────────────────

export function canPlaceHere(terrain, svcDef) {
  if (!svcDef) return false
  // AZ_BOUNDARY tiles can never host services — they are visual dividers only.
  if (terrain === TERRAIN.AZ_BOUNDARY) return false
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

