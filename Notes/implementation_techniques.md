# Implementation Techniques — CloudRealm vs Dungeon Architect

*A technical analysis for engineers who want to understand how browser games are built, why different approaches exist, and how to make smart architectural choices as a project grows.*

---

## The Setup

We have two browser-based games built at roughly the same moment in time, for similar purposes — teaching through interactive gameplay, running in a browser with no server. They look similar from the outside. Under the hood, they could not be more different.

| | CloudRealm | Dungeon Architect |
|---|---|---|
| Files | 1 HTML file | ~15 files, npm project |
| Framework | None (vanilla JS) | React 18 + Zustand |
| Build tool | None | Vite |
| Rendering | HTML/CSS elements | HTML5 Canvas API |
| Game loop | None | `requestAnimationFrame` at 60fps |
| Animation | CSS `@keyframes` | `Math.sin(t)` in draw functions |
| Sprites | Emoji text | Programmatic shapes drawn in code |
| State | Plain JS object | Zustand global store |
| Dependencies | 0 | ~4 (React, Zustand, Vite, React-DOM) |

This document explains what each choice means, why it was made, where it breaks down, and what the right path forward is as CloudRealm grows.

---

## Part 1 — The Two Rendering Models

To understand the tradeoffs, you first need to understand what the browser is actually doing when it draws things on screen.

### The DOM Model (CloudRealm's approach)

The **Document Object Model** (DOM) is the browser's internal tree of all the elements on the page. Every `<div>`, `<svg>`, `<span>` is a node in this tree. When you write:

```html
<div class="hex terrain-public">
  <div class="hex-bg"></div>
  <div class="hex-service">🥷</div>
</div>
```

You're describing a structure that the browser's **layout engine** must understand, position, style, and paint. The browser goes through several expensive phases every time something changes:

1. **Style recalculation** — which CSS rules apply to which elements?
2. **Layout** — where on screen does each element sit? (Box model, flexbox, grid)
3. **Composite** — any CSS transforms, opacity, or filters to apply?
4. **Paint** — actually writing pixels to the display

This pipeline is very powerful for documents (that's what it was designed for). But it is **stateful** — the browser is maintaining thousands of live objects, tracking what changed, and trying to minimise repaints. For a game with 99 hex tiles, that overhead is manageable. For a game with 260 animated tiles, moving characters, attack particles, and scroll/zoom, it becomes a serious problem.

CloudRealm's current rendering in numbers: 99 hex divs × 2 inner divs each = ~200 DOM nodes for the board alone. Add 12 service cards in the palette, the mission panel, SVG lines, and the topbar — you're around 400 DOM nodes on screen at once. That's fine today.

### The Canvas Model (Dungeon Architect's approach)

The **HTML5 Canvas API** gives you a single `<canvas>` element — essentially a 2D bitmap you can draw on directly. You don't create DOM nodes. You call drawing commands:

```js
ctx.fillStyle = '#3a1e58'
ctx.fillRect(x, y, width, height)

ctx.arc(cx, cy, radius, 0, Math.PI * 2)
ctx.fill()
```

These commands write pixels immediately. There's no layout engine, no style recalculation, no managed object tree. You're closer to drawing on a piece of graph paper with code.

The tradeoff: the browser tracks nothing for you. You're responsible for knowing where everything is, what it looks like, and repainting the entire scene from scratch every frame. This is called the **clear-and-redraw pattern**:

```js
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)  // wipe the slate
  drawAllTiles()     // repaint every tile
  drawAllCharacters() // repaint every character
  drawAllEffects()   // repaint every particle/attack
  requestAnimationFrame(draw) // do it again next frame
}
```

This sounds wasteful. It isn't — a 960×624 pixel canvas redraws in under 1ms on a modern GPU. The 60fps target gives you 16ms per frame — more than enough budget.

### The critical insight

The DOM model is optimised for **static documents that change occasionally**. The Canvas model is optimised for **continuously animated scenes that change every frame**. Games are the latter. As CloudRealm adds sprites, scrolling, zoom, and moving characters, the DOM model will become a performance bottleneck and a development headache. The Canvas model is designed for exactly this.

---

## Part 2 — The Game Loop

This is the most fundamental concept in game development, and CloudRealm doesn't have one yet.

### What is a game loop?

A webpage renders once, then waits for events (clicks, key presses). A game needs to do work continuously — characters move, animations run, effects tick, cooldowns decrement. The **game loop** is the heartbeat that drives this.

```js
function gameLoop(timestamp) {
  update(timestamp)              // advance all game state
  draw()                         // render the current state
  requestAnimationFrame(gameLoop) // schedule the next frame
}

requestAnimationFrame(gameLoop)  // start the loop
```

`requestAnimationFrame` (RAF) is the browser's mechanism for saying "call this function just before the next display refresh" — typically 60 times per second on a 60Hz monitor. It's far more efficient than `setInterval` because:
- It pauses automatically when the tab is hidden (no wasted work)
- It syncs to the display's refresh rate (no tearing)
- It receives a high-precision timestamp (critical for smooth motion)

### Why CloudRealm doesn't need one yet — but will

CloudRealm's current animations (the pulsing valid-tile highlight, the dashed connection lines) are handled by CSS `@keyframes`. The browser runs those animations internally. For static, CSS-driven effects, this is fine.

The moment you want:
- A character that walks across the board over 2 seconds
- A projectile that flies from service A to service B
- A "threat wave" that approaches the kingdom from the right
- Smooth zoom/pan when the player scrolls

...you need a game loop. CSS animations can't respond to game state — they don't know if a character is blocked, slowed, or dead. The game loop is where you tie animation to logic.

### Delta time — the most important concept in smooth game development

Frames don't always take 16ms. On a slow machine, a frame might take 40ms. On a high-refresh display, 8ms. If you move a character by a fixed number of pixels per frame, it moves faster on fast machines and slower on slow ones. This is called a **frame-rate-dependent update**, and it's a bug.

The fix is **delta time** — measuring how many milliseconds have elapsed since the last frame, and using that to scale all movement:

```js
let lastTime = 0

function gameLoop(now) {
  const deltaMs = now - lastTime  // how long since last frame?
  lastTime = now

  // Move at 100 pixels per second, regardless of frame rate
  character.x += 100 * (deltaMs / 1000)
  // At 16ms delta: 100 * 0.016 = 1.6 pixels this frame
  // At 40ms delta: 100 * 0.040 = 4.0 pixels this frame
  // Both cover the same distance per real second

  requestAnimationFrame(gameLoop)
}
```

This is the same pattern used in every professional game engine. A character specified to move at "2 tiles per second" moves at exactly that speed regardless of the device running the game.

---

## Part 3 — State Management at Scale

### CloudRealm's current approach

CloudRealm uses a single plain JavaScript object:

```js
const state = {
  grid: buildGrid(),
  placed: [],
  selectedServiceId: null,
  gold: 100,
  completedMissions: new Set(),
  activeMission: 0,
};
```

This works perfectly at the current scale. When something changes, the relevant render function is called manually (`renderGrid()`, `renderPalette()`, `renderMissions()`). Simple, readable, zero dependencies.

### Where this breaks down

The problem is **synchronisation**. Right now, `renderGrid()` re-creates all 99 hex divs from scratch on every placement. That's fine for 99 static tiles. But consider:

1. You add moving characters. Each character needs to update its position 60 times per second. You cannot call `renderGrid()` 60 times a second — recreating 99 DOM nodes plus all their children per frame would cause visible lag and consume significant memory.

2. You add multiple game phases (build phase, wave phase, results screen). Each phase has different UI. Managing which render functions to call in which phase, from a single state object, becomes spaghetti.

3. You want the mission panel to update when services are placed *without* re-rendering the entire board. With manual render calls, you either re-render everything or write increasingly specific logic about which functions to call when.

### The Zustand approach (from Dungeon Architect)

Zustand is a global state store — a single object that holds all game state, and a subscription system that re-renders only the components that care about each piece of state:

```js
// Any component can subscribe to exactly the slice it needs
function GoldDisplay() {
  const gold = useGameStore(s => s.gold)  // only re-renders when gold changes
  return <div>{gold}🪙</div>
}
```

This is **reactive state management**. Components declare what they depend on. When that data changes, only those components update. The game loop, running in RAF, reads state through refs (not subscriptions) — it never triggers re-renders itself.

The key architectural pattern Dungeon Architect demonstrates: **simulation is pure, rendering is a side effect**.

```
game state → simulationTick(state, deltaMs) → new game state
new game state → draw(newState) → pixels on screen
```

The simulation function takes data in and returns data out. It never touches the DOM, never calls render functions, has no knowledge of React or canvas. You could run it in Node.js for testing. This separation makes the system easy to reason about, easy to test, and easy to extend.

---

## Part 4 — The Canvas Rendering Pipeline

Understanding how Dungeon Architect renders its game — and why — is essential for planning CloudRealm's future.

### Draw order = z-depth

Canvas has no concept of CSS `z-index`. The order you draw things is the order they appear — later draws paint over earlier ones. Dungeon Architect's draw order each frame:

```
1. Clear canvas
2. Tile backgrounds (every tile, fill + border)
3. Tile sprites (trap/tower animations on each tile)
4. Range preview / hover highlight
5. Attack effects (projectiles, sword arcs)
6. Heroes (always on top of everything)
```

This is the **painter's algorithm** — paint background first, foreground last. In CloudRealm terms, you'd want:

```
1. Clear
2. Terrain tiles (void, wall, public, private)
3. VPC connection lines
4. Placed service buildings
5. Moving characters (Lambda ninjas walking, EC2 knights patrolling)
6. Attack/event effects (data packets flying, threat animations)
7. UI overlays (valid/invalid tile highlight, selection ring)
```

### Clipping — keeping sprites inside their tiles

When you draw a sprite on a tile, you often want to ensure it doesn't visually bleed onto adjacent tiles. Canvas `clip()` creates a drawing mask:

```js
ctx.save()
ctx.beginPath()
ctx.rect(tileX, tileY, TILE_SIZE, TILE_SIZE)  // mask to this tile
ctx.clip()
drawServiceSprite(ctx, tileX, tileY, t)       // anything outside mask is invisible
ctx.restore()
```

This is directly applicable to CloudRealm — a Lambda ninja's walking animation should stay inside its hex tile (except during special move animations where you intentionally break the clip).

### Programmatic sprites — drawing without image files

Dungeon Architect draws all its characters in code — no PNG files, no sprite sheets. A knight is made of filled rectangles and arcs:

```js
function drawKnight(ctx, cx, cy, t) {
  // Helmet
  ctx.fillStyle = '#8a9aa8'
  ctx.fillRect(cx - 8, cy - 20, 16, 14)

  // Body  
  ctx.fillStyle = '#6a7a88'
  ctx.fillRect(cx - 9, cy - 6, 18, 14)

  // Walking legs (animated)
  const lLeg = Math.sin(t * 0.009) * 6
  ctx.fillRect(cx - 7, cy + 8 + lLeg * 0.4, 6, 9)
  ctx.fillRect(cx + 1, cy + 8 - lLeg * 0.4, 6, 9)
}
```

The walking animation is driven entirely by `Math.sin(t * speed)` — the time value `t` cycles the sine wave, and the legs oscillate in opposite phase. This is the core of all sprite animation without image assets.

For CloudRealm's AWS services, each service would have a unique sprite that reflects its personality:
- **Lambda Ninja** — a small, dark-cloaked figure. When idle: crouched, barely visible. When "invoked": briefly materialises, strikes, vanishes back into invisibility.
- **EC2 Knight** — a solid armoured figure, always upright, always present. Slight breathing idle animation.
- **RDS Library** — a stone building with glowing rune windows. Warm light pulsing inside.
- **SQS Raven Queue** — small ravens perched and queuing, occasionally one flies off toward an adjacent Lambda.

All of this is achievable with basic Canvas 2D shapes. No art degree required.

### Time-based animation: Math.sin()

The universal tool for sprite animation is the sine function. `Math.sin(t * speed)` produces a smooth wave between -1 and +1 continuously, where `t` is the elapsed milliseconds:

```js
// Bobbing up and down (±2 pixels, ~1 cycle per second)
const bob = Math.sin(t * 0.006) * 2

// Pulsing brightness (0 to 1 to 0, use for glows)
const pulse = (Math.sin(t * 0.004) + 1) / 2

// Sharp on/off blink (for the Lambda ninja "appearing")
const blink = Math.floor(t * 0.008) % 2 === 0 ? 1 : 0

// Walk cycle (alternating feet)
const walkFrame = Math.floor(t * 0.006) % 2
```

The speed constant controls frequency. A larger multiplier = faster oscillation:
- `0.002` = slow pulse (~3 seconds per cycle)
- `0.006` = medium bob (~1 second per cycle)
- `0.015` = fast vibration (~0.4 seconds per cycle)

This is how every idle animation, ability effect, and ambient visual in Dungeon Architect works — a handful of sine waves combined.

---

## Part 5 — Architecture Patterns Compared

### The event system

Dungeon Architect's simulation emits **events** — plain objects describing what happened:

```js
events.push({ type: 'hero_killed', hero: hero.id, gold: 30 })
events.push({ type: 'trap_triggered', trapKey: '5,6', trap: 'spike' })
```

The game loop consumes these events to update the battle log, trigger animations, and award gold. The simulation doesn't *do* any of that — it just reports what happened. Consumers decide what to do with the information.

This is event-driven architecture — the same pattern as AWS SNS/SQS. The simulation is the producer. The store, the battle log, and the animator are consumers. They're decoupled — you can add a new consumer (say, a sound effect system) without modifying the simulation.

For CloudRealm, events will become essential:
- `service_placed` → trigger a placement animation, update connections
- `mission_completed` → trigger a fanfare effect, unlock the next mission
- `threat_incoming` → trigger a warning animation on affected services
- `data_packet_sent` → spawn a particle flying along a connection line

### The state machine pattern

Both games use state machines — systems that can be in exactly one of a fixed set of states, with explicit transitions between them.

Dungeon Architect's top-level state machine:
```
MENU → (start) → PLAN → (send wave) → WAVE → (wave ends) → RESULTS → (pick upgrade) → PLAN
```

CloudRealm's current implicit state machine:
```
IDLE (no selection) ↔ SERVICE_SELECTED (tile pulsing)
```

As CloudRealm grows, the state machine will need more phases:
```
TITLE → (start) → BUILD → (run simulation) → WAVE → (wave resolves) → DEBRIEF → (next mission) → BUILD
```

A proper phase system means you never have UI elements visible in the wrong context, interaction handlers that fire at the wrong time, or modal states that conflict with each other.

### The separation of simulation and rendering

This is the most important architectural lesson from Dungeon Architect, and the one that matters most for CloudRealm's future.

Dungeon Architect's `simulation.js` is a **pure function**:

```js
function simulationTick(heroes, grid, deltaMs, trapTimers) {
  // process everything...
  return { heroes, events, treasureDamage, goldEarned, trapTimers }
}
```

It takes data in. It returns data out. It has no knowledge of React, canvas, DOM, or the browser. It could be tested in Node.js. It could run on a server. It could be serialised and replayed.

CloudRealm's current logic is mixed — `placeService()` updates state, calls `renderGrid()`, calls `renderPalette()`, calls `renderConnections()`, and calls `checkMissions()` all in sequence. The logic and the rendering are tangled.

As the game grows, this becomes unmanageable. The right model:

```
1. Update state (pure logic — no DOM touching)
2. Render state to screen (read-only access to state)
```

These should be two completely separate concerns.

---

## Part 6 — The Zoom, Scroll, and Sprite Problem

The user's vision for CloudRealm includes scrolling the map, zooming in and out, and having sprites for each service. Let's be direct about what each approach can and cannot do.

### Zoom and scroll with the DOM

You can implement basic zoom in the DOM with CSS `transform: scale()` on the grid wrapper. Scroll works with CSS overflow. This approach has significant limits:

- Text and emoji don't scale cleanly — they become blurry at non-native sizes
- CSS clip-path (currently used for hex shapes) and `transform: scale()` interact poorly, causing sub-pixel rendering artifacts
- At extreme zoom levels, the browser struggles to composite hundreds of transformed DOM nodes efficiently
- Implementing "scroll to zoom on cursor position" (the standard map zoom behaviour) requires non-trivial transform-origin math on a DOM element tree

For a small static board with no characters, DOM zoom is manageable. For a living map with characters, effects, and variable tile density, it becomes fragile.

### Zoom and scroll with Canvas

Canvas zoom is essentially free. The Canvas 2D API has a full transform stack:

```js
ctx.save()
ctx.translate(panX, panY)  // pan offset
ctx.scale(zoomLevel, zoomLevel)  // zoom factor

// Now draw everything in "world space"
// coordinates are automatically scaled and panned
drawGrid()
drawServices()
drawCharacters()

ctx.restore()
```

To zoom toward the cursor (so the point under the mouse stays fixed):

```js
function onWheel(e) {
  const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1
  // Translate so cursor is at origin, scale, translate back
  panX = e.offsetX - (e.offsetX - panX) * zoomDelta
  panY = e.offsetY - (e.offsetY - panY) * zoomDelta
  zoomLevel *= zoomDelta
}
```

This is 5 lines. With DOM elements, the equivalent requires transform-origin calculations per element and is much more brittle.

### Sprites with the DOM

Emoji are not sprites. They're Unicode characters rendered by the OS font system — they look different on Mac, Windows, and Android, they don't scale predictably, and they can't be animated frame-by-frame. At 2× zoom, emoji become large anti-aliased blobs.

To add real sprites to a DOM-based implementation, you'd use `<img>` tags or CSS `background-image` with sprite sheets. This requires image asset files (PNG or SVG), HTTP requests to load them, and complex CSS background-position calculations to select individual frames.

Canvas makes sprites trivial. You draw them with code or draw them from image files using `ctx.drawImage()`. Either way, they scale perfectly with the canvas zoom transform, they're pixel-precise, and they animate via the game loop rather than external animation files.

---

## Part 7 — Recommendation: The Migration Path

### Should we migrate now?

Not a full rewrite. The right approach is to migrate incrementally, starting with the render layer.

CloudRealm's game data, zone logic, mission system, and interaction model are all solid. The architecture that needs to evolve is: how the board is rendered.

The recommended progression is three phases:

---

### Phase 1 — Add a Canvas layer alongside the existing DOM (do this next)

Keep the existing panel layout (palette, board, missions). Replace only the hex grid `<div>` tree with a `<canvas>` element. Draw the hex tiles on canvas. Keep the DOM panels for the palette and missions.

This is a hybrid approach — the UI panels remain as HTML, the game board becomes a Canvas. This is exactly how professional games are structured: canvas for the game world, DOM for the HUD/menus.

**What you gain immediately:**
- Smooth zoom/pan on the game board
- Pixel-precise hex rendering (the current hexes have clip-path dead zones at corners — canvas hexes are mathematically perfect)
- Ability to draw basic sprites instead of emoji
- Foundation for a game loop

**What changes:**
- `renderGrid()` becomes `drawBoard(ctx, state, t)` — a pure draw function
- Hex hit detection changes from DOM click events to `canvas.addEventListener('click', e => { const hex = pixelToHex(e.offsetX, e.offsetY) })`
- The `clip-path` pointer-events workaround goes away entirely

**Hex to pixel / pixel to hex math (essential for Canvas hex grids):**

```js
// Given hex row and col, return the pixel center (odd-r offset)
function hexToPixel(row, col) {
  const x = col * HEX_W + (row % 2 === 1 ? HEX_W / 2 : 0) + HEX_W / 2
  const y = row * HEX_H * 0.75 + HEX_H / 2
  return { x, y }
}

// Given a pixel coordinate, return which hex it's in
function pixelToHex(px, py) {
  const row = Math.round((py - HEX_H / 2) / (HEX_H * 0.75))
  const col = Math.round((px - (row % 2 === 1 ? HEX_W / 2 : 0) - HEX_W / 2) / HEX_W)
  return { row, col }
}
```

This is the core of any canvas hex grid — perfect hit detection regardless of zoom level.

---

### Phase 2 — Add the game loop and basic sprites

Once the board is on canvas, add `requestAnimationFrame`:

```js
function gameLoop(now) {
  const dt = now - lastTime
  lastTime = now

  updateState(dt)        // advance any running animations
  drawBoard(ctx, state, now) // redraw everything
  requestAnimationFrame(gameLoop)
}
```

Replace emoji with programmatic sprites drawn with Canvas 2D. Start simple — each service is a distinct shape and colour that clearly communicates its identity. The Lambda Ninja is a small dark triangle. The RDS Library is a rectangular building with lit windows. Iterate from there.

Add idle animations: each service's sprite uses `Math.sin(t * speed)` to animate in place. Lambda pulses and fades slightly (ephemeral feel). EC2 stands perfectly still with a tiny breathing bob (always on, dependable). SQS shows small dots moving in an arc (messages flowing).

---

### Phase 3 — Add Zustand and component architecture

As the game grows past a single file, the manual state + render-function approach becomes unwieldy. This is when to introduce React + Zustand — following the exact architecture Dungeon Architect demonstrates.

The `game/` folder pattern is particularly worth adopting:

```
src/
├── game/
│   ├── constants.js     — all game data (services, missions, grid shape)
│   ├── simulation.js    — pure tick function, no DOM, no React
│   ├── sprites.js       — all canvas drawing functions
│   └── hexGrid.js       — hex math (hexToPixel, pixelToHex, neighbours)
├── store/
│   └── gameStore.js     — Zustand: all state + actions
└── components/
    ├── GameBoard.jsx    — canvas element + RAF loop
    ├── ServicePalette.jsx — left panel
    └── MissionPanel.jsx — right panel
```

The simulation function signature for CloudRealm would look like:

```js
// Pure function — no side effects, easily testable
function simulationTick(state, deltaMs) {
  // Advance any moving characters
  // Check for threats/attacks
  // Evaluate mission conditions
  // Emit events
  return { state: newState, events }
}
```

This is the architecture that scales. You can add 50 missions, 20 service types, wave mechanics, multiplayer sync, and none of it requires changing how the render loop works — you just add to the simulation and let the canvas read the new state.

---

## Part 8 — Decision Matrix

For each feature on CloudRealm's roadmap, here is which approach enables it cleanly:

| Feature | DOM/CSS | Canvas + RAF |
|---|---|---|
| Static hex board | ✅ Works now | ✅ Straightforward |
| Click-to-place interaction | ✅ Works now | ✅ `pixelToHex()` on click |
| Pulsing tile highlights | ✅ CSS `@keyframes` | ✅ `Math.sin(t)` in draw |
| Connection lines | ✅ SVG overlay | ✅ `ctx.lineTo()` |
| Zoom / pan the map | ⚠️ Fragile, clipping issues | ✅ `ctx.scale() + translate()` |
| Real sprites per service | ❌ Requires PNG files, CSS complexity | ✅ Drawn in code |
| Moving characters | ❌ Re-creating DOM nodes at 60fps | ✅ Clear-and-redraw in loop |
| Attack projectile animations | ❌ CSS transitions can't respond to game state | ✅ Lerp in RAF loop |
| Scroll to zoom on cursor | ❌ Complex transform-origin math | ✅ 5 lines of math |
| Wave/threat mechanics | ⚠️ Possible but render will thrash | ✅ Simulation tick pattern |
| Frame-rate independence | ❌ No loop = no delta time | ✅ Delta time in RAF |
| Multiplayer / state sync | ⚠️ Possible but tangled with render | ✅ Pure simulation is serialisable |

The conclusion is clear: for the static, placement-focused game CloudRealm is today, the DOM approach is fine. For the animated, sprite-rich, scrollable, wave-driven game it's becoming, Canvas + RAF is not just better — it's the only viable path.

---

## Summary

Two projects, two philosophies, one right answer for CloudRealm's future.

CloudRealm started as a DOM/CSS game because it was the fastest path from zero to playable. That was the right call — building something working quickly is always the right first move. The architecture got us here.

Dungeon Architect shows the architecture CloudRealm needs to grow into: a Canvas rendering layer that clears and redraws every frame, a `requestAnimationFrame` loop with delta-time-scaled movement, a pure simulation function that's decoupled from rendering, and a global state store that lets any part of the UI subscribe to exactly the data it needs.

The migration isn't a rewrite — it's an evolution. The game data, zone logic, mission system, and interaction model stay. The rendering layer migrates from DOM elements to canvas draw calls. Once that move is made, every feature on the roadmap (sprites, zoom, moving characters, projectiles, wave mechanics) becomes straightforward to build rather than an increasingly painful DOM-wrestling exercise.

The engineers who built Dungeon Architect made the same journey. They started with a simple concept, discovered the limits of the DOM approach during development, and built the canvas/RAF/Zustand architecture that let them ship walking heroes, animated traps, attack projectiles, and a wraith that physically flies across the screen. CloudRealm can follow the same path — and now you know exactly why each step in that path exists.
