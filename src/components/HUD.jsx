import React, { useState, useCallback } from 'react'
import { useGameStore }       from '../store/gameStore.js'
import { MISSIONS }           from '../game/constants.js'
import { toggleMute, isMuted } from '../game/audio.js'

export default function HUD() {
  const gold              = useGameStore(s => s.gold)
  const placed            = useGameStore(s => s.placed)
  const completedMissions = useGameStore(s => s.completedMissions)
  const activeMission     = useGameStore(s => s.activeMission)
  const phase             = useGameStore(s => s.phase)
  const waveTimer         = useGameStore(s => s.waveTimer)
  const waveStats         = useGameStore(s => s.waveStats)
  const startWave         = useGameStore(s => s.startWave)
  const currentMission    = MISSIONS[activeMission]

  // Local state tracks mute icon — mirrors the audio module's mute flag
  const [muted, setMuted] = useState(false)

  const handleMute = useCallback(() => {
    const nowMuted = toggleMute()
    setMuted(nowMuted)
  }, [])

  // "Unleash the Traffic" — starts the wave phase.
  // GameBoard's RAF loop drives the real simulation and calls endWave() when the timer runs out.
  const handleUnleash = useCallback(() => {
    startWave()
  }, [startWave])

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
        <Pill icon="✅" label="Complete"  value={`${completedMissions.length}/${MISSIONS.length}`} />
        <Pill icon="🪙" label="Gold"      value={gold} />
      </div>

      {/* Wave trigger — only shown during build phase */}
      {phase === 'build' && placed.length >= 2 && (
        <button
          style={S.unleashBtn}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #5a1a10 0%, #3a0e08 100%)'; e.currentTarget.style.borderColor = 'rgba(200,80,60,0.8)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #3a1010 0%, #280a08 100%)'; e.currentTarget.style.borderColor = 'rgba(160,60,40,0.5)' }}
          onClick={handleUnleash}
          title="Send a wave of traffic through your architecture"
        >
          ⚡ Unleash the Traffic
        </button>
      )}

      {/* Wave-phase HUD: countdown + live packet stats */}
      {phase === 'wave' && (
        <div style={S.waveBar}>
          <span style={{ ...S.timerNum, color: waveTimer <= 10 ? '#ff6060' : '#60e090' }}>
            ⏱ {waveTimer}s
          </span>
          <div style={S.divider} />
          <span style={S.waveStatOk}>✓ {waveStats.packetsOk}</span>
          <span style={S.waveStatFail}>✗ {waveStats.packetsFailed}</span>
          {waveStats.threatsStruck > 0 && (
            <span style={S.waveStatThreat}>💀 {waveStats.threatsStruck}</span>
          )}
        </div>
      )}

      <div style={S.hint}>scroll to zoom · alt+drag to pan</div>

      <button
        style={{ ...S.muteBtn, ...(muted ? S.muteBtnMuted : {}) }}
        onClick={handleMute}
        title={muted ? 'Unmute' : 'Mute'}
        aria-label={muted ? 'Unmute audio' : 'Mute audio'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
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
  unleashBtn: {
    background: 'linear-gradient(180deg, #3a1010 0%, #280a08 100%)',
    border: '1px solid rgba(160,60,40,0.5)',
    borderRadius: '3px',
    color: '#e08060',
    fontFamily: "'Cinzel', serif",
    fontSize: '12px',
    letterSpacing: '0.1em',
    padding: '6px 14px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
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
  waveBar: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 20, padding: '4px 14px',
    fontSize: 12, flexShrink: 0,
  },
  timerNum: {
    fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: 13,
    letterSpacing: '0.05em', transition: 'color 0.3s',
  },
  waveStatOk:    { color: '#60e090', fontFamily: 'Cinzel, serif', fontSize: 12 },
  waveStatFail:  { color: '#e06060', fontFamily: 'Cinzel, serif', fontSize: 12 },
  waveStatThreat:{ color: '#e08060', fontFamily: 'Cinzel, serif', fontSize: 12 },
  muteBtn: {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '5px 10px',
    fontSize: 16, cursor: 'pointer',
    lineHeight: 1, transition: 'border-color 0.15s, opacity 0.15s',
    flexShrink: 0,
  },
  muteBtnMuted: {
    opacity: 0.45,
    borderColor: 'var(--border2)',
  },
}
