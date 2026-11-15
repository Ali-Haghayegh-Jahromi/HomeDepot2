import { useEffect, useMemo, useRef, useState } from 'react'
import type { StoreLayout, TourStatus } from './types'
import { usePrefersReducedMotion } from './hooks'

// The live store map: racks, aisles and departments, the kiosk with the robot's dock beside it,
// the robot (with heading and trail), the 5 m ring around the stop, the target shelf and its light.
// Everything is drawn in metres; the SVG viewBox does the scaling.

interface Props {
  layout: StoreLayout
  status: TourStatus | null
  /** Phone-sized: no small labels, a bigger robot, aisle numbers only. */
  compact?: boolean
  /** Accessible description of what the map shows right now. */
  label: string
}

interface Point {
  x: number
  y: number
}

const SMOOTHING_S = 0.22 // time constant of the robot's eased motion between status updates
const TRAIL_STEP_M = 0.3
const TRAIL_MAX = 700

const FRONT_LABELS: Record<string, string> = {
  'returns / service desk': 'Service desk',
  'pro desk': 'Pro desk',
}

const shortestTurn = (from: number, to: number) => {
  let d = to - from
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

export function StoreMap({ layout, status, compact = false, label }: Props) {
  const L = layout
  const Y = (y: number) => L.depth - y
  const reduceMotion = usePrefersReducedMotion()
  const robotRef = useRef<SVGGElement>(null)
  const shown = useRef<{ x: number; y: number; yaw: number } | null>(null)
  const target = useRef<{ x: number; y: number; yaw: number } | null>(null)
  const [trail, setTrail] = useState<Point[]>([])

  const pose = status?.pose ?? null
  const item = status?.current_item ?? null
  const lightOn = !!item && (status?.lights_on ?? []).includes(item.tag_code)
  const robotState = status?.state ?? 'idle'

  // New pose from the service: becomes the target the robot glides to.
  useEffect(() => {
    if (!pose) return
    target.current = { ...pose }
    if (!shown.current || reduceMotion) shown.current = { ...pose }
    setTrail((t) => {
      const last = t[t.length - 1]
      if (last && Math.hypot(last.x - pose.x, last.y - pose.y) < TRAIL_STEP_M) return t
      const next = [...t, { x: pose.x, y: pose.y }]
      return next.length > TRAIL_MAX ? next.slice(next.length - TRAIL_MAX) : next
    })
  }, [pose?.x, pose?.y, pose?.yaw, reduceMotion])

  // The trail fades away a few seconds after the robot is back on its dock.
  const atRest = robotState === 'done' || (robotState === 'idle' && !item)
  useEffect(() => {
    if (!atRest) return
    const t = window.setTimeout(() => setTrail([]), 4000)
    return () => window.clearTimeout(t)
  }, [atRest])

  // Eased motion between status updates (about 2.5 per second), without re-rendering React.
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const s = shown.current
      const t = target.current
      if (s && t) {
        const k = reduceMotion ? 1 : 1 - Math.exp(-dt / SMOOTHING_S)
        s.x += (t.x - s.x) * k
        s.y += (t.y - s.y) * k
        s.yaw += shortestTurn(s.yaw, t.yaw) * k
        robotRef.current?.setAttribute(
          'transform',
          `translate(${s.x.toFixed(3)} ${(L.depth - s.y).toFixed(3)}) rotate(${((-s.yaw * 180) / Math.PI).toFixed(1)})`,
        )
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [L.depth, reduceMotion])

  const topRoom = compact ? 0.4 : 0.8
  const viewBox = `-1 ${-topRoom} ${L.width + 2} ${L.depth + topRoom + 1}`

  // The static floor plan, drawn once per layout.
  const floor = useMemo(() => {
    const registers = L.obstacles.filter((o) => o.label.startsWith('register'))
    return (
      <g>
        <rect x={0} y={0} width={L.width} height={L.depth} rx={0.6} className="map-floor" />
        {L.racks.map(([x0, y0, x1, y1], i) => (
          <rect key={i} x={x0} y={Y(y1)} width={x1 - x0} height={y1 - y0} rx={0.2} className="map-rack" />
        ))}
        {L.obstacles.map((o) => (
          <rect
            key={o.label}
            x={o.x0}
            y={Y(o.y1)}
            width={o.x1 - o.x0}
            height={o.y1 - o.y0}
            rx={0.2}
            className={o.label === 'kiosk' ? 'map-kiosk' : 'map-front'}
          />
        ))}
        <line x1={L.entrance[0]} y1={Y(0)} x2={L.entrance[1]} y2={Y(0)} className="map-door" />
        {!compact && (
          <g className="map-small">
            <text x={(L.entrance[0] + L.entrance[1]) / 2} y={Y(0) - 0.6} fontSize={1.3}>
              Entrance
            </text>
            {L.obstacles
              .filter((o) => !o.label.startsWith('register') && o.label !== 'kiosk')
              .map((o) => (
                <text key={o.label} x={(o.x0 + o.x1) / 2} y={Y(o.y0) + 1.5} fontSize={1.3}>
                  {FRONT_LABELS[o.label] ?? o.label}
                </text>
              ))}
            {registers.length > 0 && (
              <text
                x={registers.reduce((sum, o) => sum + (o.x0 + o.x1) / 2, 0) / registers.length}
                y={Y(0) - 0.6}
                fontSize={1.3}
              >
                Registers
              </text>
            )}
          </g>
        )}
      </g>
    )
  }, [L, compact])

  const rackTop = L.rack_y[3] ?? L.depth - 6
  const badgeR = compact ? 1.35 : 1.3
  const kiosk = L.obstacles.find((o) => o.label === 'kiosk')
  const targetAisle = item ? L.aisles.find((a) => a.number === item.aisle) : undefined

  return (
    <svg className="store-map" viewBox={viewBox} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {floor}

      {/* aisle numbers; the target aisle is highlighted */}
      {L.aisles.map((a) => {
        const isTarget = item?.aisle === a.number
        return (
          <g key={a.number} className={isTarget ? 'map-aisle is-target' : 'map-aisle'}>
            <circle cx={a.x} cy={Y(rackTop) - 1.2} r={badgeR} />
            <text x={a.x} y={Y(rackTop) - 1.2} fontSize={compact ? 1.5 : 1.35} dy="0.36em">
              {a.number}
            </text>
          </g>
        )
      })}

      {/* kiosk and dock */}
      <circle cx={L.dock.x} cy={Y(L.dock.y)} r={0.85} className="map-dock" />
      {!compact && kiosk && (
        <text
          x={(kiosk.x0 + L.dock.x) / 2}
          y={Y(Math.max(kiosk.y1, L.dock.y)) - 1.6}
          fontSize={1.3}
          className="map-dock-label"
        >
          Kiosk + robot dock
        </text>
      )}

      {/* 5 m ring around the stop: the light comes on when the robot crosses it */}
      {item && robotState === 'navigating' && !lightOn && (
        <circle cx={item.x} cy={Y(item.y)} r={L.near_m} className="map-near" />
      )}

      {trail.length > 1 && <polyline className="map-trail" points={trail.map((p) => `${p.x},${Y(p.y)}`).join(' ')} />}

      {/* target shelf and its shelf-tag light */}
      {item && (
        <g
          transform={`translate(${item.light_x} ${Y(item.light_y)})`}
          className={lightOn ? 'map-target is-on' : 'map-target'}
        >
          <circle r={compact ? 2.4 : 1.8} className="map-light-glow" />
          <circle r={compact ? 0.9 : 0.6} className="map-light" />
        </g>
      )}

      {/* where the robot is going, named, above the racks */}
      {item && !compact && targetAisle && (
        <g className="map-callout" transform={`translate(${targetAisle.x} ${Y(rackTop) - 3.1})`}>
          <text
            fontSize={1.3}
            textAnchor={targetAisle.x > L.width - 12 ? 'end' : targetAisle.x < 12 ? 'start' : 'middle'}
            dx={targetAisle.x > L.width - 12 ? 1.2 : targetAisle.x < 12 ? -1.2 : 0}
          >
            Aisle {targetAisle.number} · {targetAisle.name}
          </text>
        </g>
      )}

      {/* the robot */}
      {pose && (
        <g ref={robotRef} className="map-robot">
          <circle r={compact ? 1.25 : 0.85} className="map-robot-body" />
          <path
            d={compact ? 'M 2.2 0 L 0.7 -0.95 L 0.7 0.95 Z' : 'M 1.5 0 L 0.5 -0.62 L 0.5 0.62 Z'}
            className="map-robot-nose"
          />
        </g>
      )}
    </svg>
  )
}
