import React from 'react'
import { useGameStore } from '../store/gameStore.js'

/**
 * TutorialOverlay — 5-step in-game walkthrough shown on first New Game.
 *
 * Unlike the TitleScreen "How to Play" modal (which is general orientation),
 * this overlay is shown ON TOP of the live game board and highlights specific
 * zones as the player reads each step. The final step asks the player to
 * actually place a service, which completes the tutorial automatically.
 *
 * Steps are tracked in store.tutorialStep (0–4). null = hidden.
 */

const STEPS = [
  {
    title: 'Your VPC — The Kingdom',
    icon: '🏰',
    body: 'These stone walls are your Virtual Private Cloud. In real AWS, a VPC is your isolated network slice of the cloud. Nothing enters or leaves without your permission.',
    highlight: 'wall',
    cta: 'Next →',
    position: 'center',
  },
  {
    title: 'The Internet Edge',
    icon: '🌐',
    body: 'The blue strip at the top sits OUTSIDE the VPC wall. Place services like the Internet Gateway (IGW), CloudFront, and Route53 here — these are global AWS services, not VPC resources.',
    highlight: 'edge',
    cta: 'Next →',
    position: 'top',
  },
  {
    title: 'Public vs Private Subnets',
    icon: '🗺',
    body: 'Green tiles = Public Subnet (internet-accessible). Teal tiles = Private Subnet (no direct internet). Databases and internal services always go in private. Load balancers and web servers go in public.',
    highlight: 'subnets',
    cta: 'Next →',
    position: 'center',
  },
  {
    title: 'Gold = Your AWS Budget',
    icon: '🪙',
    body: 'Every service you place costs gold. You get 50% back when you remove it. Plan carefully — over-engineering is expensive. Real AWS bills are proportional to complexity.',
    highlight: 'hud',
    cta: 'Next →',
    position: 'top',
  },
  {
    title: 'Ready to Build',
    icon: '⚔️',
    body: 'Click a service card in the left panel to select it, then click any valid tile on the board to place it. Green tiles will highlight when you hover. Place your first service to begin!',
    highlight: 'palette',
    cta: 'Start Building',
    position: 'left',
  },
]

// Zone highlight colours
const HIGHLIGHT_STYLE = {
  wall:    'rgba(100,160,80,0.25)',
  edge:    'rgba(60,120,200,0.25)',
  subnets: 'rgba(80,200,100,0.20)',
  hud:     'rgba(200,160,60,0.20)',
  palette: 'rgba(100,180,100,0.20)',
}

export default function TutorialOverlay() {
  const tutorialStep   = useGameStore(s => s.tutorialStep)
  const advanceTutorial = useGameStore(s => s.advanceTutorial)
  const skipTutorial   = useGameStore(s => s.skipTutorial)

  if (tutorialStep === null || tutorialStep > 4) return null

  const step = STEPS[tutorialStep]
  const isLast = tutorialStep === 4

  // Position the tooltip card based on step.position
  const cardStyle = {
    ...S.card,
    ...(step.position === 'top'    ? S.cardTop    : {}),
    ...(step.position === 'left'   ? S.cardLeft   : {}),
    ...(step.position === 'center' ? S.cardCenter : {}),
  }

  return (
    <div style={S.root}>
      {/* Semi-transparent backdrop */}
      <div style={S.backdrop} />

      {/* Zone highlight pulse */}
      <div style={{
        ...S.highlight,
        background: HIGHLIGHT_STYLE[step.highlight] ?? 'transparent',
        ...(step.highlight === 'hud'     ? S.highlightHUD     : {}),
        ...(step.highlight === 'palette' ? S.highlightPalette : {}),
        ...(step.highlight === 'edge'    ? S.highlightEdge    : {}),
        ...(step.highlight === 'wall'    ? S.highlightWall    : {}),
        ...(step.highlight === 'subnets' ? S.highlightSubnets : {}),
      }} />

      {/* Tooltip card */}
      <div style={cardStyle}>
        {/* Progress pips */}
        <div style={S.pips}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              ...S.pip,
              ...(i === tutorialStep ? S.pipActive : {}),
              ...(i < tutorialStep   ? S.pipDone   : {}),
            }} />
          ))}
        </div>

        <div style={S.stepIcon}>{step.icon}</div>
        <h3 style={S.stepTitle}>{step.title}</h3>
        <p style={S.stepBody}>{step.body}</p>

        <div style={S.btnRow}>
          <button
            style={S.skipBtn}
            onClick={skipTutorial}
          >
            Skip tutorial
          </button>
          <button
            style={S.ctaBtn}
            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg,#3a6030,#2a4820)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg,#2a4a20,#1a3414)' }}
            onClick={advanceTutorial}
          >
            {step.cta}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root: {
    position: 'absolute',
    inset: 0,
    zIndex: 40,
    pointerEvents: 'none',  // let clicks fall through to game board
    fontFamily: "'Cinzel', serif",
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(4,6,12,0.45)',
    pointerEvents: 'none',
  },

  // Zone highlight overlays — positioned to match the GameScreen grid layout
  // GameScreen: HUD (52px) | grid: 220px palette | 1fr board | 264px panel
  highlight: {
    position: 'absolute',
    pointerEvents: 'none',
    transition: 'all 0.3s ease',
    borderRadius: '4px',
  },
  highlightHUD: {
    top: 0, left: 0, right: 0, height: '52px',
  },
  highlightPalette: {
    top: '52px', left: 0, width: '220px', bottom: 0,
  },
  highlightEdge: {
    // Edge tiles are the top ~13% of the canvas area (row 0)
    top: '52px', left: '220px', right: '264px', height: '14%',
  },
  highlightWall: {
    // Wall is the ring inside edge (~13%–35% top/bottom, left/right strips)
    top: '52px', left: '220px', right: '264px', bottom: 0,
    background: 'transparent',
    outline: '3px solid rgba(100,160,80,0.35)',
  },
  highlightSubnets: {
    // Public + private subnets (middle band of board)
    top: 'calc(52px + 14%)', left: '220px', right: '264px',
    height: '60%',
  },

  // Card positions
  card: {
    position: 'absolute',
    width: '320px',
    background: 'rgba(8,12,20,0.96)',
    border: '1px solid rgba(96,120,64,0.4)',
    borderRadius: '4px',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    pointerEvents: 'all',
    boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 60px rgba(40,70,30,0.15)',
  },
  cardCenter: {
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  cardTop: {
    top: '80px', left: '50%',
    transform: 'translateX(-50%)',
  },
  cardLeft: {
    top: '50%', left: '240px',
    transform: 'translateY(-50%)',
  },

  pips: {
    display: 'flex', gap: '6px', marginBottom: '4px',
  },
  pip: {
    width: '8px', height: '8px', borderRadius: '4px',
    background: '#1e2e1a', transition: 'all 0.2s ease',
  },
  pipActive: {
    width: '24px', background: '#5a9040',
  },
  pipDone: {
    background: '#3a6030',
  },

  stepIcon: {
    fontSize: '32px', lineHeight: 1,
  },
  stepTitle: {
    fontSize: '16px', fontWeight: 700,
    color: '#c8d8a0', letterSpacing: '0.08em',
    margin: 0,
  },
  stepBody: {
    fontSize: '12px', color: '#6a8860',
    lineHeight: 1.7, margin: 0,
    fontFamily: 'sans-serif', letterSpacing: '0.02em',
  },
  btnRow: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginTop: '8px',
  },
  skipBtn: {
    background: 'transparent',
    border: 'none',
    color: '#3a5030',
    fontFamily: "'Cinzel', serif",
    fontSize: '11px',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    padding: '4px 0',
    transition: 'color 0.15s',
  },
  ctaBtn: {
    padding: '9px 20px',
    background: 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)',
    border: '1px solid rgba(96,160,64,0.5)',
    borderRadius: '3px',
    color: '#a8d080',
    fontFamily: "'Cinzel', serif",
    fontSize: '12px',
    letterSpacing: '0.12em',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
}
