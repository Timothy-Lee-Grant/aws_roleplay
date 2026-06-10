import React from 'react'
import { SERVICES, HOURLY_COSTS, REAL_COSTS } from '../game/constants.js'
import { getNeighbors } from '../game/hexGrid.js'

// ── Zone explanations ─────────────────────────────────────────────────────────
const ZONE_EXPLANATIONS = {
  edge:    'Internet Edge — outside the VPC, at the AWS network boundary',
  public:  'Public Subnet — internet-accessible; requires IGW + Route Table',
  private: 'Private Subnet — no direct internet access; uses NAT or VPC Endpoints for outbound',
  any:     'Any Subnet — can be placed in public or private subnet',
  wall:    'VPC Wall — structural VPC resource spanning both subnets',
}

// ── Inline row component ──────────────────────────────────────────────────────
function InfoRow({ icon, label, value }) {
  return (
    <div style={S.infoRow}>
      <span style={S.infoIcon}>{icon}</span>
      <span style={S.infoLabel}>{label}</span>
      <span style={S.infoValue}>{value}</span>
    </div>
  )
}

// ── Main overlay ──────────────────────────────────────────────────────────────
/**
 * ServiceInfoOverlay — rendered by GameBoard when a placed tile is clicked
 * in non-placement mode.
 *
 * Props:
 *   serviceId  — string (service id)
 *   row, col   — tile position (for adjacency lookup)
 *   placed     — current placed array from store
 *   onClose    — callback
 */
export default function ServiceInfoOverlay({ serviceId, row, col, placed, onClose }) {
  const svc      = SERVICES.find(s => s.id === serviceId)
  const realCost = REAL_COSTS[serviceId] ?? '—'
  const hourlyCost = HOURLY_COSTS[serviceId] ?? 0

  if (!svc) return null

  // Find adjacent placed services
  const nbrs = getNeighbors(row, col)
  const adjacentServices = placed.filter(p =>
    p !== placed.find(x => x.row === row && x.col === col) &&
    nbrs.some(n => n.row === p.row && n.col === p.col)
  )

  const zoneExpl = ZONE_EXPLANATIONS[svc.zone] ?? svc.zone

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.panel} onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button style={S.closeBtn} onClick={onClose} aria-label="Close">✕</button>

        {/* Header */}
        <div style={S.header}>
          <span style={S.bigIcon}>{svc.icon}</span>
          <div>
            <div style={S.fantasyName}>{svc.fantasy}</div>
            <div style={S.awsName}>Amazon {svc.aws}</div>
          </div>
        </div>

        <div style={S.divider} />

        {/* Description */}
        <p style={S.desc}>{svc.desc}</p>

        {/* Stats grid */}
        <div style={S.infoGrid}>
          <InfoRow icon="🏰" label="Zone"      value={zoneExpl} />
          <InfoRow icon="💰" label="Real cost"  value={realCost} />
          {hourlyCost > 0 && (
            <InfoRow icon="🕐" label="Game cost" value={`${hourlyCost}🪙/hr`} />
          )}
          {svc.requiresSG && (
            <InfoRow icon="🛡" label="Requires"  value="Security Group (Permission Scroll)" />
          )}
        </div>

        {/* AWS Fact */}
        {svc.awsFact && <>
          <div style={S.divider} />
          <div style={S.factBox}>
            <div style={S.factLabel}>💡 AWS Fact</div>
            <p style={S.factText}>{svc.awsFact}</p>
          </div>
        </>}

        {/* Adjacent services */}
        {adjacentServices.length > 0 && <>
          <div style={S.divider} />
          <div style={S.connSection}>
            <div style={S.connLabel}>🔗 Adjacent services</div>
            <div style={S.connList}>
              {adjacentServices.map(p => {
                const adj = SERVICES.find(s => s.id === p.id)
                const connected = svc.conns?.includes(p.id) ||
                  SERVICES.find(s => s.id === p.id)?.conns?.includes(serviceId)
                return (
                  <div key={`${p.row},${p.col}`} style={S.connTag}>
                    <span>{adj?.icon ?? '?'}</span>
                    <span style={S.connName}>{adj?.fantasy ?? p.id}</span>
                    {connected && <span style={S.connTick}>✓</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </>}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  backdrop: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.55)',
    zIndex: 200,
  },
  panel: {
    position: 'relative',
    background: 'linear-gradient(160deg, #0e1520 0%, #060c14 100%)',
    border: '1px solid rgba(96,160,80,0.3)',
    borderRadius: '6px',
    padding: '24px 28px',
    width: '360px',
    maxWidth: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 0 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(96,160,80,0.1)',
    fontFamily: "'Cinzel', serif",
    color: '#c8d8a0',
  },
  closeBtn: {
    position: 'absolute', top: '12px', right: '14px',
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#4a6040', fontSize: '16px', padding: '2px 6px',
    lineHeight: 1,
    transition: 'color 0.15s',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '14px',
    marginBottom: '16px',
  },
  bigIcon: {
    fontSize: '36px', lineHeight: 1, flexShrink: 0,
  },
  fantasyName: {
    fontSize: '16px', fontWeight: 700, color: '#d8e8b0',
    letterSpacing: '0.06em', lineHeight: 1.2,
  },
  awsName: {
    fontSize: '11px', color: '#4a7050', letterSpacing: '0.1em',
    marginTop: '3px', fontFamily: 'sans-serif',
  },
  divider: {
    height: '1px', margin: '14px 0',
    background: 'linear-gradient(90deg, transparent, rgba(96,120,64,0.3), transparent)',
  },
  desc: {
    fontSize: '12px', color: '#7a9870',
    fontFamily: "'Crimson Text', serif",
    lineHeight: 1.7, margin: '0 0 14px 0',
  },
  infoGrid: {
    display: 'flex', flexDirection: 'column', gap: '7px',
  },
  infoRow: {
    display: 'flex', alignItems: 'flex-start', gap: '8px',
    fontSize: '11px', fontFamily: 'sans-serif',
  },
  infoIcon: {
    fontSize: '13px', flexShrink: 0, lineHeight: 1.4,
  },
  infoLabel: {
    color: '#4a6040', minWidth: '72px', flexShrink: 0, letterSpacing: '0.05em',
  },
  infoValue: {
    color: '#8aaa70', lineHeight: 1.5,
  },
  factBox: {
    background: 'rgba(60,100,50,0.08)',
    border: '1px solid rgba(60,100,50,0.2)',
    borderRadius: '4px', padding: '12px 14px',
  },
  factLabel: {
    fontSize: '9px', color: '#4a7040', letterSpacing: '0.2em',
    textTransform: 'uppercase', marginBottom: '6px',
  },
  factText: {
    fontSize: '11px', color: '#6a8860',
    fontFamily: 'sans-serif', lineHeight: 1.65, margin: 0,
  },
  connSection: {
    marginTop: '0',
  },
  connLabel: {
    fontSize: '9px', color: '#4a6040', letterSpacing: '0.2em',
    textTransform: 'uppercase', marginBottom: '8px',
  },
  connList: {
    display: 'flex', flexWrap: 'wrap', gap: '6px',
  },
  connTag: {
    display: 'flex', alignItems: 'center', gap: '5px',
    background: 'rgba(60,80,50,0.25)',
    border: '1px solid rgba(60,100,50,0.25)',
    borderRadius: '20px', padding: '4px 10px',
    fontSize: '11px', fontFamily: 'sans-serif',
  },
  connName: {
    color: '#8aaa70',
  },
  connTick: {
    color: '#60c070', fontSize: '10px',
  },
}
