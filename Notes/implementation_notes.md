# CloudRealm — Implementation Notes

*For engineers following along with the build. Written to explain the why behind every decision, not just the what.*

---

## What we're building and why

CloudRealm is a browser game that teaches AWS cloud architecture. The core insight driving it: AWS infrastructure is hard to understand because it's invisible. You can read about VPCs and subnets for hours without really *getting* it. But if you have to physically place a Lambda function inside a private subnet on a hex board, and the game rejects it when you try to put it in the wrong zone — you understand it immediately.

The game is a single HTML file. No build step, no npm install, no server. Open it in a browser, play it. That constraint shapes every technical decision downstream.

---

## Session 1 — Design

Before writing a line of code, we mapped every major AWS service to a fantasy character or structure. This isn't just for flavour — the character *personality* teaches the AWS concept:

- **Lambda → Shadow Ninja**: Appears only when summoned, completes one task, vanishes. *This is literally what Lambda does* — it invokes, runs, terminates. No idle time. No idle cost.
- **EC2 → Iron Knight**: Always stationed, always on guard, always costing gold. Even when idle.
- **VPC → The Kingdom Walls**: Nothing enters or leaves without the Iron Gate (Internet Gateway) being open.
- **RDS → The Great Library**: Structured, organised, relational. Has a Primary Scribe (write node) and a Replica Scribe (read replica). Goes offline for maintenance.
- **SQS → Raven Queue**: Messages queue up and fly reliably between services. The Ravens don't drop messages.
- **NAT Gateway → Secret Tunnel**: Private forces can venture outward anonymously, but nothing from outside can find their way in.

The exercise of mapping these forced us to deeply consider each service's behaviour before any UI existed. Good design work.

---

## Session 2 — Choosing a UI approach

We explored four UI directions before building anything:

| Style | Why considered | Why rejected |
|---|---|---|
| Kingdom Map (top-down) | Spatial, visual | Lacked the "building" feel the user wanted |
| Side-scrolling RPG | Fun, narrative-driven | Too story-heavy, not enough system interaction |
| Card Battle (Hearthstone-style) | Great for teaching combinations | Loses the spatial/network topology aspect of AWS |
| RPG Dashboard | Closest to real AWS Console | Feels like a dashboard, not a game |

The user described wanting to *place items down onto a board* to build their cloud environment. That guided us toward a three-option secondary decision: isometric grid, hex tiles, or concentric zones.

**Hex tiles won** for a few reasons:
- Six neighbours per tile is more natural than four for adjacency-based mechanics (Lambda + SQS needing to be adjacent, for example)
- Classic tabletop feel — think Settlers of Catan, not spreadsheet
- Works better visually for irregular-shaped zones

---

## Session 3 — First build (v0.2.0)

### The hex grid

Hexagons in CSS are rendered using `clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)` on a `<div>`. The width:height ratio for a flat-top hexagon is `1 : 0.866` (that's `√3/2`), so:

```css
.hex {
  width: var(--hex-size);          /* 54px */
  height: calc(var(--hex-size) * 0.866);  /* ~46.8px */
}
```

For the offset grid (making hexes actually tessellate), odd-numbered rows are shifted right by half a hex width:

```css
.hex-row.offset {
  margin-left: calc(var(--hex-size) / 2 + var(--hex-gap) / 2);
}
```

This is called **odd-r offset coordinates**. Each tile has a `(row, col)` address. When calculating neighbours, the formula differs depending on whether the row is even or odd:

```js
function getNeighbors(r, c) {
  const off = r % 2 === 1;  // is this an offset row?
  return (off
    ? [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]]   // offset row directions
    : [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]]  // even row directions
  ).map(([dr,dc]) => [r+dr, c+dc])
   .filter(([nr,nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS);
}
```

This is the core of the mission adjacency mechanic — checking that Lambda and SQS are on neighbouring tiles.

### The grid map

The grid is an 11×9 2D array. Each cell is `{ terrain: string, service: null|string }`. Terrain types:

- `outside` — the internet, not placeable
- `wall` — VPC perimeter, structural only
- `vpc-gate` — special wall tile where the Internet Gateway goes
- `public` — public subnet (Outer City)
- `private` — private subnet (Inner Sanctum)

The grid is built programmatically in `buildGrid()` using row/column range definitions. This makes it easy to change the map shape later.

### Zone enforcement

`canPlace(r, c, serviceId)` is the gatekeeper. It checks:
1. Is the cell already occupied?
2. Has the service reached its max count?
3. Does the service's zone match the cell's terrain?
4. Does the player have enough gold?

Zone matching rules map directly to AWS networking reality:
- `public` services (EC2, ALB, CloudFront, NAT) → must go in public subnet
- `private` services (Lambda, RDS, SQS, S3) → must go in private subnet  
- `wall` services (IGW) → must go on a vpc-gate or wall tile
- `any` services (IAM) → can go in either subnet

### Gold economy

Every service has a `cost` property — the gold deducted on placement. The numbers aren't arbitrary. They reflect relative AWS pricing:

- Lambda: 0 gold — serverless, no idle cost
- S3: 2 gold — storage is cheap
- SQS: 1 gold — messaging is cheap
- DynamoDB: 5 gold — managed NoSQL
- ECS: 12 gold — containerised compute, cheaper than EC2
- NAT Gateway: 10 gold — it's a small but real cost in AWS
- ALB: 15 gold — load balancers have an hourly charge
- EC2: 20 gold — on-demand compute, most expensive
- RDS: 25 gold — managed relational DB is pricier than EC2

When you remove a service, you get 50% back. This models the real cost of over-provisioning — you can't simply try everything and undo for free.

### Connection lines

After every placement, `renderConnections()` runs. It queries the DOM position of each occupied hex using `getBoundingClientRect()`, then draws SVG `<line>` elements between adjacent services that have valid connection relationships.

The connection graph is defined per-service in the `connections` array. For example, Lambda can connect to SQS, RDS, S3, and DynamoDB — but not to EC2 directly (Lambda is triggered, not a caller to raw compute). These relationships are grounded in real AWS integration patterns.

Gold dashed lines = valid connection. Faint grey = adjacent but no valid integration.

### Drag and drop (v0.2.0 — later removed)

The first build used HTML5 drag-and-drop. Service cards were `draggable`, hex tiles had `dragover`/`drop` event listeners. In theory, clean. In practice, broken.

---

## Session 4 — Bug fix (v0.3.0)

The user reported that services couldn't be placed on tiles at all. Three separate bugs were stacked on top of each other.

### Bug 1: clip-path kills pointer events

This one is subtle and worth understanding deeply.

When you apply `clip-path` to a div, the browser only fires mouse/pointer events within the *visible* area of the clip path. The invisible parts — in this case, the four corner triangles of each hex's bounding rectangle — become dead zones.

```
┌─────────────┐
│ dead dead d │
│ ╱‾‾‾‾‾‾‾╲ │   ← corners: no events fire here
│╱  live hex ╲│
│╲           ╱│
│ ╲_________╱ │
│ dead dead d │
└─────────────┘
```

For drag-and-drop, this means dragging into the corner region between hexes triggers `dragleave` on one tile without triggering `dragover` on the next one. Drop events in those regions simply disappear.

**Fix:** Move the clip-path off the `.hex` div entirely. Create an inner `.hex-bg` child div that holds the clip-path for visuals, with `pointer-events: none`. The outer `.hex` div remains a full rectangle — events fire reliably anywhere in its bounding box.

```css
/* BEFORE — broke pointer events in corners */
.hex {
  clip-path: polygon(50% 0%, 100% 25%, ...);
}

/* AFTER — clean separation of hit-testing and visuals */
.hex { /* no clip-path — full rect handles events */ }
.hex-bg {
  position: absolute; inset: 0;
  clip-path: polygon(50% 0%, 100% 25%, ...);
  pointer-events: none;  /* purely visual */
}
```

### Bug 2: child elements absorb events

Even after fixing the clip-path, drops were still unreliable. The hex tiles contain child elements — `.wall-icon`, `.gate-icon`, `.hex-service` with emoji and labels. When the user dragged over these children, the browser fired `dragleave` on the parent hex (because the pointer moved to a child element), which removed the `drag-over` class and broke state.

**Fix:** Add a single CSS rule that makes *all* hex children invisible to pointer events:

```css
.hex > * { pointer-events: none; }
```

The parent `.hex` div is now the sole event target for everything inside it.

### Bug 3: drag-and-drop is just unreliable across panels

HTML5 drag-and-drop has a fundamental problem when the drag source (palette panel) and drop target (board panel) are in different scroll containers. The browser's native drag image, combined with the panel boundaries and CSS transforms, can cause the `state.dragging` reference to desync.

**The actual fix:** Remove drag-and-drop entirely and replace with **click-to-select → click-to-place**.

This is not a workaround — it's a better UX. Instead of:
1. Click and hold a service card
2. Drag it across the screen  
3. Hope it drops on the right tile

The new flow is:
1. Click a service card (it highlights gold)
2. The board immediately shows you where you can and can't place
3. Click a glowing tile to place

This is how most strategy games handle placement (StarCraft, Age of Empires, etc.) and it's much more deliberate and satisfying.

### How the new placement system works

**State**: One new field added to the state object: `selectedServiceId`. Either `null` or a service ID string.

**Service card click** → calls `selectService(id)`. Toggles selection. Calls `renderPalette()` to add the gold `.selected` class and `renderGrid()` to apply `valid-target` / `invalid-target` classes to all tiles.

**Tile classification** happens in `renderGrid()`:
```js
if (sel && isInteractive && !cell.service) {
  extraClass = canPlace(r, c, sel) ? ' valid-target' : ' invalid-target';
}
```

**Visual feedback**:
- `.valid-target .hex-bg` — pulsing brightness animation (1.5x → 2.4x)
- `.invalid-target .hex-bg` — opacity dimmed to 0.45
- Cursor changes to `crosshair` on valid tiles

**Tile click** → if a service is selected and tile is valid, calls `placeService(r, c)`. If invalid, calls `showToast()` with a specific explanation (wrong zone, occupied, max reached, not enough gold).

**Cancel selection** → clicking the ✕ button in the hint bar, or clicking the board background, calls `clearSelection()`.

### Removal of inline onclick attributes

The first build used `onclick="removeService(${r},${c})"` injected into innerHTML strings. This is fragile — it relies on the function being on the `window` object and is generally considered bad practice (it's essentially `eval()`).

Replaced with proper event listeners added after the innerHTML is set:

```js
const btn = el.querySelector(`#remove-btn-${r}-${c}`);
if (btn) btn.addEventListener('click', () => removeService(r, c));
```

Same for `renderMissions()` — all button handlers are now added via `addEventListener` rather than inline attributes.

---

## Current file structure

```
aws_roleplay/
├── aws-rpg.html          ← The entire game. Single file.
├── README.md             ← Project overview for anyone opening the repo
└── Notes/
    ├── change_log.json   ← Structured history for AI context
    └── implementation_notes.md   ← This file
```

The game is entirely contained in `aws-rpg.html`. The HTML is ~620 lines split roughly into:
- `<style>` block: CSS variables, layout, hex tile system, panel styles, animations
- HTML body: three-column layout with topbar, palette, board, missions panel
- `<script>` block: data definitions, state, all render/interaction functions

---

## Things to know if you're continuing this build

**The hex pointer events architecture is load-bearing.** The separation of `.hex` (event rect) and `.hex-bg` (visual clip-path) must be preserved. If you put `clip-path` back on `.hex`, or give any `.hex >` child `pointer-events: auto`, tile interaction will silently break.

**Zone rules are intentional, not accidental.** When `canPlace()` rejects a Lambda on a public tile, that's correct. Lambda should live in the private subnet. If you get a request to "make it more flexible," push back — the restrictions are the lesson.

**The connection graph in `SERVICES[n].connections` is the AWS integration map.** If you add a new service, think carefully about which services it can talk to. Don't just add everything — that defeats the educational purpose.

**`renderGrid()` is called after every state change.** It re-renders the entire grid from scratch each time. This is simple and reliable at current scale (99 tiles). If the grid grows significantly, consider incremental updates, but don't optimise prematurely.

**`renderConnections()` uses `getBoundingClientRect()`**, which means it must run after the DOM has painted. It's called with `setTimeout(..., 150)` on init for this reason. After subsequent placements it runs synchronously — the elements exist in the DOM by then.

---

## Roadmap priorities (engineering view)

**Next most valuable features:**

1. **More missions** — the game currently has 3. Adding 5–10 more at varying difficulty is pure content work. Each new mission should teach a specific AWS concept (Route53, Auto Scaling, VPC Peering, ElastiCache, API Gateway).

2. **Threat system** — incorrect architectures get "attacked." A public RDS gets flagged with a security breach icon. A Lambda without a Royal Decree (IAM role) gets refused. This reinforces why the rules exist. Technically: add a `validate()` function that runs after each placement and flags architectural problems.

3. **Animated tiles** — Lambda tiles flash when "invoked" by an adjacent SQS. EC2 pulses steadily. This makes the architecture feel alive. Technically: after placement, trigger CSS animations on tiles based on their connections.

4. **Tutorial overlay** — a first-time player needs guidance. A modal sequence explaining the UI before Mission 1 starts. Technically: add a `tutorialStep` to state and a tutorial overlay div that advances on click.

5. **Mission hint system** — when a mission requirement isn't met, hovering over it should highlight the tiles where the required service *could* go. Technically: add a `getValidTilesForService(id)` function and pulse those tiles on hover over an unsatisfied requirement.
