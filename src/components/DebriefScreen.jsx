import React from 'react'
import { useGameStore }                        from '../store/gameStore.js'
import { MISSIONS, SERVICES, HOURLY_COSTS, REAL_COSTS } from '../game/constants.js'

// ── Well-Architected pillar config ────────────────────────────────────────────
const PILLARS = [
  { key: 'security',             label: 'Security',              max: 40, color: '#e06050' },
  { key: 'reliability',          label: 'Reliability',           max: 20, color: '#60a0e0' },
  { key: 'performance',          label: 'Performance',           max: 20, color: '#80c060' },
  { key: 'costOptimization',     label: 'Cost Optimization',     max: 10, color: '#e0c040' },
  { key: 'operationalExcellence',label: 'Ops Excellence',        max: 10, color: '#a060e0' },
]

function ScoreBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#7a9870', fontFamily: 'sans-serif', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ fontSize: '11px', color: color, fontFamily: "'Cinzel', serif" }}>
          {value}/{max}
        </span>
      </div>
      <div style={{
        height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: '3px', transition: 'width 0.8s ease',
          boxShadow: `0 0 6px ${color}44`,
        }} />
      </div>
    </div>
  )
}

// ── Radar / spider chart ───────────────────────────────────────────────────────
// Pentagon SVG with 5 axes — one per Well-Architected pillar.
// Each axis is normalized 0→1 by its max score.
const RADAR_SIZE  = 160  // px — width/height of the SVG square
const RADAR_CX    = 80
const RADAR_CY    = 84   // slightly lower to give room for labels
const RADAR_R     = 56   // max radius for a full score

function polarToXY(angleDeg, r, cx, cy) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function RadarChart({ pillars, values }) {
  const n = pillars.length
  const step = 360 / n

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Polygon points for each ring
  const ringPoints = rings.map(pct =>
    pillars.map((_, i) => polarToXY(i * step, RADAR_R * pct, RADAR_CX, RADAR_CY)).map(p => p.join(',')).join(' ')
  )

  // Axis lines
  const axes = pillars.map((_, i) => {
    const [x, y] = polarToXY(i * step, RADAR_R, RADAR_CX, RADAR_CY)
    return { x, y }
  })

  // Data polygon — normalize each value by its max
  const dataPoints = pillars.map((p, i) => {
    const ratio = Math.min(1, (values[p.key] ?? 0) / p.max)
    return polarToXY(i * step, RADAR_R * ratio, RADAR_CX, RADAR_CY)
  })
  const dataStr = dataPoints.map(p => p.join(',')).join(' ')

  // Label positions — slightly beyond the grid edge
  const labels = pillars.map((p, i) => {
    const [x, y] = polarToXY(i * step, RADAR_R + 18, RADAR_CX, RADAR_CY)
    return { ...p, x, y, angle: i * step }
  })

  return (
    <svg
      width={RADAR_SIZE} height={RADAR_SIZE}
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
    >
      {/* Background rings */}
      {ringPoints.map((pts, ri) => (
        <polygon key={ri} points={pts}
          fill="none" stroke="rgba(96,120,64,0.18)" strokeWidth={0.8} />
      ))}

      {/* Axis spokes */}
      {axes.map((ax, i) => (
        <line key={i}
          x1={RADAR_CX} y1={RADAR_CY} x2={ax.x} y2={ax.y}
          stroke="rgba(96,120,64,0.22)" strokeWidth={0.8} />
      ))}

      {/* Data polygon fill */}
      <polygon points={dataStr}
        fill="rgba(80,160,100,0.18)"
        stroke="rgba(96,200,120,0.7)"
        strokeWidth={1.5}
        strokeLinejoin="round" />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3}
          fill={pillars[i].color}
          stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} />
      ))}

      {/* Pillar labels */}
      {labels.map((lb, i) => {
        const anchor = lb.angle < 10 || lb.angle > 350 ? 'middle'
          : lb.angle < 180 ? 'start' : lb.angle > 180 ? 'end' : 'middle'
        return (
          <text key={i} x={lb.x} y={lb.y}
            textAnchor={anchor} dominantBaseline="middle"
            fontSize="8" fill={lb.color} fontFamily="sans-serif"
            style={{ letterSpacing: '0.05em' }}
          >
            {lb.label}
          </text>
        )
      })}
    </svg>
  )
}

function StatCard({ icon, value, label, sub }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(96,120,64,0.2)',
      borderRadius: '3px',
      padding: '16px 20px',
      textAlign: 'center',
      minWidth: '110px',
    }}>
      <div style={{ fontSize: '24px', marginBottom: '4px' }}>{icon}</div>
      <div style={{
        fontFamily: "'Cinzel', serif", fontSize: '24px', fontWeight: 700,
        color: '#c8d8a0', lineHeight: 1,
      }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#4a6a40', letterSpacing: '0.15em', marginTop: '4px' }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: '10px', color: '#3a5030', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

export default function DebriefScreen() {
  const waveResult        = useGameStore(s => s.waveResult)
  const completedMissions = useGameStore(s => s.completedMissions)
  const activeMission     = useGameStore(s => s.activeMission)
  const placed            = useGameStore(s => s.placed)
  const continueFromDebrief = useGameStore(s => s.continueFromDebrief)
  const startGame         = useGameStore(s => s.startGame)

  // Cost estimate — same formula as HUD burn pill, scaled to monthly
  const hourlyBurn      = placed.reduce((sum, p) => sum + (HOURLY_COSTS[p.id] ?? 0), 0)
  const estimatedMonthly = Math.round(hourlyBurn * 730 / 10)
  // Unique service ids present, with count, sorted by cost descending
  const serviceCount = placed.reduce((acc, p) => { acc[p.id] = (acc[p.id] ?? 0) + 1; return acc }, {})
  const uniqueIds = Object.keys(serviceCount).sort(
    (a, b) => (HOURLY_COSTS[b] ?? 0) - (HOURLY_COSTS[a] ?? 0)
  )

  const result = waveResult ?? {
    packetsOk: 0, packetsFailed: 0, threats: 0, score: 0,
    wellArchitected: { security: 0, reliability: 0, performance: 0, costOptimization: 0, operationalExcellence: 0 },
  }

  const totalScore = Object.values(result.wellArchitected).reduce((a, b) => a + b, 0)
  const grade = totalScore >= 80 ? 'S' : totalScore >= 60 ? 'A' : totalScore >= 40 ? 'B' : totalScore >= 20 ? 'C' : 'D'
  const gradeColor = { S: '#f0d060', A: '#80c060', B: '#60a0e0', C: '#e0a040', D: '#e05040' }[grade]

  const nextMission = MISSIONS[activeMission]
  const allDone     = completedMissions.length >= MISSIONS.length

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerTitle}>⚔️ The Siege Is Over</span>
        <span style={S.headerSub}>Architecture Report</span>
      </div>

      <div style={S.body}>
        {/* Left column — scores */}
        <div style={S.left}>
          {/* Grade */}
          <div style={S.gradeBlock}>
            <div style={{ ...S.grade, color: gradeColor }}>{grade}</div>
            <div style={S.gradeLabel}>
              {grade === 'S' ? 'Legendary Architect' :
               grade === 'A' ? 'Master Architect' :
               grade === 'B' ? 'Capable Architect' :
               grade === 'C' ? 'Apprentice Architect' :
               'Needs Work'}
            </div>
            <div style={S.totalScore}>{totalScore} / 100</div>
          </div>

          <div style={S.divider} />

          {/* Pillar scores — radar chart + score bars */}
          <div style={{ padding: '0 4px' }}>
            <div style={S.sectionLabel}>Well-Architected Pillars</div>
            <RadarChart pillars={PILLARS} values={result.wellArchitected} />
            <div style={{ marginTop: '16px' }}>
              {PILLARS.map(p => (
                <ScoreBar
                  key={p.key}
                  label={p.label}
                  value={result.wellArchitected[p.key] ?? 0}
                  max={p.max}
                  color={p.color}
                />
              ))}
            </div>
          </div>

          <div style={S.divider} />

          {/* Traffic stats */}
          <div>
            <div style={S.sectionLabel}>Traffic Results</div>
            <div style={S.statRow}>
              <StatCard icon="✅" value={result.packetsOk}     label="Requests OK" />
              <StatCard icon="❌" value={result.packetsFailed} label="Failed"       />
              <StatCard icon="⚠️" value={result.threats}       label="Threats"     />
            </div>
          </div>

          {placed.length > 0 && <>
            <div style={S.divider} />

            {/* Monthly cost estimate */}
            <div>
              <div style={S.sectionLabel}>Estimated Monthly Cost</div>
              <div style={S.costTotalRow}>
                <span style={S.costTotal}>~${estimatedMonthly}</span>
                <span style={S.costTotalUnit}>/mo</span>
                <span style={S.costTotalNote}>real AWS equivalent</span>
              </div>
              <div style={S.costTable}>
                {uniqueIds.map(id => {
                  const svc = SERVICES.find(s => s.id === id)
                  const count = serviceCount[id]
                  return (
                    <div key={id} style={S.costRow}>
                      <span style={S.costName}>
                        {svc?.aws ?? id}{count > 1 ? ` ×${count}` : ''}
                      </span>
                      <span style={S.costVal}>{REAL_COSTS[id] ?? '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>}
        </div>

        {/* Right column — next steps */}
        <div style={S.right}>
          <div style={S.sectionLabel}>Mission Status</div>

          {completedMissions.map(id => {
            const m = MISSIONS.find(m => m.id === id)
            return m ? (
              <div key={id} style={S.missionRow}>
                <span style={{ color: '#5a9040' }}>✓</span>
                <span style={{ color: '#6a8860' }}>{m.name}</span>
              </div>
            ) : null
          })}

          {/* Active / upcoming missions */}
          {MISSIONS.filter(m => !completedMissions.includes(m.id)).map((m, i) => (
            <div key={m.id} style={{ ...S.missionRow, opacity: i === 0 ? 1 : 0.45 }}>
              <span style={{ color: '#3a5030' }}>{i === 0 ? '▶' : '○'}</span>
              <span style={{ color: i === 0 ? '#c8d8a0' : '#3a5030' }}>{m.name}</span>
            </div>
          ))}

          <div style={{ ...S.divider, margin: '20px 0' }} />

          {/* Placeholder feedback */}
          <div style={S.feedbackBox}>
            <div style={S.feedbackTitle}>📋 Phase 2 Preview</div>
            <p style={S.feedbackText}>
              The real simulation engine (data packet visualization, threat system, and specific architecture feedback) is coming in Phase 2. For now this is a placeholder score based on your deployment count.
            </p>
            <p style={{ ...S.feedbackText, color: '#3a5030', marginTop: '8px' }}>
              {result.note}
            </p>
          </div>

          {/* CTA buttons */}
          <div style={S.ctaGroup}>
            {!allDone ? (
              <button
                style={S.btnPrimary}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #3a6030 0%, #2a4820 100%)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)' }}
                onClick={continueFromDebrief}
              >
                🏰 Reinforce the Kingdom
              </button>
            ) : (
              <button
                style={S.btnPrimary}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #3a6030 0%, #2a4820 100%)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)' }}
                onClick={continueFromDebrief}
              >
                🎉 Free Build Mode
              </button>
            )}
            <button
              style={S.btnSecondary}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(80,120,60,0.7)'; e.currentTarget.style.color = '#8ab870' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(80,100,60,0.4)'; e.currentTarget.style.color = '#6a9060' }}
              onClick={startGame}
            >
              ↩ Start Over
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  root: {
    width: '100%', height: '100%',
    background: '#060810',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Cinzel', serif",
    overflow: 'hidden',
  },
  header: {
    background: 'rgba(10,14,22,0.95)',
    borderBottom: '1px solid rgba(96,120,64,0.25)',
    padding: '20px 40px',
    display: 'flex', alignItems: 'baseline', gap: '16px',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '22px', fontWeight: 700, color: '#c8d8a0', letterSpacing: '0.08em',
  },
  headerSub: {
    fontSize: '11px', color: '#4a6a40', letterSpacing: '0.25em', textTransform: 'uppercase',
  },
  body: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0',
    overflow: 'hidden',
    minHeight: 0,
  },
  left: {
    borderRight: '1px solid rgba(96,120,64,0.12)',
    padding: '32px 40px',
    overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '20px',
  },
  right: {
    padding: '32px 40px',
    overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  gradeBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    padding: '24px 0',
  },
  grade: {
    fontSize: '80px', fontWeight: 700, lineHeight: 1,
    textShadow: '0 0 30px currentColor',
  },
  gradeLabel: {
    fontSize: '13px', color: '#c8d8a0', letterSpacing: '0.15em',
  },
  totalScore: {
    fontSize: '12px', color: '#4a6a40', letterSpacing: '0.1em', marginTop: '4px',
  },
  divider: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(96,120,64,0.3), transparent)',
  },
  sectionLabel: {
    fontSize: '10px', color: '#3a5a30', letterSpacing: '0.25em',
    textTransform: 'uppercase', marginBottom: '12px',
  },
  statRow: {
    display: 'flex', gap: '10px', flexWrap: 'wrap',
  },
  missionRow: {
    display: 'flex', gap: '10px', alignItems: 'center',
    padding: '7px 0',
    borderBottom: '1px solid rgba(96,120,64,0.08)',
    fontSize: '12px', letterSpacing: '0.05em',
  },
  costTotalRow: {
    display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px',
  },
  costTotal: {
    fontFamily: "'Cinzel', serif", fontSize: '28px', fontWeight: 700,
    color: '#e0c060', lineHeight: 1,
  },
  costTotalUnit: {
    fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#a08040',
  },
  costTotalNote: {
    fontSize: '10px', color: '#3a5030', letterSpacing: '0.15em',
    textTransform: 'uppercase', marginLeft: '4px',
  },
  costTable: {
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
  costRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '4px 0',
    borderBottom: '1px solid rgba(96,120,64,0.08)',
    gap: '8px',
  },
  costName: {
    fontSize: '11px', color: '#7a9870', fontFamily: 'sans-serif',
    whiteSpace: 'nowrap',
  },
  costVal: {
    fontSize: '10px', color: '#5a7850', fontFamily: 'sans-serif',
    textAlign: 'right', flexShrink: 0,
  },
  feedbackBox: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(96,120,64,0.15)',
    borderRadius: '3px',
    padding: '16px 20px',
  },
  feedbackTitle: {
    fontSize: '11px', color: '#5a8060', letterSpacing: '0.15em', marginBottom: '8px',
  },
  feedbackText: {
    fontSize: '12px', color: '#4a6a40', lineHeight: 1.7,
    fontFamily: 'sans-serif', margin: 0,
  },
  ctaGroup: {
    display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px',
  },
  btnPrimary: {
    padding: '13px 0',
    background: 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)',
    border: '1px solid rgba(96,160,64,0.5)',
    borderRadius: '3px',
    color: '#a8d080',
    fontFamily: "'Cinzel', serif",
    fontSize: '13px',
    letterSpacing: '0.12em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    width: '100%',
  },
  btnSecondary: {
    padding: '11px 0',
    background: 'transparent',
    border: '1px solid rgba(80,100,60,0.4)',
    borderRadius: '3px',
    color: '#6a9060',
    fontFamily: "'Cinzel', serif",
    fontSize: '12px',
    letterSpacing: '0.1em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    width: '100%',
  },
}
