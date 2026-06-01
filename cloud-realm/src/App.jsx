import React from 'react'
import GameScreen from './components/GameScreen.jsx'

/**
 * App.jsx — the root component.
 * Currently renders only GameScreen. When phases (title, wave, results) are added,
 * this will act as a phase router:  phase === 'menu' && <TitleScreen />  etc.
 */
export default function App() {
  return <GameScreen />
}
