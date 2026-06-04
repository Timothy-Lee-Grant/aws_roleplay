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

