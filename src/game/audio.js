/**
 * audio.js — CloudRealm Sound System
 *
 * All sounds are synthesised using the Web Audio API. Zero files, zero dependencies.
 * This matches the project philosophy: sprites drawn in code, sounds generated in code.
 *
 * ARCHITECTURE
 * ─────────────
 * AudioContext  →  masterGain  →  destination
 *                      ↑
 *            all sound nodes connect here
 *
 * Each sound creates its own node graph, plays, and self-destructs when done.
 * The ambient drone is the only persistent node — it lives until stopAmbient().
 *
 * BROWSER RULE
 * ─────────────
 * AudioContext must be created (or resumed) inside a user gesture handler.
 * ensureCtx() is called at the start of every public function — the first time a
 * user clicks anything, the context is created and stays alive for the session.
 *
 * SOUND DESIGN PHILOSOPHY
 * ────────────────────────
 * Each service's placement sound reflects its AWS character:
 *   - Lambda (Ninja):    fast, airy, transient — appears and vanishes
 *   - EC2 (Knight):      solid metallic clank — always stationed, always on
 *   - RDS (Library):     deep resonant gong — holds everything, warm and stable
 *   - SQS (Ravens):      chirping glide — messages flying, light and quick
 *   - IGW (Gate):        ceremonial low boom — grand, important, one per VPC
 *   - NAT (Tunnel):      portal whoosh — routes traffic, swirling
 *   - S3 (Vault):        hollow resonant hum — vast, deep, almost infinite
 *   - ALB (Shield):      metallic ring — distributes, deflects, protects
 *   - CloudFront (Eye):  ethereal scan tone — watching the edges
 *   - DynamoDB (Ruins):  ancient stone grind — chaotic, fast, powerful
 *   - IAM (Decree):      parchment rustle + wax seal — permissions granted
 *   - ECS (Barracks):    marching triplet — ordered, multiple, identical
 */

// ─── Module state ─────────────────────────────────────────────────────────────

let _ctx   = null   // AudioContext (created on first user interaction)
let _master = null  // master GainNode — controls overall volume
let _muted  = false
let _volume = 0.65

let _droneNodes    = []   // ambient drone oscillators (persistent)
let _droneStarted  = false

// ─── Context management ───────────────────────────────────────────────────────

function ensureCtx() {
  if (!_ctx) {
    _ctx    = new (window.AudioContext || window.webkitAudioContext)()
    _master = _ctx.createGain()
    _master.gain.value = _muted ? 0 : _volume
    _master.connect(_ctx.destination)
  }
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// ─── Low-level helpers ────────────────────────────────────────────────────────

/**
 * Play a single oscillator with an ADSR-style envelope.
 * Automatically connects to master and destroys itself when done.
 */
function osc({
  freq    = 440,
  type    = 'sine',
  volume  = 0.25,
  attack  = 0.02,
  sustain = 0,
  decay   = 0.3,
  detune  = 0,
  freqEnd = null,     // if set, glide frequency to this value over the total duration
  filter  = null,     // { type, freq, q } — optional BiquadFilter in chain
  delay   = 0,        // schedule this many seconds in the future
}) {
  const ctx = ensureCtx()
  const t   = ctx.currentTime + delay
  const dur = attack + sustain + decay

  const node  = ctx.createOscillator()
  const gain  = ctx.createGain()

  node.type           = type
  node.frequency.value = freq
  if (detune) node.detune.value = detune

  // Frequency glide
  if (freqEnd !== null) {
    node.frequency.setValueAtTime(freq, t)
    node.frequency.linearRampToValueAtTime(freqEnd, t + dur)
  }

  // Amplitude envelope
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + attack)
  if (sustain > 0) gain.gain.setValueAtTime(volume, t + attack + sustain)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  // Optional filter in chain
  if (filter) {
    const f = ctx.createBiquadFilter()
    f.type            = filter.type
    f.frequency.value = filter.freq
    if (filter.q) f.Q.value = filter.q
    node.connect(f)
    f.connect(gain)
  } else {
    node.connect(gain)
  }

  gain.connect(_master)
  node.start(t)
  node.stop(t + dur + 0.05)
}

/**
 * Play a burst of white noise through a filter with an amplitude envelope.
 */
function noise({
  volume   = 0.2,
  attack   = 0.01,
  decay    = 0.2,
  filterType = 'bandpass',
  filterFreq = 800,
  filterFreqEnd = null,
  filterQ  = 2,
  delay    = 0,
}) {
  const ctx  = ensureCtx()
  const t    = ctx.currentTime + delay
  const dur  = attack + decay

  // White noise via AudioBuffer
  const bufSize = ctx.sampleRate * (dur + 0.1)
  const buf  = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1

  const src  = ctx.createBufferSource()
  const filt = ctx.createBiquadFilter()
  const gain = ctx.createGain()

  src.buffer = buf

  filt.type            = filterType
  filt.frequency.value = filterFreq
  filt.Q.value         = filterQ

  if (filterFreqEnd !== null) {
    filt.frequency.setValueAtTime(filterFreq, t)
    filt.frequency.exponentialRampToValueAtTime(filterFreqEnd, t + dur)
  }

  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(volume, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)

  src.connect(filt)
  filt.connect(gain)
  gain.connect(_master)

  src.start(t)
  src.stop(t + dur + 0.1)
}

/**
 * Play a sequence of tones as an arpeggio.
 * `notes` is an array of { freq, volume?, type? }.
 * `spacing` is seconds between note starts.
 */
function arpeggio(notes, { spacing = 0.12, attack = 0.02, decay = 0.18, volume = 0.2, type = 'sine' } = {}) {
  notes.forEach((note, i) => {
    osc({
      freq:   note.freq,
      type:   note.type  || type,
      volume: note.volume || volume,
      attack,
      decay,
      delay:  i * spacing,
    })
  })
}

// ─── Ambient Drone ────────────────────────────────────────────────────────────

/**
 * Start the persistent ambient drone.
 * The drone is a cluster of very low oscillators, slightly detuned from each other,
 * filtered heavily so only sub-bass and low-mid frequencies pass through.
 * A slow LFO adds a barely-perceptible breathing movement to the volume.
 * Effect: the hum of a data centre in a fantasy world.
 */
export function startAmbient() {
  if (_droneStarted) return
  const ctx = ensureCtx()
  _droneStarted = true

  const t = ctx.currentTime

  // Layer 1 — sub bass cluster (slight beating from detuning)
  const basePairs = [
    { freq: 41.2,  detune:  0,  vol: 0.055 },  // E1
    { freq: 41.2,  detune: +6,  vol: 0.030 },  // detuned for beating
    { freq: 82.4,  detune:  0,  vol: 0.030 },  // E2 octave
    { freq: 123.5, detune: -4,  vol: 0.018 },  // B2 fifth
  ]

  for (const { freq, detune, vol } of basePairs) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const f = ctx.createBiquadFilter()

    o.type            = 'sine'
    o.frequency.value = freq
    o.detune.value    = detune

    f.type            = 'lowpass'
    f.frequency.value = 280
    f.Q.value         = 0.8

    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 4.0)  // 4s fade-in

    o.connect(f)
    f.connect(g)
    g.connect(_master)
    o.start(t)

    _droneNodes.push({ osc: o, gain: g })
  }

  // Layer 2 — mid texture (very quiet, bandpassed, slightly higher)
  const midFreqs = [220, 220.8, 330]
  for (const [i, freq] of midFreqs.entries()) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const f = ctx.createBiquadFilter()

    o.type            = 'sine'
    o.frequency.value = freq

    f.type            = 'bandpass'
    f.frequency.value = freq
    f.Q.value         = 3

    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.008 - i * 0.001, t + 6.0)

    o.connect(f)
    f.connect(g)
    g.connect(_master)
    o.start(t)

    _droneNodes.push({ osc: o, gain: g })
  }

  // Slow breathing LFO (~0.07 Hz = one breath per ~14 seconds)
  const lfo     = ctx.createOscillator()
  const lfoGain = ctx.createGain()

  lfo.type            = 'sine'
  lfo.frequency.value = 0.07
  lfoGain.gain.value  = 0.012  // subtle — barely moves the volume

  lfo.connect(lfoGain)
  lfoGain.connect(_master.gain)
  lfo.start(t)

  _droneNodes.push({ osc: lfo, gain: lfoGain })
}

export function stopAmbient() {
  const ctx = ensureCtx()
  const t   = ctx.currentTime

  for (const { osc, gain } of _droneNodes) {
    try {
      gain.gain.setValueAtTime(gain.gain.value, t)
      gain.gain.linearRampToValueAtTime(0, t + 2.0)
      osc.stop(t + 2.1)
    } catch (_) {}
  }

  setTimeout(() => {
    _droneNodes = []
    _droneStarted = false
  }, 2200)
}

// ─── Volume / Mute ────────────────────────────────────────────────────────────

export function setMasterVolume(v) {
  _volume = Math.max(0, Math.min(1, v))
  if (_master && !_muted) _master.gain.value = _volume
}

export function isMuted() { return _muted }

export function toggleMute() {
  _muted = !_muted
  if (_master) {
    const ctx = ensureCtx()
    const t   = ctx.currentTime
    _master.gain.setValueAtTime(_master.gain.value, t)
    _master.gain.linearRampToValueAtTime(_muted ? 0 : _volume, t + 0.08)
  }
  return _muted
}

// ─── Service Placement Sounds ─────────────────────────────────────────────────
// Each service gets a sound that reflects its AWS character.
// Teaching value: the sound should reinforce what the service IS.

const SERVICE_SOUNDS = {

  // ── Internet Gateway — deep, ceremonial, one-per-VPC gate opening ────────
  igw() {
    // Low boom: fundamental + fifth
    osc({ freq: 55,  type: 'sine', volume: 0.28, attack: 0.15, sustain: 0.35, decay: 1.1 })
    osc({ freq: 82,  type: 'sine', volume: 0.14, attack: 0.12, sustain: 0.2,  decay: 0.9 })
    // Brief gate creak (noise transient)
    noise({ volume: 0.12, attack: 0.02, decay: 0.18, filterType: 'bandpass', filterFreq: 300, filterQ: 1.5 })
  },

  // ── CloudFront — ethereal scanning sweep ──────────────────────────────────
  cf() {
    // Two slightly detuned oscillators create a phaser effect
    osc({ freq: 440, type: 'sine', volume: 0.18, attack: 0.05, decay: 0.4, freqEnd: 660 })
    osc({ freq: 444, type: 'sine', volume: 0.10, attack: 0.05, decay: 0.4, freqEnd: 664, delay: 0.01 })
  },

  // ── Load Balancer — metallic shield ring ──────────────────────────────────
  alb() {
    // High metallic ping
    osc({ freq: 1760, type: 'sine', volume: 0.22, attack: 0.008, decay: 0.5 })
    // Body resonance underneath
    osc({ freq: 220,  type: 'sine', volume: 0.12, attack: 0.015, decay: 0.3 })
  },

  // ── EC2 — solid metallic clank, armour settling ───────────────────────────
  ec2() {
    osc({ freq: 180, type: 'sawtooth', volume: 0.20, attack: 0.04, sustain: 0.05, decay: 0.35,
          filter: { type: 'bandpass', freq: 350, q: 2.5 } })
    // Impact transient
    noise({ volume: 0.10, attack: 0.005, decay: 0.12, filterType: 'highpass', filterFreq: 600 })
  },

  // ── ECS — three-beat march (multiple identical soldiers) ─────────────────
  ecs() {
    for (let i = 0; i < 3; i++) {
      noise({ volume: 0.10 - i * 0.02, attack: 0.005, decay: 0.08,
              filterType: 'bandpass', filterFreq: 180 + i * 40, filterQ: 2,
              delay: i * 0.065 })
    }
  },

  // ── NAT Gateway — swirling portal whoosh ─────────────────────────────────
  nat() {
    // Filtered noise sweeping up (private traffic going outbound through tunnel)
    noise({ volume: 0.18, attack: 0.04, decay: 0.28,
            filterType: 'bandpass', filterFreq: 300, filterFreqEnd: 1800, filterQ: 2 })
    // Subtle sine undertone
    osc({ freq: 80, type: 'sine', volume: 0.10, attack: 0.04, decay: 0.25 })
  },

  // ── Lambda — quick, airy, ephemeral. Appears and vanishes ────────────────
  lambda() {
    // High freq, very fast envelope — ninja appearing
    osc({ freq: 880, type: 'sine', volume: 0.15, attack: 0.008, decay: 0.18,
          freqEnd: 660, filter: { type: 'highpass', freq: 400 } })
    // Soft air whoosh (the vanishing)
    noise({ volume: 0.06, attack: 0.01, decay: 0.12,
            filterType: 'highpass', filterFreq: 2000, delay: 0.06 })
  },

  // ── RDS — deep resonant gong. Holds everything, warm, stable ─────────────
  rds() {
    // Perfect fifth interval (E2 + B2): sounds stable, harmonious
    osc({ freq: 82,  type: 'sine', volume: 0.30, attack: 0.08, sustain: 0.1, decay: 1.4 })
    osc({ freq: 123, type: 'sine', volume: 0.18, attack: 0.10, sustain: 0.1, decay: 1.1 })
    // High shimmer
    osc({ freq: 660, type: 'sine', volume: 0.07, attack: 0.03, decay: 0.4 })
  },

  // ── DynamoDB — ancient stone grinding, powerful and chaotic ──────────────
  dynamo() {
    osc({ freq: 65, type: 'sawtooth', volume: 0.22, attack: 0.08, sustain: 0.1, decay: 0.55,
          filter: { type: 'lowpass', freq: 200, q: 1.5 } })
    noise({ volume: 0.10, attack: 0.06, decay: 0.4,
            filterType: 'bandpass', filterFreq: 120, filterQ: 1 })
  },

  // ── S3 — vast hollow hum, beating oscillators (like wind in a cavern) ─────
  s3() {
    // Three oscillators slightly detuned — beating creates sense of vast space
    osc({ freq: 55,   type: 'sine', volume: 0.20, attack: 0.18, sustain: 0.2, decay: 1.2 })
    osc({ freq: 55.7, type: 'sine', volume: 0.15, attack: 0.20, sustain: 0.2, decay: 1.0 })
    osc({ freq: 56.4, type: 'sine', volume: 0.10, attack: 0.22, sustain: 0.2, decay: 0.9 })
  },

  // ── SQS — raven chirp glide. Messaging, light and quick ──────────────────
  sqs() {
    // Bird-like pitch glide: up then down (like a raven call)
    osc({ freq: 600, type: 'triangle', volume: 0.18, attack: 0.02, decay: 0.14, freqEnd: 400 })
    osc({ freq: 400, type: 'triangle', volume: 0.12, attack: 0.01, decay: 0.12, freqEnd: 620, delay: 0.1 })
  },

  // ── IAM — parchment rustle then wax seal stamp ────────────────────────────
  iam() {
    noise({ volume: 0.12, attack: 0.01, decay: 0.14,
            filterType: 'bandpass', filterFreq: 2200, filterQ: 1.5 })
    // Seal stamp
    osc({ freq: 440, type: 'sine', volume: 0.16, attack: 0.005, decay: 0.15, delay: 0.12 })
    noise({ volume: 0.08, attack: 0.005, decay: 0.08,
            filterType: 'bandpass', filterFreq: 400, filterQ: 2, delay: 0.12 })
  },
}

// Map any unknown service IDs to a generic placement sound
function genericPlacement() {
  osc({ freq: 440, type: 'sine', volume: 0.16, attack: 0.02, decay: 0.25 })
}

// ─── Public Event Sounds ──────────────────────────────────────────────────────

/**
 * Play the unique sound for a service being placed.
 * Called immediately after a successful placement.
 */
export function playPlacement(serviceId) {
  ensureCtx()
  const fn = SERVICE_SOUNDS[serviceId]
  if (fn) fn()
  else genericPlacement()
}

/**
 * "Recall" sound — played when a service is removed from the board.
 * Reversed envelope: starts bright, tapers down like something fading away.
 */
export function playRemoval() {
  ensureCtx()
  // Brief descending tone — the service vanishing
  osc({ freq: 550, type: 'sine', volume: 0.14, attack: 0.005, decay: 0.22, freqEnd: 220 })
  noise({ volume: 0.06, attack: 0.005, decay: 0.18, filterType: 'highpass', filterFreq: 1500 })
}

/**
 * Connection formed — two services "resonate" as their gold line appears.
 * Perfect fifth interval (harmonious frequencies).
 */
export function playConnection() {
  ensureCtx()
  osc({ freq: 440, type: 'sine', volume: 0.12, attack: 0.01, decay: 0.30 })
  osc({ freq: 660, type: 'sine', volume: 0.08, attack: 0.01, decay: 0.30, delay: 0.02 })
}

/**
 * Mission complete — triumphant ascending arpeggio.
 * C major arpeggio + octave (C4 E4 G4 C5).
 */
export function playMissionComplete() {
  ensureCtx()
  arpeggio(
    [
      { freq: 262 },   // C4
      { freq: 330 },   // E4
      { freq: 392 },   // G4
      { freq: 523, volume: 0.28 },  // C5 — louder for emphasis
    ],
    { spacing: 0.13, attack: 0.02, decay: 0.35, volume: 0.22, type: 'sine' }
  )
  // Sustaining pad underneath
  osc({ freq: 131, type: 'sine', volume: 0.14, attack: 0.05, sustain: 0.4, decay: 0.8, delay: 0.1 })
}

/**
 * Error / placement rejected — short, low, unambiguous.
 */
export function playError() {
  ensureCtx()
  osc({ freq: 160, type: 'square', volume: 0.20, attack: 0.005, sustain: 0.05, decay: 0.12,
        filter: { type: 'lowpass', freq: 400 } })
}

/**
 * Hover tick — barely audible, only triggered when cursor moves to a new hex.
 * The player shouldn't consciously hear it — they should just feel the board has weight.
 */
export function playHover() {
  ensureCtx()
  osc({ freq: 880, type: 'sine', volume: 0.035, attack: 0.005, decay: 0.04 })
}

/**
 * Gold received — light coin-ping.
 */
export function playGoldGain() {
  ensureCtx()
  osc({ freq: 1320, type: 'sine', volume: 0.14, attack: 0.005, decay: 0.20 })
  osc({ freq: 2640, type: 'sine', volume: 0.07, attack: 0.005, decay: 0.15, delay: 0.03 })
}

/**
 * Selection confirmed — service selected from palette.
 * Very brief, high acknowledgement tone.
 */
export function playSelect() {
  ensureCtx()
  osc({ freq: 660, type: 'sine', volume: 0.10, attack: 0.005, decay: 0.12 })
}

/**
 * Selection cleared / Escape — soft dismissal tone.
 */
export function playCancelSelection() {
  ensureCtx()
  osc({ freq: 440, type: 'sine', volume: 0.08, attack: 0.005, decay: 0.15, freqEnd: 330 })
}
