'use client'

import { useRef } from 'react'
import { ArrowDownToLine, ArrowUpRight, Check, CircleHelp, CornerDownLeft, Crosshair, ImagePlus, LoaderCircle, Play, Sparkles, Square, WandSparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { suggestions, taskNames, type Mode, type Result } from '@/lib/satquery-simulation'
import type { LocalImage } from './viewer'

type Props = {
  query: string
  onQuery: (q: string) => void
  onSuggest: (query: string, mode: Mode) => void
  onRun: () => void
  onCancel: () => void
  running: boolean
  error: string
  result: Result | null
  onExport: () => void
  // Inline image upload
  inlineImage: LocalImage | null
  onInlineImage: (file: File) => void
  onRemoveInlineImage: () => void
  uploadError: string
  // AI mode
  isLive?: boolean
  providerLabel?: string | null
}

export function QueryPanel({ query, onQuery, onSuggest, onRun, onCancel, running, error, result, onExport, inlineImage, onInlineImage, onRemoveInlineImage, uploadError, isLive, providerLabel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onInlineImage(f)
    e.target.value = ''
  }

  const badge = isLive
    ? <Badge variant="secondary" className="ai-live-badge-sm"><span className="ai-live-dot" />{providerLabel} · AI</Badge>
    : <Badge variant="secondary">Simulation</Badge>

  return (
    <section className="query-panel panel" aria-label="Analysis query and results">
      <div className="panel-heading"><div className="flex items-center gap-2"><Sparkles className="size-4 text-primary" /><h2>Ask your imagery</h2></div>{badge}</div>
      <div className="query-content">
        <p className="section-description">Describe what you want to find — type a prompt, optionally attach an image, then run.</p>
        <form onSubmit={e => { e.preventDefault(); onRun() }}>

          {/* Inline image preview strip */}
          {inlineImage && (
            <div className="inline-image-preview">
              <img src={inlineImage.url} alt="Attached image preview" className="inline-thumb" />
              <div className="inline-image-info">
                <span className="mono">{inlineImage.name}</span>
                <span className="inline-image-hint">Image attached — describe what to find in it</span>
              </div>
              <button type="button" className="inline-image-remove" aria-label="Remove attached image" onClick={onRemoveInlineImage}><X className="size-3.5" /></button>
            </div>
          )}

          <Field data-invalid={!!(error || uploadError)}>
            <FieldLabel htmlFor="analysis-query" className="sr-only">Your satellite analysis query</FieldLabel>
            <Textarea
              id="analysis-query"
              placeholder={inlineImage ? `Where is the river? / Find the village / Locate the road…` : 'What would you like to explore?'}
              value={query}
              maxLength={600}
              disabled={running}
              aria-invalid={!!(error || uploadError)}
              aria-describedby={error ? 'query-error' : uploadError ? 'upload-error-inline' : undefined}
              onChange={e => onQuery(e.target.value)}
              onKeyDown={e => { if (e.nativeEvent.isComposing || e.keyCode === 229) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRun() } }}
              className="min-h-24 resize-none"
            />
            {error && <FieldError id="query-error">{error}</FieldError>}
            {uploadError && <FieldError id="upload-error-inline">{uploadError}</FieldError>}
          </Field>

          <div className="query-actions">
            {/* Attach image button */}
            <button
              type="button"
              className="attach-btn"
              aria-label="Attach an image"
              title="Attach image"
              disabled={running}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="size-4" />
              <span>{inlineImage ? 'Change image' : 'Attach image'}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              tabIndex={-1}
              onChange={handleFile}
            />

            <span className="mono attach-hint"><CornerDownLeft className="size-3" /> Enter to run</span>
            {running
              ? <Button variant="secondary" onClick={onCancel}><Square data-icon="inline-start" />Cancel</Button>
              : <Button type="submit"><Play data-icon="inline-start" />Run analysis</Button>}
          </div>
        </form>

        <div className="suggestions">
          <span className="eyebrow">TRY A QUERY</span>
          <div className="suggestion-list">
            {suggestions.slice(0, 4).map(s => (
              <button key={s.label} disabled={running} onClick={() => onSuggest(s.query, s.mode)}>
                {s.label}<ArrowUpRight className="size-3" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="result-header">
        <div className="flex items-center gap-2"><WandSparkles className="size-4 text-primary" /><h3>Analysis result</h3></div>
        {running
          ? <span className="run-status"><LoaderCircle className="size-3 animate-spin" /> Processing</span>
          : result
            ? <span className="run-status"><Check className="size-3" /> Complete</span>
            : <span className="muted-label">Ready</span>}
      </div>

      <div className="result-content" aria-live="polite" aria-busy={running}>
        {running ? (
          <div className="result-waiting">
            <div className="processing-orbit"><ScanIcon /></div>
            <p>{isLive ? `${providerLabel} is analysing your image…` : 'Localizing regions in your imagery'}</p>
            <span>{isLive ? 'Real model inference in progress — bounding boxes incoming' : 'Running the simulated specialist pipeline…'}</span>
          </div>
        ) : result ? (
          <>
            <div className="result-task">
              <Badge variant="outline"><Crosshair data-icon="inline-start" />{taskNames[result.task]}</Badge>
              <span className="mono">DEMO OUTPUT</span>
            </div>
            <p className="answer-text">{result.answer}</p>
            <div className="evidence-tags">
              {result.evidence.slice(0, 3).map(e => <span key={e}><Check className="size-3" />{e}</span>)}
            </div>
            {result.regions.length > 0 && (
              <div className="region-summary">
                <Crosshair className="size-3" />
                <span>{result.regions.length} region{result.regions.length > 1 ? 's' : ''} detected: {result.regions.map(r => r.label).join(', ')}</span>
              </div>
            )}
            {result.confidence !== null && (
              <div className="confidence">
                <div>
                  <span>Illustrative confidence <CircleHelp className="size-3" aria-label="Fixed demonstration score, not a model probability" /></span>
                  <strong>{result.confidence}%</strong>
                </div>
                <div className="confidence-track"><div style={{ width: `${result.confidence}%` }} /></div>
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={onExport}><ArrowDownToLine data-icon="inline-start" />Export analysis</Button>
          </>
        ) : (
          <div className="result-waiting">
            <Crosshair className="size-7 text-muted-foreground" />
            <p>Your next discovery starts here.</p>
            <span>Attach an image or pick a scene, type what to find, and hit Run.</span>
          </div>
        )}
      </div>
      <p className="result-disclaimer"><CircleHelp className="size-3" />Simulated results. Not for operational decisions.</p>
    </section>
  )
}

function ScanIcon() { return <Crosshair className="size-7" /> }
