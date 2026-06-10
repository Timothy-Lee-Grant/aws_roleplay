import React from 'react'
import { useGameStore }  from './store/gameStore.js'
import TitleScreen       from './components/TitleScreen.jsx'
import GameScreen        from './components/GameScreen.jsx'
import DebriefScreen     from './components/DebriefScreen.jsx'

/**
 * App.jsx — phase router.
 *
 * phase === 'title'   → TitleScreen  (splash, new game, how to play)
 * phase === 'build'   → GameScreen   (place services, manage missions)
 * phase === 'wave'    → GameScreen   (same board, wave overlay active)
 * phase === 'debrief' → DebriefScreen (scores, next mission prompt)
 */
export default function App() {
  const phase = useGameStore(s => s.phase)

  if (phase === 'title')   return <TitleScreen />
  if (phase === 'debrief') return <DebriefScreen />
  // 'build' | 'wave' both render GameScreen (wave overlay handled inside)
  return <GameScreen />
}
