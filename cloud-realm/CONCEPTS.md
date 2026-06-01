# CloudRealm — How It All Works
### A Complete Technical Guide for Engineers Who Have Never Built a Frontend

This document explains every major concept in the CloudRealm codebase from the ground up. It assumes you are comfortable writing code that runs top-to-bottom — scripts, functions, APIs, backend services — but have never built a user interface, never touched a browser game, and have no mental model for how graphical, real-time, event-driven software works.

By the end of this document you will understand why every file exists, why every pattern was chosen, and how the pieces talk to each other.

---

## Part 1 — The Browser Is Not a Script Runner

The most important shift in thinking: **a web application does not run to completion**.

When you write a Python script or a CLI tool, execution flows from top to bottom. It starts, it does work, it exits. The computer is yours for the duration. When it's done, it's done.

A browser application is different. The browser is a **runtime environment** — like a server that never shuts down. When your JavaScript loads, it runs the setup code, then it *waits*. It waits for mouse clicks, keyboard presses, network responses, and timer callbacks. The application never "finishes". It sits there, alive, responding to things that happen.

This is called **event-driven programming**. Nothing happens unless something triggers it.

```
Linear script:          Event-driven app:
                        
start                   start
  |                       |
  do A                    setup (run once)
  |                       |
  do B                    wait ──────────────────────────
  |                                                      |
  do C                    ← user clicks          respond to click
  |                                                      |
  exit                    wait ──────────────────────────
                                                         |
                          ← timer fires          respond to timer
                                                         |
                          wait ──────────────────────────
                          (forever)
```

Every `addEventListener`, every React component that renders, every `requestAnimationFrame` callback — they are all responses to events. Understanding this is the key to understanding everything that follows.

---

## Part 2 — The DOM: What It Is and Why We Don't Use It for Games

### What the DOM actually is

When the browser loads an HTML file, it parses it and builds a tree of objects in memory. This tree is called the **Document Object Model** (DOM). Every `<div>`, `<button>`, and `<span>` becomes a live object with properties, methods, and relationships to its parent and children.

When you write JavaScript that changes a `div`'s colour or adds a new element, you are mutating this tree. The browser watches the tree constantly and repaints the screen when things change.

This is powerful for documents and UIs. It is the wrong tool for a game.

### Why the DOM struggles with games

When something changes in the DOM, the browser must:
1. Figure out which CSS rules now apply (style recalculation)
2. Recompute the position and size of every affected element (layout)
3. Determine what actually needs to be repainted (compositing)
4. Write pixels to the screen (paint)

For a game where the state of 99 hex tiles is being re-evaluated 60 times per second — and where dozens of sprites are animating simultaneously — this pipeline becomes a bottleneck. The browser is doing enormous amounts of bookkeeping for a problem that doesn't need it.

The other problem: pointer events. The DOM fires mouse events only over the *visible* portion of an element. We used CSS `clip-path` to make hex shapes in the old `aws-rpg.html`. The browser respected that clip path when deciding whether to fire events — meaning the invisible triangle corners of each hex were dead zones. We spent significant effort working around this. It was a fundamental mismatch between the tool and the problem.

---

## Part 3 — The Canvas: A Blank Bitmap

**HTML5 Canvas** is the alternative. It is a single `<canvas>` element that behaves like a sheet of graph paper you draw on with code. There are no managed objects. There is no layout engine. There is no event system watching individual drawn shapes. There is only: you write pixels, they appear.

```js
const canvas = document.getElementById('my-canvas')
const ctx    = canvas.getContext('2d')   // the drawing API

ctx.fillStyle = '#3a1e58'
ctx.fillRect(10, 10, 100, 50)   // draw a purple rectangle at (10,10), 100×50
```

That's it. You give coordinates and colours. Pixels are written. The browser has no further knowledge of what you drew — it doesn't know there's a "purple rectangle" there. It just has a bitmap.

### The consequence: you own everything

Since the browser doesn't track what you've drawn, *you* must:
- Remember where every object is
- Repaint everything every frame
- Do your own hit detection (is the mouse click inside this hex?)

This sounds like more work. It is. But it trades away complexity for control — and for performance. Redrawing a 960×624 canvas 60 times per second takes less than a millisecond on modern hardware. The DOM equivalent (recreating 99 hex elements per frame) would visibly lag.

---

## Part 4 — The Game Loop and `requestAnimationFrame`

### The fundamental pattern of real-time software

Every game, every animation, every interactive real-time system is built on the same pattern:

```
while (true) {
  update()   // advance the state of the world
  draw()     // render the current state
  sleep(16ms) // wait until next frame
}
```

This is a **game loop**. But you can't write this literally in a browser — a `while(true)` loop would freeze the entire tab. The browser is single-threaded. Your JavaScript and the browser's rendering both run on the same thread. If your code never yields, nothing else can run.

### `requestAnimationFrame` — the browser's game loop mechanism

`requestAnimationFrame` (RAF) solves this. Instead of blocking in a loop, you ask the browser: *"call my function just before you paint the next frame"*.

```js
function draw(timestamp) {
  // ... update and draw everything ...
  requestAnimationFrame(draw)  // ask to be called again next frame
}

requestAnimationFrame(draw)  // start the loop
```

The browser calls `draw`, then goes off and does other things (handling events, running garbage collection, painting the screen). Before it paints the next frame — typically 16 milliseconds later — it calls `draw` again.

This gives you roughly 60 calls per second, which is why games target 60 fps. Each call is one **frame**.

### Why RAF is better than `setInterval`

`setInterval(fn, 16)` fires approximately every 16ms regardless of anything. Problems:
- It fires even when the tab is hidden, wasting CPU
- It doesn't synchronise to the display's refresh rate, causing screen tearing
- The 16ms is approximate — real timing drifts

RAF solves all three:
- Pauses automatically when the tab is hidden
- Syncs to the display (60Hz screen → 60fps, 120Hz screen → 120fps)
- Provides a precise high-resolution timestamp (the `timestamp` argument)

### Where this lives in CloudRealm

In `GameBoard.jsx`, the RAF loop starts in a `useEffect` and runs for the lifetime of the component:

```js
const draw = useCallback((now) => {
  // ... draw everything ...
  animRef.current = requestAnimationFrame(draw)
}, [])

useEffect(() => {
  animRef.current = requestAnimationFrame(draw)
  return () => cancelAnimationFrame(animRef.current)  // cleanup on unmount
}, [draw])
```

The return value of `requestAnimationFrame` is a handle — you can pass it to `cancelAnimationFrame` to stop the loop. The `useEffect` cleanup does this when the component unmounts (navigating away, hot-reload, etc.).

---

## Part 5 — Delta Time: Frame-Rate Independence

### The problem with fixed-pixel movement

Suppose you want to move a character 2 pixels per frame:
```js
character.x += 2
```

On a 60fps device: moves 120 pixels per second.  
On a 30fps device: moves 60 pixels per second.  
On a 120fps device: moves 240 pixels per second.

The character moves at different speeds depending on the machine. This is a bug.

### The fix: time-based movement

Instead of "pixels per frame", think "pixels per second". Then scale the movement by how much time actually elapsed since the last frame:

```js
let lastTime = 0

function draw(now) {
  const deltaMs = now - lastTime   // ms since last frame
  lastTime = now

  // Move at 120 pixels/second, regardless of frame rate
  character.x += 120 * (deltaMs / 1000)
  //                         ↑
  //              converts "per second" to "per this frame"

  requestAnimationFrame(draw)
}
```

At 60fps (deltaMs ≈ 16): `120 * 0.016 = 1.92` pixels this frame.  
At 30fps (deltaMs ≈ 33): `120 * 0.033 = 3.96` pixels this frame.  
Both travel the same distance per real-world second. ✓

CloudRealm's draw loop receives `now` (from RAF) and can compute delta time. All future animation and movement should be expressed in units-per-second, then multiplied by `deltaMs / 1000`. This is one of the most important concepts in game development.

---

## Part 6 — Canvas Drawing: The API

All drawing goes through the **2D context** (`ctx`). You get it once and keep it:

```js
const ctx = canvas.getContext('2d')
```

### The coordinate system

Canvas uses screen coordinates:
- **(0, 0)** is the top-left corner
- **X increases to the right**
- **Y increases downward** ← this trips up mathematicians used to Y going up

### Primitives

```js
// Filled rectangle
ctx.fillStyle = '#3a2a10'
ctx.fillRect(x, y, width, height)

// Stroked (outlined) rectangle
ctx.strokeStyle = '#aa7820'
ctx.lineWidth = 2
ctx.strokeRect(x, y, width, height)

// Circle or arc
ctx.beginPath()
ctx.arc(cx, cy, radius, startAngle, endAngle)
ctx.fill()    // or .stroke()

// Arbitrary polygon
ctx.beginPath()
ctx.moveTo(x1, y1)       // pick up pen at start
ctx.lineTo(x2, y2)       // draw line to next point
ctx.lineTo(x3, y3)
ctx.closePath()           // connect last point back to first
ctx.fill()
```

### `beginPath()` — the most important method you'll forget

Canvas maintains a **current path** — a collection of lines and curves you're building up. When you call `fill()` or `stroke()`, it fills/strokes whatever the current path is.

If you don't call `beginPath()` before starting a new shape, the old path is still there and gets included in the next fill/stroke. This causes mysterious ghosting and double-drawing bugs. Always call `beginPath()` before starting a new shape.

### Alpha and compositing

```js
ctx.globalAlpha = 0.5     // all subsequent draws at 50% opacity
ctx.fillStyle = 'rgba(255, 0, 0, 0.3)'  // red at 30% opacity
```

This is how the Lambda sprite flickers — `globalAlpha` is set to a value driven by `Math.sin(t)`, making the entire sprite fade in and out.

---

## Part 7 — The `save()` / `restore()` Stack: Transforms Without Chaos

When you rotate, scale, or translate the canvas, those transforms apply to everything drawn afterwards. This creates a problem: how do you draw one rotated thing without affecting everything else?

### The state stack

`ctx.save()` pushes a snapshot of the entire canvas state (current transform, fill colour, stroke style, alpha, clip region, line width — everything) onto a stack. `ctx.restore()` pops back to that snapshot.

```js
ctx.fillStyle = 'red'     // currently red

ctx.save()                // push state: { fillStyle: 'red', transform: identity }
  ctx.fillStyle = 'blue'  // now blue
  ctx.rotate(0.5)         // now rotated
  ctx.fillRect(0, 0, 50, 50)  // draws a rotated blue rect
ctx.restore()             // pop state: back to { fillStyle: 'red', transform: identity }

ctx.fillRect(0, 0, 50, 50)  // draws a normal red rect
```

Think of it as a stack of context "profiles". `save` pushes, `restore` pops.

### Transforms: translate, rotate, scale

```js
ctx.save()
ctx.translate(cx, cy)   // move the origin to (cx, cy)
ctx.rotate(angle)       // rotate around the new origin (in radians, not degrees!)
ctx.scale(2, 2)         // make everything 2× larger
// draw stuff in this transformed space
ctx.restore()
```

The key insight: after `translate(cx, cy)`, drawing at `(0, 0)` actually draws at the world position `(cx, cy)`. This lets you write sprite drawing code relative to the sprite's centre, without knowing where the sprite is.

The camera system in CloudRealm uses exactly this:

```js
ctx.save()
ctx.translate(panX, panY)   // shift everything by the pan amount
ctx.scale(zoom, zoom)       // scale everything by the zoom level
// draw the entire world in "world space"
ctx.restore()
```

Everything drawn between `save()` and `restore()` is automatically transformed by the camera.

---

## Part 8 — Math.sin: The Universal Animation Primitive

`Math.sin(angle)` returns a value between -1 and +1, tracing a smooth wave as the angle increases. If you pass time (in milliseconds) multiplied by a speed constant, you get a continuously oscillating value:

```js
const t = performance.now()   // ms since page load, always increasing

const wave = Math.sin(t * 0.006)   // oscillates -1 → +1 → -1, ~1 cycle/second
```

The speed constant controls frequency:
- `0.002` → one full cycle every ~3 seconds (very slow pulse)
- `0.006` → one full cycle per second (gentle bob)
- `0.015` → ~2.5 cycles per second (fast flicker)

You can derive useful variants:

```js
// 0 to 1 to 0 (always positive — use for opacity, brightness)
const pulse = (Math.sin(t * 0.005) + 1) / 2

// Absolute value — bouncing (like a ball hitting the floor)
const bounce = Math.abs(Math.sin(t * 0.006))

// Walk cycle: sharply alternates 0 and 1
const step = Math.floor(t * 0.008) % 2
```

Every idle animation in `sprites.js` uses one of these forms. The Lambda ninja's flicker is `globalAlpha = 0.45 + osc * 0.55`. The Great Library's warm window glow is a `rgba(255,200,80, warmGlow * 0.7)`. The connection line dash offset is `-(t * 0.04 % 12)` — making the dashes appear to flow along the line.

There is nothing more to animation than passing time into a mathematical function and using the result to drive a visual property. The simplicity is the point.

---

## Part 9 — Hex Grid Mathematics

This is one of the harder parts of the project. Hexagons don't align to a regular grid the way squares do, which means the math for converting between grid coordinates and pixel coordinates is non-trivial.

### Pointy-top hexagons

CloudRealm uses **pointy-top** hexagons — the vertex (corner) is at the top, and flat sides are on the left and right. The alternative is flat-top (flat edge at top). The maths differ between the two.

For a pointy-top hex with **outer radius** `R` (distance from centre to any vertex):
- Width  = `R * √3`   (distance between left and right flat sides)
- Height = `R * 2`    (distance between top and bottom vertices)

### Drawing a hex on canvas

A regular hexagon has 6 vertices spaced evenly around a circle. For pointy-top, the first vertex is at the top (angle = -90°, or -π/2 radians):

```js
function drawHex(ctx, cx, cy, R) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2  // -90°, then +60° each step
    ctx.lineTo(
      cx + R * Math.cos(angle),
      cy + R * Math.sin(angle)
    )
  }
  ctx.closePath()
}
```

At `i=0`: angle = -π/2, cos(-π/2) = 0, sin(-π/2) = -1 → top vertex at (cx, cy - R) ✓  
At `i=1`: angle = -π/6, cos = 0.866, sin = -0.5 → upper-right vertex ✓

### The odd-r offset grid

To tile hexagons into a grid, we use **odd-r offset coordinates** — rows and columns just like a 2D array, but odd-numbered rows are shifted right by half a column.

```
Row 0:  [0,0]  [0,1]  [0,2]  [0,3]  [0,4]
Row 1:    [1,0]  [1,1]  [1,2]  [1,3]  [1,4]   ← shifted right by COL_STEP/2
Row 2:  [2,0]  [2,1]  [2,2]  [2,3]  [2,4]
```

Converting grid coordinates to pixel centre:

```js
const COL_STEP = R * Math.sqrt(3)   // horizontal distance between centres
const ROW_STEP = R * 1.5            // vertical distance between centres

function hexCenter(row, col) {
  const x = col * COL_STEP + (row % 2 === 1 ? COL_STEP / 2 : 0)
  const y = row * ROW_STEP
  return { x, y }
}
```

Why `ROW_STEP = R * 1.5`? Adjacent rows overlap vertically. A hex is `2R` tall, but adjacent row centres are only `1.5R` apart — they interlock like teeth.

### Converting pixels back to hex (click detection)

This is the reverse: given a pixel coordinate, which hex is it inside?

```js
function pixelToHex(px, py) {
  let row = Math.round(py / ROW_STEP)
  const adjustedX = (row % 2 === 1) ? px - COL_STEP / 2 : px
  let col = Math.round(adjustedX / COL_STEP)
  // clamp to valid range
  return { row, col }
}
```

This is an approximation — it works well for clicks near the centre of tiles. A more precise version (using axial coordinates and cube rounding) handles clicks exactly at hex boundaries, but for typical user interaction this simpler version is indistinguishable.

### Neighbours

In the odd-r system, the six neighbours of a hex depend on whether the row is even or odd:

```js
function getNeighbors(row, col) {
  const isOdd = row % 2 === 1
  const dirs  = isOdd
    ? [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]]   // odd row neighbours
    : [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]]  // even row neighbours
  return dirs
    .map(([dr, dc]) => ({ row: row+dr, col: col+dc }))
    .filter(({row: r, col: c}) => r >= 0 && r < ROWS && c >= 0 && c < COLS)
}
```

This offset asymmetry is the unintuitive part of hex grids. The neighbour directions are different for even and odd rows because of the stagger. Draw it out on paper once and it clicks immediately.

---

## Part 10 — React: Components, JSX, and the UI = f(state) Model

### What React actually does

React is a JavaScript library built on one idea: **the UI is a function of your state**. Write code that describes what the UI should look like for a given state, and React keeps the DOM in sync with that description automatically.

```
state changes → React re-runs your components → DOM updates
```

You never directly manipulate the DOM. You never call `document.getElementById('gold').textContent = newValue`. You just have a `gold` state value, and a component that reads it. When `gold` changes, React re-renders the component with the new value.

### Components

A **component** is a JavaScript function that returns JSX — a syntax that looks like HTML but compiles to JavaScript:

```jsx
// What you write (JSX)
function GoldDisplay({ gold }) {
  return <div style={{ color: 'gold' }}>🪙 {gold}</div>
}

// What the compiler produces
function GoldDisplay({ gold }) {
  return React.createElement('div', { style: { color: 'gold' } }, '🪙 ', gold)
}
```

Inside `{}` in JSX, you can put any JavaScript expression. Curly braces are the escape hatch from HTML-land into JavaScript-land.

Components accept **props** — arguments passed from the parent component. In the example above, `gold` is a prop. Props flow down the component tree. They cannot flow up.

### The component tree

CloudRealm's component tree:

```
App
└── GameScreen
    ├── HUD          ← reads: gold, placed.length, completedMissions
    ├── ServicePalette ← reads: selectedServiceId, placed
    ├── GameBoard    ← the canvas (reads everything via refs)
    └── MissionPanel ← reads: placed, completedMissions, activeMission
```

Each component is responsible for one piece of the UI. `HUD` knows nothing about the canvas. `MissionPanel` knows nothing about the palette. They only know their own props and the store slices they subscribe to.

### Re-rendering

When state changes, React calls the relevant component functions again and updates only the DOM nodes that changed. This is called **reconciliation**. It's the thing React is famous for being fast at.

For the canvas components, React re-renders don't directly affect what's drawn — the canvas is painted by the RAF loop. React manages the *HTML* panels (palette, missions, HUD); the RAF loop manages the *canvas*.

---

## Part 11 — React Hooks: Managing State and Side Effects

Hooks are functions starting with `use` that give function components superpowers: state, side effects, performance optimisations. They can only be called at the top level of a component (not inside loops or if-statements).

### `useState` — local component state

```js
const [count, setCount] = useState(0)
// count: current value
// setCount: function to update it
// 0: initial value
```

Calling `setCount(5)` triggers a re-render. The component function runs again, and `count` is now `5`.

CloudRealm uses Zustand for most state rather than `useState` directly — but the mechanism is the same.

### `useEffect` — running code in response to changes

Side effects (subscriptions, event listeners, starting timers, fetching data) go in `useEffect`:

```js
useEffect(() => {
  // This runs after the component renders
  window.addEventListener('keydown', handleKey)

  // Cleanup: runs when the component unmounts, or before the effect re-runs
  return () => window.removeEventListener('keydown', handleKey)
}, [handleKey])  // dependency array: re-run when handleKey changes
```

The **dependency array** controls when the effect re-runs:
- `[]` — run once, on mount only
- `[a, b]` — re-run whenever `a` or `b` changes
- (no array) — re-run after every render

In GameBoard.jsx, the RAF loop starts in a `useEffect([draw])`. Since `draw` has `[]` dependencies (created once), the effect also runs once — starting the loop at mount and cancelling it at unmount.

### `useRef` — mutable values that don't trigger re-renders

`useRef` is a box that holds a mutable value. Updating it does **not** trigger a re-render. Reading it always gives you the latest value.

```js
const countRef = useRef(0)
countRef.current = 5   // mutate directly — no re-render
console.log(countRef.current)  // 5
```

Two use cases in CloudRealm:

**1. Storing the RAF handle** so we can cancel it:
```js
const animRef = useRef(null)
animRef.current = requestAnimationFrame(draw)
// later:
cancelAnimationFrame(animRef.current)
```

**2. The critical refs pattern** — explained in Part 12.

### `useCallback` — stable function references

```js
const draw = useCallback((now) => {
  // draw everything
}, [])
```

`useCallback` returns the same function object on every render unless the dependencies change. This matters because functions in JavaScript are objects — a new function created on every render would be a new reference, causing `useEffect` to re-run and the RAF loop to restart.

With `[]` deps, `draw` is created once and reused forever. The `useEffect([draw])` that starts the loop runs only once.

---

## Part 12 — Zustand: Global State Without Prop Drilling

### The prop drilling problem

Without a state management solution, sharing data between distant components means passing props through every component in between:

```
App (has `gold`)
└── GameScreen (passes gold down)
    └── SomeMiddleComponent (passes gold down, doesn't use it)
        └── HUD (finally uses gold)
```

Every intermediate component has to forward a prop it doesn't care about. This is **prop drilling** and it becomes unmaintainable as the app grows.

### Zustand: a global store

Zustand creates a single global object holding all state, plus the functions that update it. Any component can subscribe to any piece of this state directly:

```js
// Define the store (once, in gameStore.js)
const useGameStore = create((set, get) => ({
  gold: 100,
  addGold(amount) {
    set({ gold: get().gold + amount })
  },
}))

// Use it in any component (no prop passing)
function HUD() {
  const gold = useGameStore(s => s.gold)  // subscribe to just this slice
  return <div>{gold}🪙</div>
}
```

The argument to `useGameStore` is a **selector** — a function that picks out the piece of state you care about. Zustand only re-renders `HUD` when `gold` changes, not when any other part of the store changes. This is efficient and intentional.

### `set` and `get`

Inside store actions, `set()` updates state and `get()` reads the current state:

```js
placeService(row, col) {
  const { gold, placed } = get()   // read current state
  // ... validate ...
  set({
    gold: gold - svcDef.cost,      // write new state
    placed: [...placed, newEntry],
  })
}
```

`set()` shallow-merges the object you pass — you only need to specify the fields that changed.

---

## Part 13 — The Stale Closure Problem: Why the RAF Loop Uses Refs

This is the most subtle concept in the codebase. Understanding it separates engineers who can confidently write React hooks from those who are confused by mysterious bugs.

### What is a closure?

A closure is a function that "captures" the variables in scope at the time it was created. When the function runs later, it sees those captured values — even if those variables have since changed.

```js
let count = 0

function printCount() {
  console.log(count)   // captures 'count'
}

count = 5
printCount()   // prints 5 — count is a normal variable, lookup happens at call time
```

This works because `count` is looked up in the outer scope each time `printCount` runs. But React's `useCallback` changes things.

### The stale closure bug

```js
function Counter() {
  const [count, setCount] = useState(0)

  const draw = useCallback(() => {
    console.log(count)          // 'count' is CAPTURED at creation time
    requestAnimationFrame(draw)
  }, [])  // ← empty deps: created once, never recreated

  useEffect(() => { requestAnimationFrame(draw) }, [draw])
}
```

This looks fine, but it has a bug. When `draw` is created (on first render), `count` is `0`. Because `draw` is never recreated (empty deps), it always sees `count = 0`. Even after the user increments count to 5, the RAF loop still prints `0`. This is a **stale closure** — the function holds a stale reference to a variable that has since changed.

### The refs solution

```js
const countRef = useRef(count)
countRef.current = count   // update the ref on every render (always fresh)

const draw = useCallback(() => {
  console.log(countRef.current)   // reads ref, always up-to-date
  requestAnimationFrame(draw)
}, [])  // empty deps: loop never restarts, but always reads fresh data
```

`countRef` is an object. Objects are passed by reference in JavaScript. The `draw` function captures a reference to the `countRef` object — and since we update `countRef.current` on every render, reading `countRef.current` inside `draw` always gives the latest value.

In CloudRealm's `GameBoard.jsx`:

```js
const grid    = useGameStore(s => s.grid)
const placed  = useGameStore(s => s.placed)

const gridRef   = useRef(grid)
const placedRef = useRef(placed)

// These lines run on every render — keeping refs fresh
gridRef.current   = grid
placedRef.current = placed

const draw = useCallback((now) => {
  const grid   = gridRef.current    // always the latest grid
  const placed = placedRef.current  // always the latest placed array
  // ...
  requestAnimationFrame(draw)
}, [])  // loop is stable, refs are always current
```

This is why the pattern exists. Without it, the canvas would render a forever-frozen snapshot of the initial state.

---

## Part 14 — The Camera: World Space vs Screen Space

### Two coordinate systems

When the camera is applied, there are two coordinate systems in play:

**Screen space**: pixel coordinates on the actual canvas element. (0,0) is the top-left of the canvas in the browser window. These are what mouse events report.

**World space**: the coordinate system of the game world. The hex grid is laid out here. (0,0) is the top-left of the game board before any pan/zoom.

The camera transform converts from world space to screen space.

### How the camera transform works

```js
ctx.save()
ctx.translate(panX, panY)   // shift origin by pan
ctx.scale(zoom, zoom)       // scale everything
// draw in world space...
ctx.restore()
```

When you draw a hex at world position `(200, 150)` with `panX=50, panY=30, zoom=1.5`:

1. `ctx.translate(50, 30)` — origin moves from (0,0) to (50,30) in screen space
2. `ctx.scale(1.5, 1.5)` — everything is stretched 1.5×
3. Draw at `(200, 150)` in world space
4. Actual screen position: `((200 * 1.5) + 50, (150 * 1.5) + 30) = (350, 255)`

### Click detection: screen → world → hex

When the user clicks, the browser gives you screen-space coordinates. You need to convert to world space, then to hex:

```js
function handleClick(e) {
  const rect = canvas.getBoundingClientRect()
  const screenX = e.clientX - rect.left  // canvas-relative screen coords
  const screenY = e.clientY - rect.top

  // Invert the camera transform to get world coords
  const worldX = (screenX - panX) / zoom
  const worldY = (screenY - panY) / zoom

  // Convert world coords to hex grid coords
  const { row, col } = pixelToHex(worldX, worldY)

  handleHexClick(row, col)
}
```

Notice the inversion: the camera transform applies `+ panX`, so to reverse it you `- panX`. The camera applies `* zoom`, so to reverse it you `/ zoom`. This is the inverse transform.

### Zoom toward the cursor

When you scroll-zoom on a map, you expect the world point under the cursor to stay fixed. Achieve this by adjusting the pan to compensate for the zoom:

```js
function onWheel(e) {
  const mx    = e.clientX - rect.left  // cursor in canvas space
  const my    = e.clientY - rect.top
  const factor    = e.deltaY < 0 ? 1.12 : 0.89
  const newZoom   = clamp(zoom * factor, 0.4, 3.5)

  // The world point under the cursor should be the same before and after zoom.
  // Before: worldPoint = (mx - panX) / zoom
  // After:  worldPoint = (mx - newPanX) / newZoom
  // Solve for newPanX:
  const newPanX = mx - (mx - panX) * (newZoom / zoom)
  const newPanY = my - (my - panY) * (newZoom / zoom)

  setCamera({ panX: newPanX, panY: newPanY, zoom: newZoom })
}
```

This three-line derivation is the secret to every map zoom in every application. The world point under the cursor stays fixed while everything scales around it.

---

## Part 15 — ES Modules and Vite

### ES Modules: the modern import/export system

Every `.js` and `.jsx` file in the project is an **ES module**. Modules have their own private scope — variables defined in one module are not visible to others unless explicitly exported.

```js
// constants.js
export const HEX_R = 32          // named export

// hexGrid.js
import { HEX_R } from './constants.js'   // named import
```

The `./` prefix means "relative to this file". The browser (or Vite) resolves this to an actual file path. Circular imports are technically allowed but cause confusing problems — avoid them.

### Vite: the build tool

Browsers natively understand standard ES modules. But there are complications: JSX (the `<div>` syntax in React components) is not valid JavaScript. The browser doesn't understand it.

**Vite** is a development server and build tool that solves this. When you run `npm run dev`, Vite:

1. Serves your project at `http://localhost:5173`
2. When the browser requests `GameBoard.jsx`, Vite transforms it — converting JSX into `React.createElement(...)` calls that the browser understands
3. Watches files for changes; when you save, Vite re-transforms only the changed module and pushes the update to the browser in milliseconds (hot module replacement)

When you run `npm run build`, Vite bundles all your modules into a small set of optimised `.js` files ready for production deployment.

Without a tool like Vite, you'd have to manually compile JSX. Vite makes the development experience seamless.

---

## Part 16 — The Pure Game Engine: Why `game/` Has No React

The `game/` folder — `constants.js`, `hexGrid.js`, `sprites.js` — contains functions that have no knowledge of React, no knowledge of the DOM, no knowledge of the browser. They take data in and return data out, or draw to a canvas context you pass to them.

This is intentional and it matters for several reasons:

**Testability**: You can run these functions in Node.js, with no browser, to verify their behaviour. A function like `pixelToHex(260, 135)` either returns the correct `{row, col}` or it doesn't. No mocking required.

**Portability**: If you ever wanted to run the game logic on a server (for authoritative simulation, multiplayer, replays), the `game/` code could move there unchanged.

**Clarity**: When debugging a visual bug, you know it's in the rendering layer. When debugging a logical bug (wrong service placed, mission check failing), you know it's in the data layer. The separation makes the search space smaller.

**The anti-pattern to avoid**: mixing logic with rendering. If `placeService()` called `renderGrid()`, the logic and rendering would be coupled. You couldn't test the logic without rendering. You couldn't change the rendering without risking logic bugs. CloudRealm deliberately avoids this. `placeService()` only mutates the store. The canvas re-draws independently.

---

## Part 17 — Separation of Concerns: A Full Frame Trace

Here is exactly what happens in one 16ms frame, from the RAF callback to pixels on screen:

**Step 1 — RAF fires**  
The browser calls `draw(now)` where `now` is a high-precision timestamp in milliseconds.

**Step 2 — Clear**  
`ctx.clearRect(0, 0, W, H)` wipes the canvas. All pixels from the previous frame are gone. We are working with a blank bitmap.

**Step 3 — Apply camera transform**  
`ctx.save()`, `ctx.translate(panX, panY)`, `ctx.scale(zoom, zoom)`. All drawing commands from here are in world space, automatically transformed to screen space.

**Step 4 — Draw terrain**  
Loop over all 99 hex cells. For each: call `drawHexPath` to build the hex shape, `ctx.fill()` with the terrain colour, optionally add a wall stripe pattern (clipped to the hex via `ctx.clip()`), stroke the border.

**Step 5 — Apply selection overlays**  
If a service is selected, iterate the hex cells again. Valid tiles (correct zone, not occupied) get a green pulse overlay driven by `Math.sin(now * 0.006)`. Invalid tiles get a dark dimming overlay.

**Step 6 — Draw connection lines**  
For each placed service, check its neighbours. If the neighbour also has a service, draw a dashed line between their centres. The line dash offset is animated: `lineDashOffset = -(now * 0.04 % 12)`, making the dashes appear to flow along the line.

**Step 7 — Draw sprites**  
For each placed service, get its hex centre, apply a clip path (so the sprite stays inside its tile), and call the corresponding sprite function from `sprites.js`. Each sprite function receives `(ctx, cx, cy, now)` and draws 8–20 canvas primitives to produce a unique animated character.

**Step 8 — Draw hover ring**  
If the mouse is over a valid tile while a service is selected, draw a bright green ring. If over an invalid tile, draw a red ring. This is stored in `hoverRef.current` from the `mousemove` handler.

**Step 9 — Restore camera**  
`ctx.restore()`. We are back in screen space.

**Step 10 — Draw toast notification**  
If a toast message is active (placed a service, hit an error), draw it in screen space — centred at the bottom of the canvas. It fades in and out via `globalAlpha`.

**Step 11 — Schedule next frame**  
`animRef.current = requestAnimationFrame(draw)`. The loop continues.

**Total time**: approximately 1–3ms on a modern machine. The remaining 13ms of the 16ms frame budget is available for the browser to handle events, run the React reconciler, and do its own housekeeping.

---

## Appendix — Key JavaScript Concepts Used Throughout

### Destructuring

```js
// Extract named properties from an object
const { x, y } = hexCenter(row, col)
// same as: const x = hexCenter(row,col).x; const y = hexCenter(row,col).y

// Extract from arrays
const [first, second] = someArray

// With defaults
const { zoom = 1, panX = 0 } = cameraRef.current
```

### Spread operator

```js
// Create a new object copying all fields, overriding some
const newState = { ...oldState, gold: oldState.gold - 10 }

// Create a new array with an added item (immutable push)
const newPlaced = [...placed, newEntry]
```

This pattern is important because React state updates should produce *new* objects rather than mutating existing ones. Zustand's `set()` calls follow this convention.

### Optional chaining `?.` and nullish coalescing `??`

```js
const service = grid[row]?.[col]?.service  // returns undefined instead of throwing if grid[row] is undefined
const cost = svcDef?.cost ?? 0             // use 0 if svcDef is null/undefined
```

The `?.` stops evaluation if the left side is null/undefined, returning undefined. The `??` provides a fallback for null/undefined (but not for `false` or `0`, unlike `||`).

### Array methods

```js
placed.filter(p => p.id === 'lambda')     // new array of only lambda placements
placed.some(p => p.id === 'igw')          // true if ANY placement is IGW
placed.every(p => p.zone === 'public')    // true if ALL placements are public
placed.find(p => p.row === 3 && p.col === 4)  // first matching element, or undefined
placed.map(p => ({ ...p, zone: 'updated' }))  // new array with every element transformed
```

None of these modify the original array. They return new arrays (or values). This immutability is important for state management — if you mutate an array Zustand is tracking, it won't know the state changed.

### Template literals

```js
const colour  = `rgba(255, ${green}, 80, ${alpha})`  // string interpolation
const key     = `${row},${col}`                       // composite key from numbers
```

Backticks, not quotes. `${}` evaluates any expression inside.

---

## Summary: The Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│  React HTML panels         Canvas (RAF loop, 60fps)        │
│  ─────────────────         ─────────────────────────────   │
│  HUD.jsx                   clear                           │
│  ServicePalette.jsx  ───►  draw terrain                    │
│  MissionPanel.jsx          draw connections                │
│         │                  draw sprites (sprites.js)       │
│         │                  draw overlays                   │
│         ▼                         │                        │
│  Zustand Store  ◄─────────────────┘                        │
│  ─────────────                                             │
│  grid, placed,         Store reads via refs                │
│  selectedServiceId,    (gridRef, placedRef, etc.)          │
│  gold, camera          Never via subscriptions             │
│         │                                                  │
│         ▼                                                  │
│  game/ (pure functions)                                    │
│  ─────────────────────                                     │
│  constants.js  — data                                      │
│  hexGrid.js    — hex math, grid building                   │
│  sprites.js    — canvas draw functions                     │
│                                                            │
└─────────────────────────────────────────────────────────────┘
```

The HTML panels are React — they re-render when Zustand state changes. The canvas is a RAF loop — it redraws every frame, reading the latest state through refs. The game logic lives in pure functions with no dependencies on either. The store is the hub that connects them all.

This is the architecture that scales. Add more services, more missions, walking characters, wave mechanics, multiplayer — each is a change in one layer that doesn't require touching the others.

---

*Start with `hexGrid.js` to understand the coordinate math. Then `sprites.js` to see how drawing works. Then `gameStore.js` to see the state model. Then `GameBoard.jsx` to see how the RAF loop ties it all together. That's the order the system was built in, and it's the order in which it makes the most sense to read.*
