import React, { useState, useCallback } from 'react'
import { useGameStore }                        from '../store/gameStore.js'
import { MISSIONS, SERVICES, HOURLY_COSTS, REAL_COSTS } from '../game/constants.js'

// ── Failure education map — keyed by threat name or packet-fail substring ─────
// Used by the post-mortem panel to give AWS context for each failure.
const THREAT_EDUCATION = {
  'The Brute': {
    icon: '💀', category: 'Security',
    headline: 'DDoS — Unprotected Load Balancer',
    context: 'An ALB directly exposed to the internet without WAF is a layer-7 target. WAF rules block malformed requests, apply rate limits, and enforce OWASP Top 10 protections before traffic reaches your servers.',
    realFix: 'Place The Ward (WAF) adjacent to your ALB or CloudFront',
    cert: 'SAA-C03: Security — Protect internet-facing resources with WAF',
  },
  'The Thief': {
    icon: '🗡️', category: 'Security',
    headline: 'Data Breach — Database Exposed',
    context: "RDS in a public subnet or without a Security Group is reachable from any internet IP. Security Groups act as stateful firewalls — only trusted sources (your EC2's SG) should connect on port 3306/5432.",
    realFix: 'Move RDS to the Private Subnet and add a Permission Scroll (Security Group)',
    cert: 'SAA-C03: Security — Determine appropriate data security controls',
  },
  'The Impersonator': {
    icon: '👤', category: 'Security',
    headline: 'IAM Failure — Lambda Execution Denied',
    context: 'Lambda needs an IAM execution role to call any AWS API. Without one, every SDK call — S3.putObject, DynamoDB.put, etc. — returns AccessDeniedException. The function starts but cannot do anything useful.',
    realFix: 'Place a Royal Decree (IAM) adjacent to your Lambda function',
    cert: 'SAA-C03: Security — Apply IAM roles and least-privilege to Lambda',
  },
  'The Phantom': {
    icon: '👻', category: 'Operational Excellence',
    headline: 'Silent Failure — No Monitoring',
    context: "Without CloudWatch, services fail silently. You won't see CPU spikes, memory exhaustion, or error surges until users complain. CloudWatch Metrics + Alarms + Logs Insights are non-negotiable for production.",
    realFix: 'Place All-Seeing Eye (CloudWatch) adjacent to EC2, Lambda, and RDS',
    cert: 'SAA-C03: Operational Excellence — Design for operational monitoring',
  },
  'The Miser': {
    icon: '💰', category: 'Cost Optimization',
    headline: 'Cost Overrun — NAT Processing S3 Traffic',
    context: 'NAT Gateway charges $0.045/GB of data processed. 1 TB/month of S3 traffic through NAT = $46 in data charges alone. An S3 Gateway VPC Endpoint routes S3 traffic privately at zero data-transfer cost.',
    realFix: 'Add a Secret Passage (VPC Endpoint) to bypass NAT for S3 access',
    cert: 'SAA-C03: Cost Optimization — Use VPC Endpoints for S3 and DynamoDB',
  },
}

const PACKET_FAIL_EDUCATION = {
  'Lambda has no IAM role': {
    icon: '🔑', category: 'Security',
    headline: 'Lambda Cannot Call AWS APIs',
    context: 'Lambda functions are identity-less by default. Without an execution role, the runtime cannot sign AWS API calls — AccessDeniedException on the first SDK call. Affects S3 reads, DynamoDB writes, CloudWatch logs.',
    realFix: 'Attach an IAM execution role with minimum required permissions',
    cert: 'SAA-C03: Security — Lambda execution roles and permissions',
  },
  'Security Group': {
    icon: '🛡', category: 'Security',
    headline: 'Traffic Blocked — Missing Security Group',
    context: 'Security Groups are the stateful firewall for EC2, RDS, ALB, and Lambda-in-VPC. A new SG has no inbound rules by default — all inbound is denied. Without one, packets reaching the service are rejected.',
    realFix: 'Place a Permission Scroll (Security Group) adjacent to the affected service',
    cert: 'SAA-C03: Security — VPC security with Security Groups',
  },
}

// ── SAA-C03 domain coverage per mission ───────────────────────────────────────
const MISSION_CERT = {
  bastion:      { domain: 'Design Resilient Architectures',      topic: 'IGW + ALB + EC2 three-tier web app' },
  serverless:   { domain: 'Design High-Performing Architectures', topic: 'Event-driven: SQS → Lambda pipeline' },
  archive:      { domain: 'Design Cost-Optimized Architectures',  topic: 'CloudFront + S3 CDN + RDS storage' },
  gatekeepers:  { domain: 'Design Secure Architectures',          topic: 'API Gateway → Lambda + IAM execution role' },
  herald:       { domain: 'Design High-Performing Architectures', topic: 'SNS fan-out to multiple SQS consumers' },
  warded:       { domain: 'Design Secure Architectures',          topic: 'WAF + CloudFront + S3 origin shield' },
  passage:      { domain: 'Design Cost-Optimized Architectures',  topic: 'VPC Gateway Endpoint for S3 (zero NAT cost)' },
  crystal:      { domain: 'Design High-Performing Architectures', topic: 'ElastiCache caching layer in front of RDS' },
  cartographer: { domain: 'Design Resilient Architectures',       topic: 'Route53 DNS routing to multi-instance ALB' },
  redundant:    { domain: 'Design Resilient Architectures',       topic: 'Multi-AZ RDS + cross-AZ ALB deployment' },
  gatekeeper:   { domain: 'Design Secure Architectures',          topic: 'Cognito → API Gateway → Lambda auth flow' },
  watchful:     { domain: 'Design Operational Excellence',        topic: 'CloudWatch monitoring all compute tiers' },
  siege:        { domain: 'Design Resilient Architectures',       topic: 'ALB + Auto Scaling Group under traffic load' },
  prophecy:     { domain: 'Design High-Performing Architectures', topic: 'EventBridge scheduled + event-driven routing' },
  kingdom:      { domain: 'All SAA-C03 Domains',                  topic: 'Full three-tier production architecture capstone' },
}

// ── Well-Architected pillar config ────────────────────────────────────────────
const PILLARS = [
  { key: 'security',             label: 'Security',              max: 40, color: '#e06050' },
  { key: 'reliability',          label: 'Reliability',           max: 20, color: '#60a0e0' },
  { key: 'performance',          label: 'Performance',           max: 20, color: '#80c060' },
  { key: 'costOptimization',     label: 'Cost Optimization',     max: 10, color: '#e0c040' },
  { key: 'operationalExcellence',label: 'Ops Excellence',        max: 10, color: '#a060e0' },
]

function ScoreBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: '#7a9870', fontFamily: 'sans-serif', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ fontSize: '11px', color: color, fontFamily: "'Cinzel', serif" }}>
          {value}/{max}
        </span>
      </div>
      <div style={{
        height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: '3px', transition: 'width 0.8s ease',
          boxShadow: `0 0 6px ${color}44`,
        }} />
      </div>
    </div>
  )
}

// ── Radar / spider chart ───────────────────────────────────────────────────────
// Pentagon SVG with 5 axes — one per Well-Architected pillar.
// Each axis is normalized 0→1 by its max score.
const RADAR_SIZE  = 160  // px — width/height of the SVG square
const RADAR_CX    = 80
const RADAR_CY    = 84   // slightly lower to give room for labels
const RADAR_R     = 56   // max radius for a full score

function polarToXY(angleDeg, r, cx, cy) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function RadarChart({ pillars, values }) {
  const n = pillars.length
  const step = 360 / n

  // Grid rings at 25%, 50%, 75%, 100%
  const rings = [0.25, 0.5, 0.75, 1.0]

  // Polygon points for each ring
  const ringPoints = rings.map(pct =>
    pillars.map((_, i) => polarToXY(i * step, RADAR_R * pct, RADAR_CX, RADAR_CY)).map(p => p.join(',')).join(' ')
  )

  // Axis lines
  const axes = pillars.map((_, i) => {
    const [x, y] = polarToXY(i * step, RADAR_R, RADAR_CX, RADAR_CY)
    return { x, y }
  })

  // Data polygon — normalize each value by its max
  const dataPoints = pillars.map((p, i) => {
    const ratio = Math.min(1, (values[p.key] ?? 0) / p.max)
    return polarToXY(i * step, RADAR_R * ratio, RADAR_CX, RADAR_CY)
  })
  const dataStr = dataPoints.map(p => p.join(',')).join(' ')

  // Label positions — slightly beyond the grid edge
  const labels = pillars.map((p, i) => {
    const [x, y] = polarToXY(i * step, RADAR_R + 18, RADAR_CX, RADAR_CY)
    return { ...p, x, y, angle: i * step }
  })

  return (
    <svg
      width={RADAR_SIZE} height={RADAR_SIZE}
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}
    >
      {/* Background rings */}
      {ringPoints.map((pts, ri) => (
        <polygon key={ri} points={pts}
          fill="none" stroke="rgba(96,120,64,0.18)" strokeWidth={0.8} />
      ))}

      {/* Axis spokes */}
      {axes.map((ax, i) => (
        <line key={i}
          x1={RADAR_CX} y1={RADAR_CY} x2={ax.x} y2={ax.y}
          stroke="rgba(96,120,64,0.22)" strokeWidth={0.8} />
      ))}

      {/* Data polygon fill */}
      <polygon points={dataStr}
        fill="rgba(80,160,100,0.18)"
        stroke="rgba(96,200,120,0.7)"
        strokeWidth={1.5}
        strokeLinejoin="round" />

      {/* Data points */}
      {dataPoints.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3}
          fill={pillars[i].color}
          stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} />
      ))}

      {/* Pillar labels */}
      {labels.map((lb, i) => {
        const anchor = lb.angle < 10 || lb.angle > 350 ? 'middle'
          : lb.angle < 180 ? 'start' : lb.angle > 180 ? 'end' : 'middle'
        return (
          <text key={i} x={lb.x} y={lb.y}
            textAnchor={anchor} dominantBaseline="middle"
            fontSize="8" fill={lb.color} fontFamily="sans-serif"
            style={{ letterSpacing: '0.05em' }}
          >
            {lb.label}
          </text>
        )
      })}
    </svg>
  )
}

function StatCard({ icon, value, label, sub }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(96,120,64,0.2)',
      borderRadius: '3px',
      padding: '16px 20px',
      textAlign: 'center',
      minWidth: '110px',
    }}>
      <div style={{ fontSize: '24px', marginBottom: '4px' }}>{icon}</div>
      <div style={{
        fontFamily: "'Cinzel', serif", fontSize: '24px', fontWeight: 700,
        color: '#c8d8a0', lineHeight: 1,
      }}>{value}</div>
      <div style={{ fontSize: '10px', color: '#4a6a40', letterSpacing: '0.15em', marginTop: '4px' }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: '10px', color: '#3a5030', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

// ── Export generation ─────────────────────────────────────────────────────────

function buildTextSummary(placed, totalScore, grade) {
  if (!placed.length) return 'No services deployed.'
  const counts = placed.reduce((acc, p) => { acc[p.id] = (acc[p.id] ?? 0) + 1; return acc }, {})
  const lines = Object.entries(counts).map(([id, n]) => {
    const svc = SERVICES.find(s => s.id === id)
    const name = svc?.aws ?? id
    return `  • ${n}× ${name}${n > 1 ? '' : ''}`
  })
  return [
    'CloudRealm — Architecture Export',
    '─'.repeat(40),
    '',
    'Deployed services:',
    ...lines,
    '',
    `Well-Architected score: ${totalScore}/100 (${grade})`,
    '',
    'Monthly cost estimate:',
    ...Object.entries(counts).map(([id, n]) => {
      const cost = REAL_COSTS[id] ?? '—'
      const svc = SERVICES.find(s => s.id === id)
      return `  ${svc?.aws ?? id}${n > 1 ? ` ×${n}` : ''}: ${cost}`
    }),
  ].join('\n')
}

// Simplified CloudFormation resource type map
const CFN_TYPES = {
  igw:          'AWS::EC2::InternetGateway',
  alb:          'AWS::ElasticLoadBalancingV2::LoadBalancer',
  ec2:          'AWS::EC2::Instance',
  ecs:          'AWS::ECS::Service',
  nat:          'AWS::EC2::NatGateway',
  lambda:       'AWS::Lambda::Function',
  rds:          'AWS::RDS::DBInstance',
  dynamo:       'AWS::DynamoDB::Table',
  s3:           'AWS::S3::Bucket',
  sqs:          'AWS::SQS::Queue',
  iam:          'AWS::IAM::Role',
  sg:           'AWS::EC2::SecurityGroup',
  rt:           'AWS::EC2::RouteTable',
  route53:      'AWS::Route53::RecordSet',
  apigw:        'AWS::ApiGatewayV2::Api',
  sns:          'AWS::SNS::Topic',
  elasticache:  'AWS::ElastiCache::ReplicationGroup',
  eventbridge:  'AWS::Events::Rule',
  waf:          'AWS::WAFv2::WebACL',
  cognito:      'AWS::Cognito::UserPool',
  cloudwatch:   'AWS::CloudWatch::Alarm',
  vpc_endpoint: 'AWS::EC2::VPCEndpoint',
  cf:           'AWS::CloudFront::Distribution',
}

function buildCloudFormation(placed) {
  if (!placed.length) return 'AWSTemplateFormatVersion: "2010-09-09"\nDescription: "CloudRealm Export"\n\nResources:\n  # No services deployed'
  const seen = new Set()
  const resources = []
  let idx = {}
  for (const p of placed) {
    idx[p.id] = (idx[p.id] ?? 0) + 1
    const suffix = idx[p.id] > 1 ? idx[p.id] : ''
    const logicalId = p.id.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      .replace(/^./, c => c.toUpperCase()) + suffix
    const cfnType = CFN_TYPES[p.id] ?? `AWS::Unknown::${p.id}`
    const svc = SERVICES.find(s => s.id === p.id)
    resources.push(`  # ${svc?.aws ?? p.id} (${p.zone ?? 'any'} subnet)`)
    resources.push(`  ${logicalId}:`)
    resources.push(`    Type: ${cfnType}`)
    if (p.id === 'ec2') {
      resources.push(`    Properties:`)
      resources.push(`      InstanceType: t3.medium`)
      resources.push(`      # SubnetId: !Ref ${p.zone === 'public' ? 'PublicSubnet' : 'PrivateSubnet'}`)
    } else if (p.id === 'rds') {
      resources.push(`    Properties:`)
      resources.push(`      DBInstanceClass: db.t3.medium`)
      resources.push(`      Engine: mysql`)
      resources.push(`      MultiAZ: ${p.az === 'az2' ? 'true  # Multi-AZ recommended' : 'false  # ⚠ Single-AZ'}`)
    } else if (p.id === 'lambda') {
      resources.push(`    Properties:`)
      resources.push(`      Runtime: nodejs20.x`)
      resources.push(`      Role: !GetAtt LambdaExecutionRole.Arn`)
    }
    resources.push(``)
  }
  return [
    'AWSTemplateFormatVersion: "2010-09-09"',
    'Description: "CloudRealm Architecture Export — simplified, not deployable"',
    '',
    'Resources:',
    ...resources,
  ].join('\n')
}

// ── Export modal ──────────────────────────────────────────────────────────────
function ExportModal({ placed, totalScore, grade, onClose }) {
  const [tab, setTab] = useState('text')
  const textContent = buildTextSummary(placed, totalScore, grade)
  const cfnContent  = buildCloudFormation(placed)
  const content     = tab === 'text' ? textContent : cfnContent
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }, [content])

  return (
    <div style={Ex.backdrop} onClick={onClose}>
      <div style={Ex.panel} onClick={e => e.stopPropagation()}>
        <div style={Ex.header}>
          <span style={Ex.title}>📤 Architecture Export</span>
          <button style={Ex.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={Ex.tabs}>
          <button style={{ ...Ex.tab, ...(tab === 'text' ? Ex.tabActive : {}) }} onClick={() => setTab('text')}>
            📄 Summary
          </button>
          <button style={{ ...Ex.tab, ...(tab === 'cfn' ? Ex.tabActive : {}) }} onClick={() => setTab('cfn')}>
            ☁ CloudFormation
          </button>
        </div>

        <pre style={Ex.code}>{content}</pre>

        <button style={Ex.copyBtn} onClick={handleCopy}>
          {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
        </button>
      </div>
    </div>
  )
}

const Ex = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 300,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  panel: {
    width: '580px', maxWidth: '95vw',
    background: '#0a0e18',
    border: '1px solid rgba(96,120,64,0.3)',
    borderRadius: '6px',
    padding: '24px',
    display: 'flex', flexDirection: 'column', gap: '14px',
    fontFamily: "'Cinzel', serif",
    maxHeight: '85vh',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  title: {
    fontSize: '14px', color: '#c8d8a0', letterSpacing: '0.1em',
  },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#4a6040', fontSize: '16px',
  },
  tabs: {
    display: 'flex', gap: '8px',
  },
  tab: {
    padding: '6px 14px', background: 'transparent',
    border: '1px solid rgba(60,80,50,0.4)',
    borderRadius: '3px', cursor: 'pointer',
    color: '#4a6040', fontFamily: "'Cinzel', serif",
    fontSize: '11px', letterSpacing: '0.08em',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: 'rgba(40,70,30,0.4)',
    borderColor: 'rgba(96,160,64,0.6)',
    color: '#90c070',
  },
  code: {
    background: '#060c10',
    border: '1px solid rgba(40,60,40,0.4)',
    borderRadius: '3px',
    padding: '14px 16px',
    fontSize: '10px',
    fontFamily: "'Courier New', monospace",
    color: '#6a9060',
    overflowY: 'auto',
    maxHeight: '50vh',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 1.7,
    margin: 0,
  },
  copyBtn: {
    padding: '10px 0', background: 'rgba(30,60,25,0.5)',
    border: '1px solid rgba(96,160,64,0.4)',
    borderRadius: '3px', cursor: 'pointer',
    color: '#80c060', fontFamily: "'Cinzel', serif",
    fontSize: '12px', letterSpacing: '0.1em',
    transition: 'all 0.15s',
  },
}

export default function DebriefScreen() {
  const waveResult        = useGameStore(s => s.waveResult)
  const completedMissions = useGameStore(s => s.completedMissions)
  const activeMission     = useGameStore(s => s.activeMission)
  const placed            = useGameStore(s => s.placed)
  const battleLog         = useGameStore(s => s.battleLog)
  const mode              = useGameStore(s => s.mode)
  const continueFromDebrief = useGameStore(s => s.continueFromDebrief)
  const [showExport, setShowExport] = useState(false)
  const startGame         = useGameStore(s => s.startGame)

  // Cost estimate — same formula as HUD burn pill, scaled to monthly
  const hourlyBurn      = placed.reduce((sum, p) => sum + (HOURLY_COSTS[p.id] ?? 0), 0)
  const estimatedMonthly = Math.round(hourlyBurn * 730 / 10)
  // Unique service ids present, with count, sorted by cost descending
  const serviceCount = placed.reduce((acc, p) => { acc[p.id] = (acc[p.id] ?? 0) + 1; return acc }, {})
  const uniqueIds = Object.keys(serviceCount).sort(
    (a, b) => (HOURLY_COSTS[b] ?? 0) - (HOURLY_COSTS[a] ?? 0)
  )

  const result = waveResult ?? {
    packetsOk: 0, packetsFailed: 0, threats: 0, score: 0,
    wellArchitected: { security: 0, reliability: 0, performance: 0, costOptimization: 0, operationalExcellence: 0 },
  }

  const totalScore = Object.values(result.wellArchitected).reduce((a, b) => a + b, 0)
  const grade = totalScore >= 80 ? 'S' : totalScore >= 60 ? 'A' : totalScore >= 40 ? 'B' : totalScore >= 20 ? 'C' : 'D'
  const gradeColor = { S: '#f0d060', A: '#80c060', B: '#60a0e0', C: '#e0a040', D: '#e05040' }[grade]

  const nextMission = MISSIONS[activeMission]
  const allDone     = completedMissions.length >= MISSIONS.length

  // ── Post-mortem: parse battleLog for unique failures ─────────────────────────
  const threatsStruck = [...new Set(
    battleLog
      .filter(e => e.type === 'threat')
      .map(e => { const m = e.text.match(/^(.+?) struck!/); return m?.[1] ?? null })
      .filter(Boolean)
  )]
  const packetFailKeys = [...new Set(
    battleLog
      .filter(e => e.type === 'fail')
      .map(e => Object.keys(PACKET_FAIL_EDUCATION).find(k => e.text.includes(k)) ?? null)
      .filter(Boolean)
  )]
  const postMortemEntries = [
    ...threatsStruck.map(name  => THREAT_EDUCATION[name]).filter(Boolean),
    ...packetFailKeys.map(key  => PACKET_FAIL_EDUCATION[key]).filter(Boolean),
  ]
  // Deduplicate by headline (threat+packet can overlap on IAM)
  const seenHeadlines = new Set()
  const failureList = postMortemEntries.filter(e => {
    if (seenHeadlines.has(e.headline)) return false
    seenHeadlines.add(e.headline)
    return true
  })

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <span style={S.headerTitle}>⚔️ The Siege Is Over</span>
        <span style={S.headerSub}>Architecture Report</span>
      </div>

      <div style={S.body}>
        {/* Left column — scores */}
        <div style={S.left}>
          {/* Grade */}
          <div style={S.gradeBlock}>
            <div style={{ ...S.grade, color: gradeColor }}>{grade}</div>
            <div style={S.gradeLabel}>
              {grade === 'S' ? 'Legendary Architect' :
               grade === 'A' ? 'Master Architect' :
               grade === 'B' ? 'Capable Architect' :
               grade === 'C' ? 'Apprentice Architect' :
               'Needs Work'}
            </div>
            <div style={S.totalScore}>{totalScore} / 100</div>
          </div>

          <div style={S.divider} />

          {/* Pillar scores — radar chart + score bars */}
          <div style={{ padding: '0 4px' }}>
            <div style={S.sectionLabel}>Well-Architected Pillars</div>
            <RadarChart pillars={PILLARS} values={result.wellArchitected} />
            <div style={{ marginTop: '16px' }}>
              {PILLARS.map(p => (
                <ScoreBar
                  key={p.key}
                  label={p.label}
                  value={result.wellArchitected[p.key] ?? 0}
                  max={p.max}
                  color={p.color}
                />
              ))}
            </div>
          </div>

          <div style={S.divider} />

          {/* Traffic stats */}
          <div>
            <div style={S.sectionLabel}>Traffic Results</div>
            <div style={S.statRow}>
              <StatCard icon="✅" value={result.packetsOk}     label="Requests OK" />
              <StatCard icon="❌" value={result.packetsFailed} label="Failed"       />
              <StatCard icon="⚠️" value={result.threats}       label="Threats"     />
            </div>
          </div>

          {placed.length > 0 && <>
            <div style={S.divider} />

            {/* Monthly cost estimate */}
            <div>
              <div style={S.sectionLabel}>Estimated Monthly Cost</div>
              <div style={S.costTotalRow}>
                <span style={S.costTotal}>~${estimatedMonthly}</span>
                <span style={S.costTotalUnit}>/mo</span>
                <span style={S.costTotalNote}>real AWS equivalent</span>
              </div>
              <div style={S.costTable}>
                {uniqueIds.map(id => {
                  const svc = SERVICES.find(s => s.id === id)
                  const count = serviceCount[id]
                  return (
                    <div key={id} style={S.costRow}>
                      <span style={S.costName}>
                        {svc?.aws ?? id}{count > 1 ? ` ×${count}` : ''}
                      </span>
                      <span style={S.costVal}>{REAL_COSTS[id] ?? '—'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>}
        </div>

        {/* Right column — next steps */}
        <div style={S.right}>
          <div style={S.sectionLabel}>Mission Status</div>

          {completedMissions.map(id => {
            const m = MISSIONS.find(m => m.id === id)
            return m ? (
              <div key={id} style={S.missionRow}>
                <span style={{ color: '#5a9040' }}>✓</span>
                <span style={{ color: '#6a8860' }}>{m.name}</span>
              </div>
            ) : null
          })}

          {/* Active / upcoming missions */}
          {MISSIONS.filter(m => !completedMissions.includes(m.id)).map((m, i) => (
            <div key={m.id} style={{ ...S.missionRow, opacity: i === 0 ? 1 : 0.45 }}>
              <span style={{ color: '#3a5030' }}>{i === 0 ? '▶' : '○'}</span>
              <span style={{ color: i === 0 ? '#c8d8a0' : '#3a5030' }}>{m.name}</span>
            </div>
          ))}

          <div style={{ ...S.divider, margin: '20px 0' }} />

          {/* Post-mortem failure analysis */}
          <div>
            <div style={S.sectionLabel}>Failure Analysis</div>
            {failureList.length === 0 ? (
              <div style={S.successBox}>
                <div style={S.successTitle}>✨ No Failures Detected</div>
                <p style={S.successText}>
                  Your architecture handled all traffic and deflected all threats. {result.packetsOk > 0 ? `${result.packetsOk} packets delivered successfully.` : ''}
                </p>
              </div>
            ) : (
              <div style={S.failureList}>
                {failureList.map((entry, i) => (
                  <div key={i} style={S.failureCard}>
                    <div style={S.failureHeader}>
                      <span style={S.failureIcon}>{entry.icon}</span>
                      <div>
                        <div style={S.failureHeadline}>{entry.headline}</div>
                        <span style={{ ...S.failureCat, color: entry.category === 'Security' ? '#e06050' : entry.category === 'Cost Optimization' ? '#e0c040' : '#a060e0' }}>
                          {entry.category}
                        </span>
                      </div>
                    </div>
                    <p style={S.failureContext}>{entry.context}</p>
                    <div style={S.failureFix}>🔧 {entry.realFix}</div>
                    <div style={S.failureCert}>📖 {entry.cert}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SAA-C03 exam domain coverage — architect mode only */}
          {mode === 'architect' && (() => {
            const currentMissionObj = MISSIONS[activeMission - 1] ?? MISSIONS[0]
            const certInfo = MISSION_CERT[currentMissionObj?.id]
            return certInfo ? (
              <div style={S.certBox}>
                <div style={S.certLabel}>📖 SAA-C03 Coverage</div>
                <div style={S.certDomain}>{certInfo.domain}</div>
                <p style={S.certTopic}>{certInfo.topic}</p>
                <div style={S.certScore}>
                  Well-Architected score: <strong style={{ color: gradeColor }}>{totalScore}/100 ({grade})</strong>
                </div>
              </div>
            ) : null
          })()}

          {/* CTA buttons */}
          <div style={S.ctaGroup}>
            {!allDone ? (
              <button
                style={S.btnPrimary}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #3a6030 0%, #2a4820 100%)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)' }}
                onClick={continueFromDebrief}
              >
                🏰 Reinforce the Kingdom
              </button>
            ) : (
              <button
                style={S.btnPrimary}
                onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #3a6030 0%, #2a4820 100%)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)' }}
                onClick={continueFromDebrief}
              >
                🎉 Free Build Mode
              </button>
            )}
            <button
              style={S.btnSecondary}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(80,120,60,0.7)'; e.currentTarget.style.color = '#8ab870' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(80,100,60,0.4)'; e.currentTarget.style.color = '#6a9060' }}
              onClick={startGame}
            >
              ↩ Start Over
            </button>
            <button
              style={S.btnExport}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(80,100,160,0.5)'; e.currentTarget.style.color = '#8090c0' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(60,80,120,0.3)'; e.currentTarget.style.color = '#5060a0' }}
              onClick={() => setShowExport(true)}
            >
              📤 Export Architecture
            </button>
          </div>
        </div>
      </div>
    </div>
    {showExport && (
      <ExportModal
        placed={placed}
        totalScore={totalScore}
        grade={grade}
        onClose={() => setShowExport(false)}
      />
    )}
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  root: {
    width: '100%', height: '100%',
    background: '#060810',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Cinzel', serif",
    overflow: 'hidden',
  },
  header: {
    background: 'rgba(10,14,22,0.95)',
    borderBottom: '1px solid rgba(96,120,64,0.25)',
    padding: '20px 40px',
    display: 'flex', alignItems: 'baseline', gap: '16px',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '22px', fontWeight: 700, color: '#c8d8a0', letterSpacing: '0.08em',
  },
  headerSub: {
    fontSize: '11px', color: '#4a6a40', letterSpacing: '0.25em', textTransform: 'uppercase',
  },
  body: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0',
    overflow: 'hidden',
    minHeight: 0,
  },
  left: {
    borderRight: '1px solid rgba(96,120,64,0.12)',
    padding: '32px 40px',
    overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '20px',
  },
  right: {
    padding: '32px 40px',
    overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  gradeBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
    padding: '24px 0',
  },
  grade: {
    fontSize: '80px', fontWeight: 700, lineHeight: 1,
    textShadow: '0 0 30px currentColor',
  },
  gradeLabel: {
    fontSize: '13px', color: '#c8d8a0', letterSpacing: '0.15em',
  },
  totalScore: {
    fontSize: '12px', color: '#4a6a40', letterSpacing: '0.1em', marginTop: '4px',
  },
  divider: {
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(96,120,64,0.3), transparent)',
  },
  sectionLabel: {
    fontSize: '10px', color: '#3a5a30', letterSpacing: '0.25em',
    textTransform: 'uppercase', marginBottom: '12px',
  },
  statRow: {
    display: 'flex', gap: '10px', flexWrap: 'wrap',
  },
  missionRow: {
    display: 'flex', gap: '10px', alignItems: 'center',
    padding: '7px 0',
    borderBottom: '1px solid rgba(96,120,64,0.08)',
    fontSize: '12px', letterSpacing: '0.05em',
  },
  costTotalRow: {
    display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px',
  },
  costTotal: {
    fontFamily: "'Cinzel', serif", fontSize: '28px', fontWeight: 700,
    color: '#e0c060', lineHeight: 1,
  },
  costTotalUnit: {
    fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#a08040',
  },
  costTotalNote: {
    fontSize: '10px', color: '#3a5030', letterSpacing: '0.15em',
    textTransform: 'uppercase', marginLeft: '4px',
  },
  costTable: {
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
  costRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    padding: '4px 0',
    borderBottom: '1px solid rgba(96,120,64,0.08)',
    gap: '8px',
  },
  costName: {
    fontSize: '11px', color: '#7a9870', fontFamily: 'sans-serif',
    whiteSpace: 'nowrap',
  },
  costVal: {
    fontSize: '10px', color: '#5a7850', fontFamily: 'sans-serif',
    textAlign: 'right', flexShrink: 0,
  },
  // Post-mortem styles
  successBox: {
    background: 'rgba(60,120,60,0.08)',
    border: '1px solid rgba(60,160,80,0.25)',
    borderRadius: '4px', padding: '16px 20px',
  },
  successTitle: {
    fontSize: '13px', color: '#60e090', fontFamily: "'Cinzel', serif",
    letterSpacing: '0.08em', marginBottom: '6px',
  },
  successText: {
    fontSize: '12px', color: '#4a8060', fontFamily: 'sans-serif', lineHeight: 1.6, margin: 0,
  },
  failureList: {
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  failureCard: {
    background: 'rgba(180,40,40,0.05)',
    border: '1px solid rgba(160,60,50,0.25)',
    borderRadius: '4px', padding: '14px 16px',
  },
  failureHeader: {
    display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px',
  },
  failureIcon: {
    fontSize: '20px', lineHeight: 1, flexShrink: 0, marginTop: '1px',
  },
  failureHeadline: {
    fontSize: '12px', color: '#e09080', fontFamily: "'Cinzel', serif",
    letterSpacing: '0.06em', marginBottom: '3px',
  },
  failureCat: {
    fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase',
    fontFamily: 'sans-serif',
  },
  failureContext: {
    fontSize: '11px', color: '#7a7870', fontFamily: 'sans-serif',
    lineHeight: 1.65, margin: '0 0 8px 0',
  },
  failureFix: {
    fontSize: '11px', color: '#80c090', fontFamily: 'sans-serif',
    lineHeight: 1.5, marginBottom: '4px',
  },
  failureCert: {
    fontSize: '10px', color: '#4a6050', fontFamily: 'sans-serif',
    fontStyle: 'italic',
  },
  certBox: {
    background: 'rgba(60,80,160,0.07)',
    border: '1px solid rgba(80,100,200,0.2)',
    borderRadius: '4px', padding: '14px 16px',
  },
  certLabel: {
    fontSize: '9px', color: '#4a5080', letterSpacing: '0.2em',
    textTransform: 'uppercase', marginBottom: '6px',
  },
  certDomain: {
    fontSize: '12px', color: '#8898e0', fontFamily: "'Cinzel', serif",
    letterSpacing: '0.06em', marginBottom: '4px',
  },
  certTopic: {
    fontSize: '11px', color: '#5060a0', fontFamily: 'sans-serif',
    lineHeight: 1.5, margin: '0 0 8px 0',
  },
  certScore: {
    fontSize: '11px', color: '#4a5070', fontFamily: 'sans-serif',
  },
  ctaGroup: {
    display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px',
  },
  btnPrimary: {
    padding: '13px 0',
    background: 'linear-gradient(180deg, #2a4a20 0%, #1a3414 100%)',
    border: '1px solid rgba(96,160,64,0.5)',
    borderRadius: '3px',
    color: '#a8d080',
    fontFamily: "'Cinzel', serif",
    fontSize: '13px',
    letterSpacing: '0.12em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    width: '100%',
  },
  btnSecondary: {
    padding: '11px 0',
    background: 'transparent',
    border: '1px solid rgba(80,100,60,0.4)',
    borderRadius: '3px',
    color: '#6a9060',
    fontFamily: "'Cinzel', serif",
    fontSize: '12px',
    letterSpacing: '0.1em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    width: '100%',
  },
  btnExport: {
    padding: '10px 0',
    background: 'transparent',
    border: '1px solid rgba(60,80,120,0.3)',
    borderRadius: '3px',
    color: '#5060a0',
    fontFamily: "'Cinzel', serif",
    fontSize: '11px',
    letterSpacing: '0.1em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    width: '100%',
  },
}
