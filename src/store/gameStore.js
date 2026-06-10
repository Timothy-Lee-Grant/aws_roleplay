import { create } from 'zustand'
import { SERVICES, MISSIONS } from '../game/constants.js'
import { buildGrid, getNeighbors, canPlaceHere } from '../game/hexGrid.js'
import {
  playPlacement,
  playRemoval,
  playConnection,
  playMissionComplete,
  playError,
  playSelect,
  playCancelSelection,
  playGoldGain,
} from '../game/audio.js'

/**
 * The Zustand store holds ALL game state and every action that mutates it.
 *
 * Key architectural principle: this store knows nothing about React components
 * or canvas. It's pure data + pure functions. Components read from it via hooks.
 * The canvas RAF loop reads from it via refs (to avoid restarting the loop).
 */
export const useGameStore = create((set, get) => ({

  // ── Phase state machine ─────────────────────────────────────────────────────
  // 'title'  → splash screen, no game state active
  // 'build'  → player places services on the board
  // 'wave'   → traffic simulation running (no placements)
  // 'debrief'→ wave complete, score shown, player can advance to next mission
  phase: 'title',

  // ── Game state ──────────────────────────────────────────────────────────────
  grid:              buildGrid(),   // 2D array of { terrain, service }
  placed:            [],            // [{ id, row, col, zone, conns }]
  selectedServiceId: null,          // currently selected service from palette
  gold:              100,
  // Array (not Set) — Zustand shallow-equality compares by reference.
  // A mutated Set is the same object reference, so Zustand can't detect .add().
  // An array spread ([...completedMissions, id]) creates a new reference → detected.
  completedMissions: [],
  activeMission:     0,

  // ── Tutorial ─────────────────────────────────────────────────────────────────
  // null = tutorial complete/skipped. 0–4 = active step index.
  // Shown on first startGame(); cleared after step 4 or skip.
  tutorialStep: null,

  // ── Wave / debrief data ──────────────────────────────────────────────────────
  // Populated by endWave(); read by DebriefScreen.
  waveResult: null, // { packetsOk, packetsFailed, threats, score, wellArchitected }


  // ── Camera (pan + zoom for the canvas) ─────────────────────────────────────
  panX:   40,
  panY:   20,
  zoom:   1.0,

  // ── Derived: expose getNeighbors so mission checks can use it ───────────────
  getNeighbors,

  // ── Phase transitions ────────────────────────────────────────────────────────

  /** title → build  (new game — triggers in-game tutorial) */
  startGame() {
    set({
      phase:             'build',
      grid:              buildGrid(),
      placed:            [],
      selectedServiceId: null,
      gold:              100,
      completedMissions: [],
      activeMission:     0,
      waveResult:        null,
      tutorialStep:      0,   // start tutorial from step 0
      panX: 40, panY: 20, zoom: 1.0,
    })
  },

  /** title → build  (continue — restore saved state if present) */
  continueGame() {
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('cloudRealm_save')) } catch { return null }
    })()
    if (!saved) {
      get().startGame()
      return
    }
    set({
      phase:             'build',
      grid:              saved.grid   ?? buildGrid(),
      placed:            saved.placed ?? [],
      gold:              saved.gold   ?? 100,
      completedMissions: saved.completedMissions ?? [],
      activeMission:     saved.activeMission     ?? 0,
      selectedServiceId: null,
      waveResult:        null,
      panX: 40, panY: 20, zoom: 1.0,
    })
  },

  /** build → wave */
  startWave() {
    set({ phase: 'wave', selectedServiceId: null })
  },

  /**
   * wave → debrief
   * result: { packetsOk, packetsFailed, threats, score, wellArchitected }
   * Pass a stub result for now; the real simulation engine fills this in Phase 2.
   */
  endWave(result) {
    set({ phase: 'debrief', waveResult: result })
  },

  /** debrief → build  (next mission — keep board state so player can improve) */
  continueFromDebrief() {
    set({ phase: 'build', waveResult: null })
  },

  /** Advance tutorial to next step, or end it */
  advanceTutorial() {
    const { tutorialStep } = get()
    if (tutorialStep === null) return
    if (tutorialStep >= 4) {
      set({ tutorialStep: null })   // all steps done — hide overlay
    } else {
      set({ tutorialStep: tutorialStep + 1 })
    }
  },

  /** Skip tutorial entirely */
  skipTutorial() {
    set({ tutorialStep: null })
  },

  // ── Actions ─────────────────────────────────────────────────────────────────

  selectService(id) {
    const current = get().selectedServiceId
    // Toggling off is a cancel; toggling on (or switching) is a select
    if (current === id) {
      playCancelSelection()
      set({ selectedServiceId: null })
    } else {
      playSelect()
      set({ selectedServiceId: id })
    }
  },

  clearSelection() {
    if (get().selectedServiceId) playCancelSelection()
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

    // Validation — play error sound and return early on any failure
    if (cell.service) {
      playError()
      return { ok: false, message: 'Tile already occupied' }
    }
    if (!canPlaceHere(cell.terrain, svcDef)) {
      playError()
      return { ok: false, message: zoneMessage(svcDef) }
    }
    const alreadyPlaced = placed.filter(p => p.id === selectedServiceId).length
    if (alreadyPlaced >= svcDef.max) {
      playError()
      return { ok: false, message: `All ${svcDef.fantasy}s already deployed` }
    }
    if (gold < svcDef.cost) {
      playError()
      return { ok: false, message: 'Not enough gold 🪙' }
    }

    // Apply
    const newGrid = grid.map(r => r.map(c => ({ ...c })))
    newGrid[row][col].service = selectedServiceId

    const newEntry = { id: selectedServiceId, row, col, zone: cell.terrain, conns: svcDef.conns }
    const newPlaced = [...placed, newEntry]

    set({
      grid:    newGrid,
      placed:  newPlaced,
      gold:    gold - svcDef.cost,
      selectedServiceId: null,
    })

    // ── Audio ──
    // 1. Unique placement sound for this service
    playPlacement(selectedServiceId)

    // 2. For every adjacent service that now has a valid connection, play
    //    a brief connection chime (staggered so they don't all fire at once)
    const nbrs = getNeighbors(row, col)
    let connectionCount = 0
    for (const { row: nr, col: nc } of nbrs) {
      const nbCell = newGrid[nr]?.[nc]
      if (!nbCell?.service) continue
      const linked = svcDef.conns.includes(nbCell.service) ||
        SERVICES.find(s => s.id === nbCell.service)?.conns?.includes(selectedServiceId)
      if (linked) {
        // Small delay per connection so chimes cascade rather than stack
        setTimeout(() => playConnection(), 180 + connectionCount * 120)
        connectionCount++
      }
    }

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

    playRemoval()
    if (refund > 0) setTimeout(() => playGoldGain(), 220)

    return { ok: true, message: `${svcDef.fantasy} recalled. +${refund}🪙 refund` }
  },

  completeMission(id) {
    const { completedMissions, gold, activeMission } = get()
    const mission = MISSIONS.find(m => m.id === id)
    if (!mission || completedMissions.includes(id)) return

    set({
      completedMissions: [...completedMissions, id],   // new array → Zustand detects change
      gold: gold + mission.reward,
      activeMission: Math.min(activeMission + 1, MISSIONS.length - 1),
    })

    playMissionComplete()
    // Gold reward jingle slightly after the fanfare starts
    setTimeout(() => playGoldGain(), 520)
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

// ─── Persistence ─────────────────────────────────────────────────────────────
// Save relevant slice to localStorage whenever it changes.
// Restore happens in continueGame() above.
useGameStore.subscribe(
  state => ({
    grid:              state.grid,
    placed:            state.placed,
    gold:              state.gold,
    completedMissions: state.completedMissions,
    activeMission:     state.activeMission,
  }),
  snapshot => {
    try { localStorage.setItem('cloudRealm_save', JSON.stringify(snapshot)) } catch { /* quota */ }
  },
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zoneMessage(svcDef) {
  const map = {
    // Edge = internet-edge services that live OUTSIDE the VPC (top row of the board)
    edge:    `${svcDef.fantasy} must go on an Edge tile — the blue strip outside the VPC wall`,
    public:  `${svcDef.fantasy} belongs in the Public Subnet (green tiles)`,
    private: `${svcDef.fantasy} belongs in the Inner Sanctum (teal tiles)`,
    wall:    `${svcDef.fantasy} must go on a Wall or Gate tile`,
    any:     `Place ${svcDef.fantasy} in any subnet tile`,
  }
  return map[svcDef.zone] || 'Cannot place here'
}
