import React, { useEffect, useState } from 'react'
import { useGameStore }  from '../store/gameStore.js'
import HUD               from './HUD.jsx'
import ServicePalette    from './ServicePalette.jsx'
import GameBoard         from './GameBoard.jsx'
import MissionPanel      from './MissionPanel.jsx'
import TutorialOverlay   from './TutorialOverlay.jsx'

const styles = {
  root: {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg)',
    position: 'relative',
  },
  main: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '220px 1fr 264px',
    overflow: 'hidden',
    minHeight: 0,
  },
  // Fullscreen overlay shown while wave simulation runs
  waveOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(4, 6, 12, 0.78)',
    backdropFilter: 'blur(2px)',
    fontFamily: "'Cinzel', serif",
    gap: '20px',
    pointerEvents: 'none',
  },
  waveIcon: { fontSize: '48px', animation: 'pulse 0.8s ease-in-out infinite alternate' },
  waveTitle: { fontSize: '28px', color: '#c8d8a0', letterSpacing: '0.12em', margin: 0 },
  waveSub: { fontSize: '13px', color: '#5a8060', letterSpacing: '0.2em' },
  waveBar: {
    width: '280px', height: '4px',
    background: 'rgba(96,120,64,0.2)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '8px',
  },
  waveBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3a6030, #80c060)',
    borderRadius: '2px',
    transition: 'width 0.1s linear',
  },
}

/**
 * WaveOverlay — shown while phase === 'wave'.
 * Animates a progress bar that counts down the 3-second stub simulation.
 */
function WaveOverlay() {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const duration = 3000
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      setProgress(Math.min(100, (elapsed / duration) * 100))
      if (elapsed >= duration) clearInterval(id)
    }, 50)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={styles.waveOverlay}>
      <style>{`@keyframes pulse { from { transform: scale(1) } to { transform: scale(1.12) } }`}</style>
      <div style={styles.waveIcon}>⚡</div>
      <h2 style={styles.waveTitle}>Unleashing the Traffic</h2>
      <p style={styles.waveSub}>Simulating requests through your architecture…</p>
      <div style={styles.waveBar}>
        <div style={{ ...styles.waveBarFill, width: `${progress}%` }} />
      </div>
    </div>
  )
}

export default function GameScreen() {
  const phase = useGameStore(s => s.phase)

  return (
    <div style={styles.root}>
      <HUD />
      <div style={styles.main}>
        <ServicePalette />
        <GameBoard />
        <MissionPanel />
      </div>
      {phase === 'wave' && <WaveOverlay />}
      <TutorialOverlay />
    </div>
  )
}
