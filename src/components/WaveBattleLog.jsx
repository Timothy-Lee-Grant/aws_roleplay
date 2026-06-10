import React from 'react'
import { useGameStore } from '../store/gameStore.js'

/**
 * WaveBattleLog — right panel shown during the wave phase.
 *
 * Displays:
 *  - Live stat counters (packets delivered, failed, threats struck)
 *  - Scrolling event log with color-coded severity
 *
 * Replaces MissionPanel in the right column while phase === 'wave'.
 * The GameBoard's RAF loop drives all updates via dispatchSimEvents().
 */
export default function WaveBattleLog() {
  const waveStats = useGameStore(s => s.waveStats)
  const battleLog = useGameStore(s => s.battleLog)
  const waveTimer = useGameStore(s => s.waveTimer)

  const { packetsOk, packetsFailed, threatsStruck } = waveStats

  return (
    <div style={S.panel}>
      <div style={S.header}>⚡ Battle Report</div>

      {/* Countdown ring + summary */}
      <div style={S.timerRow}>
        <div style={S.timerBox}>
          <div style={{ ...S.timerNum, color: waveTimer <= 10 ? '#ff6060' : '#60e0a0' }}>
            {waveTimer}
          </div>
          <div style={S.timerLabel}>SECONDS</div>
        </div>
        <div style={S.statGrid}>
          <StatBox icon="📦" label="Delivered" value={packetsOk}     color="#60e0a0" />
          <StatBox icon="💔" label="Failed"    value={packetsFailed}  color="#e06060" />
          <StatBox icon="💀" label="Threats"   value={threatsStruck}  color="#e08060" />
        </div>
      </div>

      {/* Divider */}
      <div style={S.divider} />

      {/* Live event log */}
      <div style={S.logHeader}>Event Log</div>
      <div style={S.log}>
        {battleLog.length === 0 && (
          <p style={S.empty}>Awaiting traffic…</p>
        )}
        {battleLog.map((entry, i) => (
          <LogEntry key={`${entry.t}_${i}`} entry={entry} />
        ))}
      </div>

      {/* Bottom hint */}
      <div style={S.foot}>
        Watch the board — packets travel your connections in real time.
      </div>
    </div>
  )
}

function StatBox({ icon, label, value, color }) {
  return (
    <div style={S.statBox}>
      <div style={S.statIcon}>{icon}</div>
      <div style={{ ...S.statVal, color }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  )
}

function LogEntry({ entry }) {
  const cfg = entry.type === 'threat'
    ? { bg: 'rgba(160,40,30,0.12)', border: '#e05040', icon: '⚠️' }
    : entry.type === 'fail'
    ? { bg: 'rgba(160,60,30,0.10)', border: '#e08040', icon: '✗' }
    : { bg: 'rgba(40,100,60,0.10)', border: '#40a060', icon: '✓' }

  return (
    <div style={{ ...S.logEntry, background: cfg.bg, borderLeft: `2px solid ${cfg.border}` }}>
      <span style={S.logIcon}>{cfg.icon}</span>
      <span style={S.logText}>{entry.text}</span>
    </div>
  )
}

const S = {
  panel: {
    background: 'var(--bg2)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '13px 16px 10px',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'Cinzel, serif',
    fontSize: 11,
    letterSpacing: '1.5px',
    color: 'var(--gold)',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  timerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 16px 12px',
    flexShrink: 0,
  },
  timerBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 14px',
    flexShrink: 0,
    minWidth: 58,
  },
  timerNum: {
    fontFamily: 'Cinzel, serif',
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1,
    transition: 'color 0.3s',
  },
  timerLabel: {
    fontSize: 9,
    color: 'var(--text3)',
    fontFamily: 'Cinzel, serif',
    letterSpacing: '0.15em',
    marginTop: 4,
  },
  statGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
  },
  statBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '5px 10px',
  },
  statIcon: { fontSize: 14 },
  statVal: {
    fontFamily: 'Cinzel, serif',
    fontSize: 14,
    fontWeight: 700,
    minWidth: 24,
  },
  statLabel: {
    fontSize: 10,
    color: 'var(--text3)',
    letterSpacing: '0.1em',
    fontFamily: 'Cinzel, serif',
  },
  divider: {
    height: 1,
    background: 'var(--border)',
    margin: '0 0 0 0',
    flexShrink: 0,
  },
  logHeader: {
    padding: '8px 16px 4px',
    fontSize: 9,
    fontFamily: 'Cinzel, serif',
    letterSpacing: '0.2em',
    color: 'var(--text3)',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  log: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  empty: {
    fontSize: 12,
    color: 'var(--text3)',
    fontStyle: 'italic',
    fontFamily: "'Crimson Text', serif",
    textAlign: 'center',
    marginTop: 20,
  },
  logEntry: {
    borderRadius: 3,
    padding: '7px 10px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 7,
  },
  logIcon: {
    fontSize: 12,
    flexShrink: 0,
    marginTop: 1,
  },
  logText: {
    fontSize: 11,
    color: 'var(--text2)',
    lineHeight: 1.55,
    fontFamily: 'sans-serif',
  },
  foot: {
    flexShrink: 0,
    padding: '10px 14px',
    fontSize: 10,
    color: 'var(--text3)',
    fontFamily: "'Crimson Text', serif",
    fontStyle: 'italic',
    borderTop: '1px solid var(--border)',
    textAlign: 'center',
    lineHeight: 1.5,
  },
}
