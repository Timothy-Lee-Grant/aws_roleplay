// ─── Grid geometry ────────────────────────────────────────────────────────────
export const COLS    = 11
export const ROWS    = 9
export const HEX_R   = 32        // outer radius: center → vertex (px)
export const COL_STEP = HEX_R * Math.sqrt(3)   // horizontal spacing between hex centres
export const ROW_STEP = HEX_R * 1.5             // vertical spacing between hex centres
export const BOARD_PAD_X = 28   // left/top padding in world-space before grid starts
export const BOARD_PAD_Y = 36

// ─── Terrain IDs ──────────────────────────────────────────────────────────────
export const TERRAIN = {
  VOID:    'void',
  OUTSIDE: 'outside',
  WALL:    'wall',
  GATE:    'gate',
  PUBLIC:  'public',
  PRIVATE: 'private',
}

// ─── Terrain colours (used in canvas draw) ────────────────────────────────────
export const TERRAIN_COLOR = {
  void:    '#070810',
  outside: '#0f1118',
  wall:    '#18261a',
  gate:    '#1e2e1a',
  public:  '#1b2e18',
  private: '#122518',
}
export const TERRAIN_STROKE = {
  void:    '#0a0c14',
  outside: '#13161f',
  wall:    '#2a4028',
  gate:    '#6a8c40',
  public:  '#2e5028',
  private: '#1e4a38',
}

// ─── Services ─────────────────────────────────────────────────────────────────
export const SERVICES = [
  { id:'igw',    icon:'🌐', fantasy:'The Iron Gate',  aws:'Internet Gateway',   zone:'wall',    cost:0,  max:1, conns:['alb','ec2','cf']            },
  { id:'cf',     icon:'👁',  fantasy:'Far Watcher',    aws:'CloudFront',         zone:'public',  cost:5,  max:2, conns:['alb','s3']                  },
  { id:'alb',    icon:'🛡',  fantasy:'Siege Shield',   aws:'Load Balancer',      zone:'public',  cost:15, max:2, conns:['ec2','ecs','lambda']         },
  { id:'ec2',    icon:'⚔️',  fantasy:'Iron Knight',    aws:'EC2 Instance',       zone:'public',  cost:20, max:4, conns:['rds','sqs','s3','alb']       },
  { id:'ecs',    icon:'🪖',  fantasy:'The Barracks',   aws:'ECS / Fargate',      zone:'public',  cost:12, max:3, conns:['rds','sqs','s3']             },
  { id:'nat',    icon:'🌀',  fantasy:'Secret Tunnel',  aws:'NAT Gateway',        zone:'public',  cost:10, max:1, conns:['lambda','ecs']               },
  { id:'lambda', icon:'🥷',  fantasy:'Shadow Ninja',   aws:'Lambda Function',    zone:'private', cost:0,  max:6, conns:['sqs','rds','s3','dynamo']    },
  { id:'rds',    icon:'📚',  fantasy:'Great Library',  aws:'RDS Database',       zone:'private', cost:25, max:2, conns:['ec2','ecs','lambda']         },
  { id:'dynamo', icon:'🗿',  fantasy:'Ancient Ruins',  aws:'DynamoDB',           zone:'private', cost:5,  max:3, conns:['lambda','ec2','ecs']         },
  { id:'s3',     icon:'🏛',  fantasy:'Endless Vault',  aws:'S3 Bucket',          zone:'private', cost:2,  max:4, conns:['cf','ec2','lambda','ecs']    },
  { id:'sqs',    icon:'🐦',  fantasy:'Raven Queue',    aws:'SQS Queue',          zone:'private', cost:1,  max:4, conns:['lambda','ec2','ecs']         },
  { id:'iam',    icon:'📜',  fantasy:'Royal Decree',   aws:'IAM Role',           zone:'any',     cost:0,  max:8, conns:[]                             },
]

// ─── Missions ─────────────────────────────────────────────────────────────────
export const MISSIONS = [
  {
    id: 0,
    name: 'The First Bastion',
    reward: 30,
    lore: "A lone knight must guard the realm's gate. Open the Iron Gate, deploy a Knight, and station a Siege Shield.",
    reqs: [
      { text:'Place the Iron Gate (IGW) on a wall tile',                    icon:'🌐', check: s => s.placed.some(p=>p.id==='igw') },
      { text:'Deploy an Iron Knight (EC2) in the public subnet',            icon:'⚔️', check: s => s.placed.some(p=>p.id==='ec2' && p.zone==='public') },
      { text:'Station a Siege Shield (ALB) in the public subnet',           icon:'🛡', check: s => s.placed.some(p=>p.id==='alb' && p.zone==='public') },
    ],
  },
  {
    id: 1,
    name: 'The Serverless Scout',
    reward: 40,
    lore: "Shadow Ninjas work through the Raven Queue — summoned by messages, they strike and vanish. Build a serverless pipeline in the Inner Sanctum.",
    reqs: [
      { text:'Place a Shadow Ninja (Lambda) in the private subnet',         icon:'🥷', check: s => s.placed.some(p=>p.id==='lambda' && p.zone==='private') },
      { text:'Deploy a Raven Queue (SQS) in the private subnet',            icon:'🐦', check: s => s.placed.some(p=>p.id==='sqs'    && p.zone==='private') },
      { text:'Lambda and SQS must be on adjacent tiles',                    icon:'🔗', check: s => checkAdjacent(s,'lambda','sqs') },
    ],
  },
  {
    id: 2,
    name: 'The Eternal Archive',
    reward: 50,
    lore: "Link the Endless Vault to the Far Watcher so artifacts are cached at the kingdom's edge. Protect knowledge with the Great Library.",
    reqs: [
      { text:'Place the Endless Vault (S3) in the private subnet',          icon:'🏛', check: s => s.placed.some(p=>p.id==='s3'  && p.zone==='private') },
      { text:'Station a Far Watcher (CloudFront) in the public subnet',     icon:'👁', check: s => s.placed.some(p=>p.id==='cf'  && p.zone==='public') },
      { text:'Protect knowledge with the Great Library (RDS)',              icon:'📚', check: s => s.placed.some(p=>p.id==='rds' && p.zone==='private') },
    ],
  },
]

// Helper used by mission checks — getNeighbors injected from store
function checkAdjacent(s, idA, idB) {
  const nbFn = s.getNeighbors
  if (!nbFn) return false
  const pA = s.placed.filter(p=>p.id===idA)
  const pB = s.placed.filter(p=>p.id===idB)
  for (const a of pA) {
    const nbrs = nbFn(a.row, a.col)
    for (const b of pB) if (nbrs.some(n=>n.row===b.row&&n.col===b.col)) return true
  }
  return false
}
