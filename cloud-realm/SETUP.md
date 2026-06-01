# CloudRealm v2 — Setup

This is the Canvas + React + Zustand rewrite. Requires Node.js 18+.

```bash
cd cloud-realm
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Controls

| Input | Action |
|---|---|
| Click a service card | Select it (gold highlight) |
| Click a glowing hex tile | Place the selected service |
| Right-click an occupied tile | Remove service (50% refund) |
| Scroll wheel | Zoom in / out (toward cursor) |
| Alt + drag | Pan the map |
| Escape | Cancel current selection |

## Project structure

```
src/
├── game/
│   ├── constants.js   All game data — services, missions, grid geometry
│   ├── hexGrid.js     Hex math — hexCenter, pixelToHex, getNeighbors, drawGrid
│   └── sprites.js     Canvas drawing functions for all 12 services
├── store/
│   └── gameStore.js   Zustand store — all state + actions
└── components/
    ├── GameScreen.jsx  Root layout
    ├── HUD.jsx         Top bar
    ├── ServicePalette.jsx  Left panel
    ├── MissionPanel.jsx    Right panel
    └── GameBoard.jsx   Canvas + RAF loop + zoom/pan
```
