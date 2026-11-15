import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** A QR code drawn locally as SVG (no internet needed, unlike the QR picture service). */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    }
    return { size: n, path: d }
  }, [value])
  const quiet = 2
  return (
    <svg
      className="qr-code"
      viewBox={`${-quiet} ${-quiet} ${size + 2 * quiet} ${size + 2 * quiet}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x={-quiet} y={-quiet} width={size + 2 * quiet} height={size + 2 * quiet} className="qr-bg" />
      <path d={path} className="qr-fg" />
    </svg>
  )
}
