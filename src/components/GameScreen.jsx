import React from 'react'
import { useGameStore }  from '../store/gameStore.js'
import HUD               from './HUD.jsx'
import ServicePalette    from './ServicePalette.jsx'
import GameBoard         from './GameBoard.jsx'
import MissionPanel      from './MissionPanel.jsx'
import WaveBattleLog     from './WaveBattleLog.jsx'
import TutorialOverlay   from './TutorialOverlay.jsx'

const styles = {
  root: {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg)',
    position: 'relative',
  },
}

export default function GameScreen() {
  const phase = useGameStore(s => s.phase)
  const isWave = phase === 'wave'

  // During wave: collapse the palette column and swap MissionPanel for WaveBattleLog.
  // The canvas continues drawing normally — packets and threats ARE the visualization.
  const gridCols = isWave ? '1fr 264px' : '220px 1fr 264px'

  return (
    <div style={styles.root}>
      <HUD />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: gridCols, overflow: 'hidden', minHeight: 0 }}>
        {!isWave && <ServicePalette />}
        <GameBoard />
        {isWave ? <WaveBattleLog /> : <MissionPanel />}
      </div>
      <TutorialOverlay />
    </div>
  )
}
