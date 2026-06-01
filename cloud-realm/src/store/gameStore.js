import { create } from 'zustand'
import { SERVICES, MISSIONS } from '../game/constants.js'
import { buildGrid, getNeighbors, canPlaceHere } from '../game/hexGrid.js'

/**
 * The Zustand store holds ALL game state and every action that mutates it.
 *
 * Key architectural principle: this store knows nothing about React components
 * or canvas. It's pure data + pure functions. Components read from it via hooks.
 * The canvas RAF loop reads from it via refs (to avoid restarting the loop).
 */
export const useGameStore = create((set, get) => ({

  // ── Game state ──────────────────────────────────────────────────────────────
  grid:              buildGrid(),   // 2D array of { terrain, service }
  placed:            [],            // [{ id, row, col, zone, conns }]
  selectedServiceId: null,          // currently selected service from palette
  gold:              100,
  completedMissions: new Set(),
  activeMission:     0,

  // ── Camera (pan + zoom for the canvas) ─────────────────────────────────────
  panX:   40,
  panY:   20,
  zoom:   1.0,

  // ── Derived: expose getNeighbors so mission checks can use it ───────────────
  getNeighbors,

  // ── Actions ─────────────────────────────────────────────────────────────────

  selectService(id) {
    const current = get().selectedServiceId
    set({ selectedServiceId: current === id ? null : id })
  },

  clearSelection() {
    set({ selectedServiceId: null })
  },

  /**
   * Try to place the currently selected service on hex (row, col).
   * Returns { ok, message } so the UI can show a toast.
   */
  placeService(row, col) {
    const { grid, placed, selectedServiceId, gold } = get()
    if (!selectedServiceId) return { ok: false, message: 'No service selected' }

    const svcDef  = SERVICES.find(s => s.id === selectedServiceId)
    const cell    = grid[row][col]

    // Validation
    if (cell.service)
      return { ok: false, message: 'Tile already occupied' }

    if (!canPlaceHere(cell.terrain, svcDef))
      return { ok: false, message: zoneMessage(svcDef) }

    const alreadyPlaced = placed.filter(p => p.id === selectedServiceId).length
    if (alreadyPlaced >= svcDef.max)
      return { ok: false, message: `All ${svcDef.fantasy}s already deployed` }

    if (gold < svcDef.cost)
      return { ok: false, message: 'Not enough gold 🪙' }

    // Apply
    const newGrid = grid.map(r => r.map(c => ({ ...c })))
    newGrid[row][col].service = selectedServiceId

    const newPlaced = [...placed, {
      id:   selectedServiceId,
      row, col,
      zone: cell.terrain,
      conns: svcDef.conns,
    }]

    set({
      grid:    newGrid,
      placed:  newPlaced,
      gold:    gold - svcDef.cost,
      selectedServiceId: null,   // clear selection after placing
    })

    return { ok: true, message: `${svcDef.fantasy} deployed!` }
  },

  /**
   * Remove a service from hex (row, col), refunding 50% of its cost.
   */
  removeService(row, col) {
    const { grid, placed, gold } = get()
    const cell = grid[row][col]
    if (!cell.service) return { ok: false, message: 'Nothing to remove' }

    const svcDef  = SERVICES.find(s => s.id === cell.service)
    const refund  = Math.floor(svcDef.cost * 0.5)

    const newGrid = grid.map(r => r.map(c => ({ ...c })))
    newGrid[row][col].service = null

    set({
      grid:   newGrid,
      placed: placed.filter(p => !(p.row === row && p.col === col)),
      gold:   gold + refund,
    })

    return { ok: true, message: `${svcDef.fantasy} recalled. +${refund}🪙 refund` }
  },

  completeMission(id) {
    const { completedMissions, gold, activeMission } = get()
    const mission = MISSIONS.find(m => m.id === id)
    if (!mission || completedMissions.has(id)) return

    const next = new Set(completedMissions)
    next.add(id)

    set({
      completedMissions: next,
      gold: gold + mission.reward,
      activeMission: Math.min(activeMission + 1, MISSIONS.length - 1),
    })
  },

  // ── Camera controls ─────────────────────────────────────────────────────────

  setCamera({ panX, panY, zoom }) {
    set(s => ({
      panX: panX !== undefined ? panX : s.panX,
      panY: panY !== undefined ? panY : s.panY,
      zoom: zoom !== undefined ? Math.max(0.4, Math.min(3.5, zoom)) : s.zoom,
    }))
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zoneMessage(svcDef) {
  const map = {
    public:  `${svcDef.fantasy} belongs in the Public Subnet (green)`,
    private: `${svcDef.fantasy} belongs in the Inner Sanctum (teal)`,
    wall:    `${svcDef.fantasy} must go on a Wall or Gate tile`,
    any:     `Place ${svcDef.fantasy} in any subnet tile`,
  }
  return map[svcDef.zone] || 'Cannot place here'
}
