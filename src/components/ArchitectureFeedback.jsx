import React, { useMemo } from 'react'
import { useGameStore }         from '../store/gameStore.js'
import { validateArchitecture } from '../game/validator.js'

/**
 * ArchitectureFeedback — real-time panel showing anti-patterns and
 * best-practice feedback based on the current board state.
 *
 * Rendered as a collapsible section inside MissionPanel (below missions).
 * Updates instantly whenever placed[] changes.
 */

const SEVERITY_CONFIG = {
  critical: { color: '#e05040', bg: 'rgba(160,40,30,0.12)', icon: '⛔', label: 'Critical' },
  warning:  { color: '#e09040', bg: 'rgba(160,100,30,0.12)', icon: '⚠️', label: 'Warning'  },
  info:     { color: '#60a0e0', bg: 'rgba(60,100,160,0.12)', icon: 'ℹ️', label: 'Info'     },
}

function FeedbackItem({ warning }) {
  const { color, bg, icon } = SEVERITY_CONFIG[warning.severity] ?? SEVERITY_CONFIG.info

  return (
    <div style={{ ...S.item, background: bg, borderLeft: `2px solid ${color}` }}>
      <div style={S.itemHeader}>
        <span style={{ fontSize: '12px' }}>{icon}</span>
        <span style={{ ...S.itemTitle, color }}>{warning.title}</span>
      </div>
      <p style={S.itemBody}>{warning.message}</p>
    </div>
  )
}

export default function ArchitectureFeedback() {
  const placed      = useGameStore(s => s.placed)
  const getNeighbors = useGameStore(s => s.getNeighbors)

  const warnings = useMemo(
    () => validateArchitecture(placed, getNeighbors),
    [placed, getNeighbors]
  )

  if (warnings.length === 0 && placed.length === 0) return null

  const criticals = warnings.filter(w => w.severity === 'critical')
  const rest      = warnings.filter(w => w.severity !== 'critical')

  // Summary badge counts
  const nCrit = criticals.length
  const nWarn = warnings.filter(w => w.severity === 'warning').length
  const nInfo = warnings.filter(w => w.severity === 'info').length

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerTitle}>⚙ Architecture Review</span>
        <div style={S.badges}>
          {nCrit > 0 && <Badge count={nCrit} color="#e05040" />}
          {nWarn > 0 && <Badge count={nWarn} color="#e09040" />}
          {nInfo > 0 && <Badge count={nInfo} color="#60a0e0" />}
          {warnings.length === 0 && placed.length > 0 && (
            <span style={S.allGood}>✓ All good</span>
          )}
        </div>
      </div>

      {warnings.length === 0 && placed.length > 0 && (
        <p style={S.emptyText}>
          No anti-patterns detected. Your current architecture follows AWS best practices.
        </p>
      )}

      {/* Critical first */}
      {criticals.map(w => <FeedbackItem key={w.code} warning={w} />)}
      {rest.map(w => <FeedbackItem key={w.code} warning={w} />)}
    </div>
  )
}

function Badge({ count, color }) {
  return (
    <span style={{
      background: color + '22',
      border: `1px solid ${color}44`,
      borderRadius: '10px',
      padding: '1px 7px',
      fontSize: '10px',
      color,
      fontFamily: "'Cinzel', serif",
      fontWeight: 600,
    }}>{count}</span>
  )
}

const S = {
  root: {
    borderTop: '1px solid rgba(96,120,64,0.15)',
    padding: '14px 14px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
    maxHeight: '260px',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '2px',
  },
  headerTitle: {
    fontFamily: "'Cinzel', serif",
    fontSize: '10px', letterSpacing: '0.18em',
    color: '#4a6a40', textTransform: 'uppercase',
  },
  badges: {
    display: 'flex', gap: '5px', alignItems: 'center',
  },
  allGood: {
    fontSize: '10px', color: '#4a8040',
    fontFamily: "'Cinzel', serif", letterSpacing: '0.1em',
  },
  emptyText: {
    fontSize: '11px', color: '#3a5030',
    fontFamily: 'sans-serif', lineHeight: 1.6,
    margin: 0,
  },
  item: {
    borderRadius: '3px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  itemHeader: {
    display: 'flex', alignItems: 'center', gap: '6px',
  },
  itemTitle: {
    fontSize: '11px', fontFamily: "'Cinzel', serif",
    letterSpacing: '0.04em', fontWeight: 600,
  },
  itemBody: {
    fontSize: '10px', color: '#5a7a58',
    fontFamily: 'sans-serif', lineHeight: 1.6,
    margin: 0,
  },
}
