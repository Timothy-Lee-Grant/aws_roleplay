import React from 'react'
import { useGameStore } from '../store/gameStore.js'
import { MISSIONS }     from '../game/constants.js'

export default function HUD() {
  const gold             = useGameStore(s => s.gold)
  const placed           = useGameStore(s => s.placed)
  const completedMissions= useGameStore(s => s.completedMissions)
  const activeMission    = useGameStore(s => s.activeMission)
  const currentMission   = MISSIONS[activeMission]

  return (
    <div style={S.bar}>
      <span style={S.title}>☽ CloudRealm</span>
      <div style={S.divider} />
      <span style={S.missionLabel}>
        Mission {activeMission + 1} —&nbsp;
        <span style={S.missionName}>{currentMission?.name ?? 'All complete!'}</span>
      </span>

      <div style={S.pills}>
        <Pill icon="⚔️" label="Deployed" value={placed.length} />
        <Pill icon="✅" label="Complete"  value={`${completedMissions.size}/3`} />
        <Pill icon="🪙" label="Gold"      value={gold} />
      </div>

      <div style={S.hint}>scroll to zoom · drag to pan</div>
    </div>
  )
}

function Pill({ icon, label, value }) {
  return (
    <div style={S.pill}>
      {icon} {label} <span style={S.pillVal}>{value}</span>
    </div>
  )
}

const S = {
  bar: {
    background: 'var(--bg2)',
    borderBottom: '1px solid var(--border2)',
    height: 52, flexShrink: 0,
    display: 'flex', alignItems: 'center',
    padding: '0 20px', gap: 18,
  },
  title: {
    fontFamily: 'Cinzel, serif', fontSize: 18, fontWeight: 700,
    color: 'var(--gold2)', letterSpacing: 2,
    textShadow: '0 0 18px rgba(201,168,76,0.4)',
    whiteSpace: 'nowrap',
  },
  divider: { width: 1, height: 24, background: 'var(--border)' },
  missionLabel: {
    fontFamily: 'Cinzel, serif', fontSize: 12, color: 'var(--gold)', flex: 1,
  },
  missionName: {
    fontFamily: "'Crimson Text', serif", fontSize: 14, color: 'var(--text2)',
  },
  pills: { display: 'flex', gap: 12, alignItems: 'center' },
  pill: {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 20, padding: '4px 12px',
    fontSize: 12, color: 'var(--text2)',
    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
  },
  pillVal: {
    fontFamily: 'Cinzel, serif', fontWeight: 600,
    color: 'var(--gold2)', fontSize: 12,
  },
  hint: {
    fontSize: 10, color: 'var(--text3)',
    fontFamily: "'Crimson Text', serif", fontStyle: 'italic',
    whiteSpace: 'nowrap',
  },
}
