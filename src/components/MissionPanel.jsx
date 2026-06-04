import React from 'react'
import { useGameStore } from '../store/gameStore.js'
import { MISSIONS, SERVICES } from '../game/constants.js'

export default function MissionPanel() {
  const placed            = useGameStore(s => s.placed)
  const completedMissions = useGameStore(s => s.completedMissions)
  const activeMission     = useGameStore(s => s.activeMission)
  const gold              = useGameStore(s => s.gold)
  const getNeighbors      = useGameStore(s => s.getNeighbors)
  const completeMission   = useGameStore(s => s.completeMission)

  // Build the state object that mission check functions receive
  const checkState = { placed, getNeighbors }

  return (
    <div style={S.panel}>
      <div style={S.header}>📜 Missions</div>
      <div style={S.scroll}>
        {MISSIONS.map(m => {
          const isActive   = m.id === activeMission
          const isComplete = completedMissions.includes(m.id)  // array, not Set
          const allSat     = m.reqs.every(r => r.check(checkState))

          return (
            <div key={m.id} style={{
              ...S.card,
              ...(isActive   ? S.cardActive   : {}),
              ...(isComplete ? S.cardComplete  : {}),
            }}>
              <div style={S.mHead}>
                <div style={S.mNum}>{m.id + 1}</div>
                <div style={S.mName}>{m.name}</div>
                <div style={S.mIcon}>{isComplete ? '✅' : isActive ? '⚔️' : '🔒'}</div>
              </div>

              {isActive && (
                <div style={S.mBody}>
                  <p style={S.lore}>{m.lore}</p>
                  <div style={S.reqs}>
                    {m.reqs.map((req, i) => {
                      const sat = req.check(checkState)
                      return (
                        <div key={i} style={{ ...S.req, ...(sat ? S.reqSat : {}) }}>
                          <span style={{ ...S.check, ...(sat ? S.checkSat : {}) }}>
                            {sat ? '✓' : '○'}
                          </span>
                          <span style={S.reqIcon}>{req.icon}</span>
                          <span style={S.reqText}>{req.text}</span>
                        </div>
                      )
                    })}
                  </div>

                  {allSat && !isComplete && (
                    <button style={S.claimBtn} onClick={() => completeMission(m.id)}>
                      ⚡ Claim Victory · +{m.reward}🪙
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tile info + legend at bottom */}
      <div style={S.legend}>
        <div style={S.legendTitle}>Map Legend</div>
        {[
          { bg:'#0c1822', bd:'#1a3040', label:'Internet Edge (IGW, CF, S3)'    },
          { bg:'#1b2e18', bd:'#4a8c3f', label:'Public Subnet (Outer City)'     },
          { bg:'#122518', bd:'#2a7a6a', label:'Private Subnet (Inner Sanctum)'  },
          { bg:'#18261a', bd:'#3a4a38', label:'VPC Wall'                        },
          { bg:'#0f1118', bd:'#2a2c32', label:'The Outer Realm'                 },
        ].map(({ bg, bd, label }) => (
          <div key={label} style={S.legendRow}>
            <div style={{ ...S.swatch, background: bg, border: `1px solid ${bd}` }} />
            {label}
          </div>
        ))}
        <div style={{ ...S.legendRow, marginTop: 8, color: 'var(--text3)' }}>
          Right-click a tile to remove a service
        </div>
      </div>
    </div>
  )
}

const S = {
  panel: {
    background: 'var(--bg2)', borderLeft: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    padding: '13px 16px 10px',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'Cinzel, serif', fontSize: 11,
    letterSpacing: '1.5px', color: 'var(--gold)', textTransform: 'uppercase',
    flexShrink: 0,
  },
  scroll: { flex: 1, overflowY: 'auto', padding: 8 },
  card: {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 10, marginBottom: 8, overflow: 'hidden',
    transition: 'border-color 0.2s',
  },
  cardActive:   { borderColor: 'var(--gold)'   },
  cardComplete: { borderColor: 'var(--green2)' },
  mHead: {
    padding: '10px 12px',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  mNum: {
    width: 22, height: 22, borderRadius: '50%',
    background: 'var(--bg)', border: '1px solid var(--border2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Cinzel, serif', fontSize: 11, color: 'var(--gold)', flexShrink: 0,
  },
  mName: { fontFamily: 'Cinzel, serif', fontSize: 12, color: 'var(--text)', flex: 1 },
  mIcon: { fontSize: 14 },
  mBody: { padding: '0 12px 12px', borderTop: '1px solid var(--border)' },
  lore: {
    fontSize: 13, color: 'var(--text2)', lineHeight: 1.6,
    fontStyle: 'italic', padding: '8px 0 10px',
    borderBottom: '1px solid var(--border)', marginBottom: 10,
  },
  reqs: { display: 'flex', flexDirection: 'column', gap: 6 },
  req: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 12, padding: '5px 8px',
    background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)',
    transition: 'border-color 0.2s',
  },
  reqSat:  { borderColor: 'var(--green)' },
  check:   { color: 'var(--text3)', fontSize: 14, flexShrink: 0 },
  checkSat:{ color: 'var(--green2)' },
  reqIcon: { fontSize: 14 },
  reqText: { flex: 1, color: 'var(--text2)', lineHeight: 1.3 },
  claimBtn: {
    marginTop: 10, width: '100%', padding: '8px',
    background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.4)',
    borderRadius: 6, color: 'var(--gold2)',
    fontFamily: 'Cinzel, serif', fontSize: 12, cursor: 'pointer',
    letterSpacing: '0.5px',
  },
  legend: {
    flexShrink: 0, margin: 8, padding: '10px 12px',
    background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
    fontSize: 11, color: 'var(--text2)',
  },
  legendTitle: {
    fontFamily: 'Cinzel, serif', fontSize: 10, color: 'var(--text3)',
    letterSpacing: 1, marginBottom: 8,
  },
  legendRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 },
  swatch:    { width: 14, height: 14, borderRadius: 3, flexShrink: 0 },
}
