import React from 'react'
import { useGameStore } from '../store/gameStore.js'
import { SERVICES }     from '../game/constants.js'

const ZONE_COLOR = {
  // Edge = outside the VPC. In real AWS: IGW attaches to VPC (not inside it),
  // CloudFront is a global CDN, S3 is a regional service — none live in a subnet.
  edge:    { border:'#4a9acc',       badge:'rgba(40,100,180,0.18)',text:'#6ab8e8',       label:'Edge'    },
  public:  { border:'var(--green)',  badge:'rgba(74,140,63,0.2)',  text:'var(--green2)', label:'Public'  },
  private: { border:'var(--teal)',   badge:'rgba(42,122,106,0.2)', text:'var(--teal2)',  label:'Private' },
  wall:    { border:'var(--purple)', badge:'rgba(106,74,156,0.2)', text:'#a080e0',       label:'Gate'    },
  any:     { border:'var(--gold)',   badge:'rgba(201,168,76,0.15)',text:'var(--gold)',    label:'Any'     },
}

export default function ServicePalette() {
  const selectedServiceId = useGameStore(s => s.selectedServiceId)
  const placed            = useGameStore(s => s.placed)
  const selectService     = useGameStore(s => s.selectService)
  const clearSelection    = useGameStore(s => s.clearSelection)
  const mode              = useGameStore(s => s.mode)
  const isArchitect       = mode === 'architect'

  const selectedSvc = SERVICES.find(s => s.id === selectedServiceId)

  return (
    <div style={S.panel}>
      <div style={S.header}>
        {isArchitect ? '📐 AWS Services' : '⚔ Service Roster'}
      </div>

      {selectedSvc && (
        <div style={S.hint}>
          <span style={{ flex: 1 }}>
            {selectedSvc.icon} Placing: {isArchitect ? selectedSvc.aws : selectedSvc.fantasy}
          </span>
          <button style={S.cancel} onClick={clearSelection}>✕</button>
        </div>
      )}

      <div style={S.list}>
        {SERVICES.map(svc => {
          const placedCount = placed.filter(p => p.id === svc.id).length
          const maxed       = placedCount >= svc.max
          const selected    = selectedServiceId === svc.id
          const z           = ZONE_COLOR[svc.zone] || ZONE_COLOR.any

          return (
            <div
              key={svc.id}
              style={{
                ...S.card,
                borderLeft: `3px solid ${z.border}`,
                ...(selected ? S.cardSelected : {}),
                ...(maxed    ? S.cardMaxed   : {}),
              }}
              onClick={() => !maxed && selectService(svc.id)}
            >
              <div style={{ ...S.badge, background: z.badge, color: z.text, borderColor: z.border }}>
                {z.label}
              </div>

              <div style={S.top}>
                <span style={S.icon}>{svc.icon}</span>
                <div style={S.names}>
                  {isArchitect ? (
                    <>
                      <div style={{ ...S.fantasy, fontSize: '11px' }}>{svc.aws}</div>
                      <div style={{ ...S.aws, fontSize: '10px', color: '#3a5030' }}>{svc.fantasy}</div>
                    </>
                  ) : (
                    <>
                      <div style={S.fantasy}>{svc.fantasy}</div>
                      <div style={S.aws}>{svc.aws}</div>
                    </>
                  )}
                </div>
              </div>

              <div style={S.desc}>{svc.desc ?? ''}</div>

              <div style={S.count}>
                {maxed
                  ? <span style={{ color: 'var(--red)' }}>All deployed</span>
                  : <>{placedCount}/{svc.max} deployed · 🪙{svc.cost}/hr</>
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const S = {
  panel: {
    background: 'var(--bg2)', borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    padding: '13px 16px 10px',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'Cinzel, serif', fontSize: 11,
    letterSpacing: '1.5px', color: 'var(--gold)', textTransform: 'uppercase',
  },
  hint: {
    padding: '7px 12px',
    display: 'flex', alignItems: 'center',
    background: 'rgba(201,168,76,0.08)',
    borderBottom: '1px solid rgba(201,168,76,0.2)',
    fontFamily: 'Cinzel, serif', fontSize: 11, color: 'var(--gold)',
    letterSpacing: '0.5px',
  },
  cancel: {
    background: 'none', border: 'none', color: 'var(--gold)',
    fontSize: 14, cursor: 'pointer', padding: '0 4px', opacity: 0.7,
  },
  list: {
    flex: 1, overflowY: 'auto',
    padding: 8, display: 'flex', flexDirection: 'column', gap: 4,
  },
  card: {
    background: 'var(--bg3)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px',
    cursor: 'pointer', position: 'relative',
    transition: 'border-color 0.15s, transform 0.1s',
  },
  cardSelected: {
    borderColor: 'var(--gold2)',
    boxShadow: '0 0 0 2px rgba(240,204,112,0.25)',
    transform: 'translateX(3px)',
  },
  cardMaxed: { opacity: 0.4, cursor: 'not-allowed' },
  badge: {
    position: 'absolute', top: 6, right: 6,
    fontSize: 9, padding: '1px 5px', borderRadius: 4,
    fontFamily: 'Cinzel, serif', letterSpacing: '0.5px',
    border: '0.5px solid transparent',
  },
  top: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  icon: { fontSize: 20, lineHeight: 1 },
  names: { flex: 1, minWidth: 0 },
  fantasy: {
    fontFamily: 'Cinzel, serif', fontSize: 11, color: 'var(--gold2)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  aws: { fontSize: 10, color: 'var(--text3)', fontFamily: 'monospace' },
  desc: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 },
  count: { fontSize: 10, color: 'var(--text3)', marginTop: 3 },
}
