import React from 'react'
import HUD            from './HUD.jsx'
import ServicePalette from './ServicePalette.jsx'
import GameBoard      from './GameBoard.jsx'
import MissionPanel   from './MissionPanel.jsx'

const styles = {
  root: {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg)',
  },
  main: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '220px 1fr 264px',
    overflow: 'hidden',
    minHeight: 0,
  },
}

export default function GameScreen() {
  return (
    <div style={styles.root}>
      <HUD />
      <div style={styles.main}>
        <ServicePalette />
        <GameBoard />
        <MissionPanel />
      </div>
    </div>
  )
}
