/**
 * simulation.js — Pure wave-phase simulation engine.
 *
 * Architectural rules (from guide §8.1):
 *   - NO React imports, NO DOM calls, NO Zustand
 *   - simulationTick must be a pure function: (state, deltaMs) → { state, events }
 *   - All randomness is deterministic-ish (seeded by service positions)
 *   - This enables future deterministic replay and multiplayer sync
 *
 * Concepts modelled:
 *   - Data packets travel hop-by-hop along the connection graph
 *   - A hop is valid if both services are adjacent AND have a valid conns relationship
 *   - Packets fail when they reach a service missing its required dependencies
 *   - Threats spawn from off-grid and approach vulnerable services
 *   - Threats are deflected when the architecture has the correct defense in place
 */

import { hexCenter } from './hexGrid.js'
import { SERVICES } from './constants.js'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Services that generate inbound traffic (wave entry points) */
const ENTRY_IDS = new Set(['igw', 'cf', 'route53', 'waf', 'apigw', 'sqs', 'eventbridge', 'sns'])

/** Services that terminate a packet journey (request has been "handled") */
const TERMINAL_IDS = new Set(['rds', 'dynamo', 's3', 'elasticache'])

/** Visual colour per packet type */
export const PACKET_COLORS = {
  request:  '#60b0ff',
  event:    '#b060ff',
  api:      '#e0a060',
  response: '#60ffb0',
  error:    '#ff4040',
}

/** Off-grid start positions for each threat (world-space pixels) */
const THREAT_ORIGINS = {
  brute:        { x: 290, y: -90 },   // top centre
  thief:        { x: 620, y: -90 },   // top right
  impersonator: { x: -80, y: 140 },   // left mid
  phantom:      { x: -80, y: 360 },   // left low
  miser:        { x: 290, y: 550 },   // bottom centre
}

// ── Key helpers ───────────────────────────────────────────────────────────────

/** Create a stable string key from a placed service */
function makeKey(p)  { return `${p.id}@${p.row},${p.col}` }

/** Parse a key back to { id, row, col } */
function parseKey(k) {
  const [id, coords] = k.split('@')
  const [row, col] = coords.split(',').map(Number)
  return { id, row, col }
}

// ── Topology ──────────────────────────────────────────────────────────────────

/**
 * Build an adjacency graph for placed services.
 * Edge exists if:
 *   1. The two tiles are adjacent (hex neighbors)
 *   2. At least one service has the other in its conns array
 *
 * Returns: { [key]: [{ key, id, row, col }] }
 */
export function buildTopology(placed, getNeighborsFn) {
  const graph = {}
  for (const p of placed) {
    const key = makeKey(p)
    graph[key] = []
    for (const { row: nr, col: nc } of getNeighborsFn(p.row, p.col)) {
      const nb = placed.find(q => q.row === nr && q.col === nc)
      if (!nb) continue
      const connected =
        (p.conns  && p.conns.includes(nb.id)) ||
        (nb.conns && nb.conns.includes(p.id))
      if (connected) {
        graph[key].push({ key: makeKey(nb), id: nb.id, row: nr, col: nc })
      }
    }
  }
  return graph
}

// ── Health checks ─────────────────────────────────────────────────────────────

/**
 * Returns true if this service will correctly handle a packet.
 * A service is "healthy" if it has all required adjacent dependencies.
 */
function isServiceHealthy(svc, placed, getNeighborsFn) {
  const nbrs = getNeighborsFn(svc.row, svc.col)
  const nbSet = new Set(placed
    .filter(p => nbrs.some(n => n.row === p.row && n.col === p.col))
    .map(p => p.id))

  // Lambda always needs an IAM role
  if (svc.id === 'lambda' && !nbSet.has('iam')) return false

  // requiresSG services need an adjacent Security Group
  const def = SERVICES.find(s => s.id === svc.id)
  if (def?.requiresSG && !nbSet.has('sg')) return false

  return true
}

/** Health failure reason string for a service */
function healthFailReason(svc, placed, getNeighborsFn) {
  const nbrs = getNeighborsFn(svc.row, svc.col)
  const nbSet = new Set(placed
    .filter(p => nbrs.some(n => n.row === p.row && n.col === p.col))
    .map(p => p.id))
  if (svc.id === 'lambda' && !nbSet.has('iam')) return 'Lambda has no IAM role — invocation denied'
  const def = SERVICES.find(s => s.id === svc.id)
  if (def?.requiresSG && !nbSet.has('sg')) return `${svc.id.toUpperCase()} has no Security Group — traffic blocked`
  return 'Architecture gap detected'
}

// ── Packet creation ───────────────────────────────────────────────────────────

let _packetId = 1
function newId() { return `pkt_${_packetId++}` }

function packetTypeFor(serviceId) {
  if (['sqs', 'eventbridge', 'sns'].includes(serviceId)) return 'event'
  if (serviceId === 'apigw') return 'api'
  return 'request'
}

/**
 * Attempt to spawn a packet from an entry service.
 * Picks the best connected neighbor as the first hop.
 * Returns a packet object or null if no valid first hop.
 */
function spawnPacket(entry, topology, placed, getNeighborsFn) {
  const key   = makeKey(entry)
  const nexts = topology[key] ?? []
  if (nexts.length === 0) return null

  // Prefer compute/data targets over support services
  const ranked = [...nexts].sort((a, b) => {
    const aScore = TERMINAL_IDS.has(a.id) ? 2 : ['ec2','lambda','ecs','alb'].includes(a.id) ? 1 : 0
    const bScore = TERMINAL_IDS.has(b.id) ? 2 : ['ec2','lambda','ecs','alb'].includes(b.id) ? 1 : 0
    return bScore - aScore
  })
  const target = ranked[0]

  const type  = packetTypeFor(entry.id)
  const healthy = isServiceHealthy(entry, placed, getNeighborsFn)
  return {
    id:       newId(),
    fromKey:  key,
    toKey:    target.key,
    fromPos:  hexCenter(entry.row, entry.col),
    toPos:    hexCenter(target.row, target.col),
    progress: 0,
    speed:    0.85 + (entry.col % 3) * 0.15,  // slight variation, deterministic
    type,
    color:    PACKET_COLORS[type],
    healthy,
    dying:    false,
  }
}

// ── Threat detection ──────────────────────────────────────────────────────────

/**
 * Scan the architecture for vulnerabilities and create threat objects
 * for each one found.
 */
function detectThreats(placed, getNeighborsFn) {
  const threats = []
  const has = (id) => placed.some(p => p.id === id)

  const adjTo = (idA, idB) => {
    for (const a of placed.filter(p => p.id === idA)) {
      const nbrs = getNeighborsFn(a.row, a.col)
      if (placed.some(b => b.id === idB && nbrs.some(n => n.row === b.row && n.col === b.col)))
        return true
    }
    return false
  }

  // The Brute — DDoS — No WAF protecting ALB/CloudFront
  if (has('alb') && !has('waf')) {
    const tgt = placed.find(p => p.id === 'alb')
    threats.push({
      id:         'brute',
      name:       'The Brute',
      icon:       '💀',
      desc:       'DDoS — ALB has no WAF protection',
      fix:        'Place The Ward (WAF) adjacent to ALB or CloudFront',
      targetKey:  makeKey(tgt),
      targetPos:  hexCenter(tgt.row, tgt.col),
      startPos:   THREAT_ORIGINS.brute,
      progress:   0,
      speed:      0.06,
      color:      '#ff4040',
      deflected:  false,
      struck:     false,
      severity:   'high',
    })
  }

  // The Thief — Data Breach — RDS without SG, or RDS in public subnet
  const rds = placed.find(p => p.id === 'rds')
  if (rds) {
    const nbrs = getNeighborsFn(rds.row, rds.col)
    const hasSG = placed.some(p => p.id === 'sg' && nbrs.some(n => n.row === p.row && n.col === p.col))
    if (!hasSG || rds.zone === 'public') {
      threats.push({
        id:         'thief',
        name:       'The Thief',
        icon:       '🗡️',
        desc:       rds.zone === 'public'
          ? 'RDS is publicly accessible — database exposed'
          : 'RDS has no Security Group — connection unrestricted',
        fix:        rds.zone === 'public'
          ? 'Move RDS to the Private Subnet'
          : 'Place a Permission Scroll (SG) adjacent to RDS',
        targetKey:  makeKey(rds),
        targetPos:  hexCenter(rds.row, rds.col),
        startPos:   THREAT_ORIGINS.thief,
        progress:   0,
        speed:      0.07,
        color:      '#e060a0',
        deflected:  false,
        struck:     false,
        severity:   'critical',
      })
    }
  }

  // The Impersonator — IAM — Lambda without execution role
  const lambda = placed.find(p => p.id === 'lambda')
  if (lambda) {
    const nbrs = getNeighborsFn(lambda.row, lambda.col)
    const hasIAM = placed.some(p => p.id === 'iam' && nbrs.some(n => n.row === p.row && n.col === p.col))
    if (!hasIAM) {
      threats.push({
        id:         'impersonator',
        name:       'The Impersonator',
        icon:       '👤',
        desc:       'Lambda has no IAM role — all API calls will be denied',
        fix:        'Place a Royal Decree (IAM) adjacent to Lambda',
        targetKey:  makeKey(lambda),
        targetPos:  hexCenter(lambda.row, lambda.col),
        startPos:   THREAT_ORIGINS.impersonator,
        progress:   0,
        speed:      0.055,
        color:      '#e0c040',
        deflected:  false,
        struck:     false,
        severity:   'high',
      })
    }
  }

  // The Phantom — unmonitored failure — no CloudWatch
  const monitorable = placed.filter(p => ['ec2','lambda','rds','ecs','alb'].includes(p.id))
  if (monitorable.length >= 2 && !has('cloudwatch')) {
    const tgt = monitorable[0]
    threats.push({
      id:         'phantom',
      name:       'The Phantom',
      icon:       '👻',
      desc:       'Critical services have no CloudWatch monitoring',
      fix:        'Place All-Seeing Eye (CloudWatch) adjacent to EC2, Lambda, or RDS',
      targetKey:  makeKey(tgt),
      targetPos:  hexCenter(tgt.row, tgt.col),
      startPos:   THREAT_ORIGINS.phantom,
      progress:   0,
      speed:      0.045,
      color:      '#8080d0',
      deflected:  false,
      struck:     false,
      severity:   'medium',
    })
  }

  // The Miser — cost bomb — NAT without VPC Endpoint for S3
  if (has('nat') && has('s3') && !has('vpc_endpoint')) {
    const tgt = placed.find(p => p.id === 'nat')
    threats.push({
      id:         'miser',
      name:       'The Miser',
      icon:       '💰',
      desc:       'S3 traffic routing through NAT Gateway — expensive data transfer cost',
      fix:        'Add a Secret Passage (VPC Endpoint) to bypass NAT for S3 access',
      targetKey:  makeKey(tgt),
      targetPos:  hexCenter(tgt.row, tgt.col),
      startPos:   THREAT_ORIGINS.miser,
      progress:   0,
      speed:      0.05,
      color:      '#c0a000',
      deflected:  false,
      struck:     false,
      severity:   'medium',
    })
  }

  return threats
}

// ── Wave initialisation ───────────────────────────────────────────────────────

/**
 * Build the full initial wave state from the current board.
 * Called once when startWave() fires.
 *
 * Returns a waveState object that gets stored in a ref in GameBoard.
 */
export function buildInitialWaveState(placed, getNeighborsFn) {
  const topology     = buildTopology(placed, getNeighborsFn)
  const threats      = detectThreats(placed, getNeighborsFn)
  const entries      = placed.filter(p => ENTRY_IDS.has(p.id))

  // Initial packet batch — one per entry service, staggered
  const packets = []
  entries.forEach((entry, i) => {
    const pkt = spawnPacket(entry, topology, placed, getNeighborsFn)
    if (pkt) {
      // Stagger start by 20% per entry so they don't all arrive simultaneously
      packets.push({ ...pkt, progress: (i * 0.2) % 1 })
    }
  })

  // Spawn timers — track when to next spawn a packet from each entry
  const spawnTimers = {}
  for (const entry of entries) {
    spawnTimers[makeKey(entry)] = 2000 + entries.indexOf(entry) * 800 // stagger spawns
  }

  return {
    topology,
    packets,
    threats,
    spawnTimers,   // { key -> ms until next spawn }
    placed,        // snapshot (topology and threats already built from it)
    getNeighborsFn,
    stats: {
      packetsOk:        0,
      packetsFailed:    0,
      threatsDeflected: 0,
      threatsStruck:    0,
    },
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

/**
 * Advance the simulation by deltaMs milliseconds.
 *
 * Pure function — no side effects, no mutations.
 * Returns { waveState, events } where events is an array of { type, ... } objects.
 */
export function simulationTick(waveState, deltaMs) {
  const {
    topology, placed, getNeighborsFn, spawnTimers,
    stats,
  } = waveState
  const events = []

  // ── 1. Advance packets ───────────────────────────────────────────────────────
  const nextPackets = []
  for (const pkt of waveState.packets) {
    const newProg = pkt.progress + pkt.speed * (deltaMs / 1000)

    if (pkt.dying) {
      // Dying error packet floats up; discard when done
      if (newProg < 1) nextPackets.push({ ...pkt, progress: newProg })
      continue
    }

    if (newProg >= 1.0) {
      // ── Arrival at destination ──────────────────────────────────────────────
      const { id, row, col } = parseKey(pkt.toKey)
      const destSvc = placed.find(p => p.id === id && p.row === row && p.col === col)

      events.push({ type: 'SERVICE_ACTIVATED', key: pkt.toKey, pos: pkt.toPos })

      if (!destSvc) continue  // service was removed mid-wave

      const destHealthy = pkt.healthy && isServiceHealthy(destSvc, placed, getNeighborsFn)

      if (!destHealthy) {
        events.push({
          type:   'PACKET_FAILED',
          key:    pkt.toKey,
          reason: healthFailReason(destSvc, placed, getNeighborsFn),
        })
        // Spawn a dying error packet that floats upward
        nextPackets.push({
          ...pkt,
          id:       newId(),
          fromPos:  pkt.toPos,
          toPos:    { x: pkt.toPos.x, y: pkt.toPos.y - 40 },
          progress: 0,
          type:     'error',
          color:    PACKET_COLORS.error,
          healthy:  false,
          dying:    true,
        })
      } else {
        events.push({ type: 'PACKET_SUCCEEDED', key: pkt.toKey })

        if (TERMINAL_IDS.has(id)) {
          // Terminal service — packet journey complete, emit response
          events.push({ type: 'PACKET_COMPLETE', key: pkt.toKey })
        } else {
          // Try to continue to the next hop
          const nexts   = (topology[pkt.toKey] ?? []).filter(n => n.key !== pkt.fromKey)
          const ranked  = [...nexts].sort((a, b) => {
            const aS = TERMINAL_IDS.has(a.id) ? 2 : 1
            const bS = TERMINAL_IDS.has(b.id) ? 2 : 1
            return bS - aS
          })
          if (ranked.length > 0) {
            const next = ranked[0]
            const { row: nr, col: nc } = parseKey(next.key)
            nextPackets.push({
              ...pkt,
              id:       newId(),
              fromKey:  pkt.toKey,
              toKey:    next.key,
              fromPos:  pkt.toPos,
              toPos:    hexCenter(nr, nc),
              progress: 0,
              healthy:  destHealthy,
            })
          }
        }
      }
    } else {
      nextPackets.push({ ...pkt, progress: newProg })
    }
  }

  // ── 2. Spawn timers — respawn packets from entry services ────────────────────
  const nextSpawnTimers = { ...spawnTimers }
  const entries = placed.filter(p => ENTRY_IDS.has(p.id))
  for (const entry of entries) {
    const key = makeKey(entry)
    nextSpawnTimers[key] = (nextSpawnTimers[key] ?? 3000) - deltaMs
    if (nextSpawnTimers[key] <= 0) {
      const pkt = spawnPacket(entry, topology, placed, getNeighborsFn)
      if (pkt) nextPackets.push(pkt)
      // Respawn every 2.5–4 seconds per entry
      nextSpawnTimers[key] = 2500 + (entry.col % 3) * 500
    }
  }

  // Cap total packets to prevent visual overload
  const cappedPackets = nextPackets.slice(-40)

  // ── 3. Advance threats ───────────────────────────────────────────────────────
  const nextThreats = waveState.threats.map(threat => {
    if (threat.deflected || threat.struck) return threat

    const newProg = threat.progress + threat.speed * (deltaMs / 1000)

    if (newProg >= 1.0) {
      events.push({
        type:     'THREAT_STRUCK',
        threatId: threat.id,
        name:     threat.name,
        desc:     threat.desc,
        fix:      threat.fix,
        key:      threat.targetKey,
      })
      return { ...threat, progress: 1.0, struck: true }
    }

    return { ...threat, progress: newProg }
  })

  // ── 4. Update stats from events ──────────────────────────────────────────────
  let { packetsOk, packetsFailed, threatsDeflected, threatsStruck } = stats
  for (const e of events) {
    if (e.type === 'PACKET_COMPLETE')   packetsOk++
    if (e.type === 'PACKET_FAILED')     packetsFailed++
    if (e.type === 'THREAT_STRUCK')     threatsStruck++
  }

  return {
    waveState: {
      ...waveState,
      packets:     cappedPackets,
      threats:     nextThreats,
      spawnTimers: nextSpawnTimers,
      stats:       { packetsOk, packetsFailed, threatsDeflected, threatsStruck },
    },
    events,
  }
}

/**
 * Compute the final Well-Architected score from the wave stats and architecture.
 * Called when the wave timer expires to build the result passed to endWave().
 */
export function computeWaveResult(waveState, placed, getNeighborsFn) {
  const { stats } = waveState
  const has = (id) => placed.some(p => p.id === id)
  const adjTo = (idA, idB) => {
    for (const a of placed.filter(p => p.id === idA)) {
      const nbrs = getNeighborsFn(a.row, a.col)
      if (placed.some(b => b.id === idB && nbrs.some(n => n.row === b.row && n.col === b.col)))
        return true
    }
    return false
  }

  // Security (0–40) — SGs on compute, no public DB, WAF, IAM
  let security = 0
  if (!placed.some(p => p.id === 'rds' && p.zone === 'public'))   security += 8
  if (has('waf'))                                                   security += 8
  if (adjTo('lambda', 'iam') || !has('lambda'))                    security += 8
  if (!placed.some(p => ['ec2','rds','ecs'].includes(p.id) &&
      !getNeighborsFn(p.row, p.col).some(n => placed.some(q => q.id === 'sg' && q.row === n.row && q.col === n.col))))
                                                                    security += 8
  if (has('cognito') || has('apigw'))                               security += 8

  // Reliability (0–20) — multi-service, ALB, SQS decoupling
  let reliability = 0
  if (has('alb'))                                                   reliability += 6
  if (placed.filter(p => p.id === 'ec2').length >= 2)              reliability += 6
  if (has('sqs') || has('eventbridge'))                             reliability += 4
  if (has('route53'))                                               reliability += 4

  // Performance (0–20) — cache, CDN, serverless
  let performance = 0
  if (adjTo('elasticache', 'rds') || (!has('rds') && has('elasticache'))) performance += 7
  if (has('cf'))                                                    performance += 7
  if (has('lambda'))                                                performance += 6

  // Cost (0–10) — VPC Endpoint instead of NAT for S3
  let costOptimization = 0
  if (has('vpc_endpoint') && has('s3'))                             costOptimization += 6
  if (!has('nat') && has('vpc_endpoint'))                           costOptimization += 4

  // Ops Excellence (0–10) — CloudWatch
  let operationalExcellence = 0
  const watched = placed.filter(p => {
    if (p.id === 'cloudwatch') return false
    return placed.filter(q => q.id === 'cloudwatch').some(cw => {
      const nbrs = getNeighborsFn(cw.row, cw.col)
      return nbrs.some(n => n.row === p.row && n.col === p.col)
    })
  })
  operationalExcellence = Math.min(10, watched.length * 2)

  const wellArchitected = { security, reliability, performance, costOptimization, operationalExcellence }
  const score = security + reliability + performance + costOptimization + operationalExcellence

  return {
    packetsOk:      stats.packetsOk,
    packetsFailed:  stats.packetsFailed,
    threats:        stats.threatsStruck,
    score,
    wellArchitected,
    note: null,
  }
}
