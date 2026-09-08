'use client'

import { useEffect, useRef, useState } from 'react'
import { Crosshair, Eye, EyeOff, ImageIcon, Layers2, Maximize, Minus, Plus, RotateCcw, Scan, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Mode, Result, Scene } from '@/lib/satquery-simulation'

export type LocalImage = { url: string; name: string }
type Props = { scene: Scene; mode: Mode; result: Result | null; running: boolean; uploads: (LocalImage | null)[]; onRemove: () => void }

// Animated detection box — renders after a short delay with sweep animation
function DetectionBox({ region, index, confidence }: { region: Result['regions'][number]; index: number; confidence: number | null }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 180 + 80)
    return () => clearTimeout(t)
  }, [index])

  const kindClass =
    region.kind === 'water' ? 'region-water' :
    region.kind === 'built' ? 'region-built' :
    region.kind === 'change' ? 'region-change' :
    region.kind === 'vegetation' ? 'region-vegetation' :
    region.kind === 'road' ? 'region-road' :
    'region-custom'

  return (
    <div
      className={cn('region-box', kindClass, visible ? 'region-box-visible' : 'region-box-hidden')}
      style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.w}%`, height: `${region.h}%` }}
    >
      <span className="region-label">
        {region.label}
        <span>{confidence !== null ? (confidence / 100).toFixed(2) : 'REF'}</span>
      </span>
      {/* Corner markers */}
      <i /><i /><i /><i />
    </div>
  )
}

export function Viewer({ scene, mode, result, running, uploads, onRemove }: Props) {
  const [zoom, setZoom] = useState(1)
  const [overlay, setOverlay] = useState(true)
  const [split, setSplit] = useState(50)
  const [expanded, setExpanded] = useState(false)
  const [sensor, setSensor] = useState<'optical' | 'sar'>('optical')
  const uploaded = !!uploads[0]
  const source = uploads[0]?.url || scene.image
  const paired = mode === 'temporal'
  const sar = mode === 'fusion' && sensor === 'sar'

  // Show regions for both uploaded and preset images when overlay is on
  const showRegions = overlay && result && result.regions.length > 0

  return (
    <section className={cn('viewer-panel panel', expanded && 'viewer-expanded')} aria-label="Satellite image viewer">
      <div className="panel-heading">
        <div className="flex items-center gap-2"><ImageIcon className="size-4 text-muted-foreground" /><h2>Image workspace</h2><Badge variant="outline">{mode === 'single' ? '01' : '02'} input{mode !== 'single' && 's'}</Badge></div>
        <Button variant="ghost" size="icon-sm" aria-label={expanded ? 'Close expanded viewer' : 'Expand viewer'} onClick={() => setExpanded(!expanded)}>{expanded ? <X /> : <Maximize />}</Button>
      </div>
      <div className="scene-info"><div className="flex items-center gap-2"><span className="signal-dot" /><span>{uploaded ? uploads[0]?.name : scene.name}</span></div><span className="mono">{uploaded ? 'LOCAL PREVIEW' : 'DEMO SCENE 0' + (['river', 'urban', 'floodplain'].indexOf(scene.id) + 1)}</span></div>
      <div className="image-viewport">
        <div className="image-plane" style={{ transform: `scale(${zoom})` }}>
          <img className={cn('satellite-image', sar && !uploads[1] && 'sar-image')} src={sar && uploads[1] ? uploads[1].url : source} alt={uploaded ? 'Local uploaded image preview; not analyzed' : `Illustrative satellite-style view: ${scene.name}`} />
          {paired && <div className="after-layer" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
            {uploads[1] ? <img className="satellite-image" src={uploads[1].url} alt="Second uploaded image preview" /> : !uploaded && <div className="synthetic-development">{Array.from({ length: 30 }, (_, i) => <span key={i} />)}</div>}
          </div>}
          {/* Detection overlay — works for both preset scenes AND uploaded images */}
          {showRegions && result.regions.map((region, i) => (
            <DetectionBox key={i} region={region} index={i} confidence={result.confidence} />
          ))}
          {running && <div className="scan-line" />}
          {/* Detection sweep animation when running with an uploaded image */}
          {running && uploaded && <div className="detection-sweep" />}
        </div>
        <div className="viewer-top-labels"><span><span className="signal-dot" /> {sar ? 'SIMULATED SAR' : 'TRUE COLOR · RGB'}</span><span>ILLUSTRATIVE</span></div>
        <div className="north-marker" aria-hidden="true"><span>N</span><div>↑</div></div>
        {paired && <><div className="compare-line" style={{ left: `${split}%` }}><span><Layers2 className="size-4" /></span></div><div className="comparison-labels"><span>BEFORE</span><span>AFTER {uploaded ? '' : '· SYNTHETIC'}</span></div></>}
        <div className="viewer-toolbox"><Button variant="ghost" size="icon-sm" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + .25))}><Plus /></Button><span className="mono">{Math.round(zoom * 100)}%</span><Button variant="ghost" size="icon-sm" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .25))}><Minus /></Button><span className="tool-divider" /><Button variant="ghost" size="icon-sm" aria-label="Reset viewer" onClick={() => { setZoom(1); setSplit(50) }}><RotateCcw /></Button></div>
        <div className="image-coordinate mono"><Crosshair className="size-3" /> IMAGE SPACE <span>1024 × 1024 DEMO</span></div>
      </div>
      {paired && <div className="compare-control"><label htmlFor="comparison">Before</label><input id="comparison" type="range" min="0" max="100" value={split} onChange={e => setSplit(Number(e.target.value))} aria-label="Before and after comparison" /><span>After</span></div>}
      <div className="viewer-footer"><div className="flex items-center gap-3"><Button size="sm" variant="ghost" aria-pressed={overlay} onClick={() => setOverlay(!overlay)}>{overlay ? <Eye data-icon="inline-start" /> : <EyeOff data-icon="inline-start" />} Overlays {overlay ? 'on' : 'off'}</Button>{mode === 'fusion' && <Button variant="outline" size="sm" onClick={() => setSensor(sensor === 'optical' ? 'sar' : 'optical')}><Scan data-icon="inline-start" />{sensor === 'optical' ? 'View SAR' : 'View optical'}</Button>}{uploaded && <Button size="sm" variant="ghost" onClick={onRemove}>Remove upload</Button>}</div>
      <span className="legend"><i />{result?.task === 'change' ? 'Change region' : result?.regions?.length ? 'Detected region' : 'Reference region'}</span></div>
    </section>
  )
}
