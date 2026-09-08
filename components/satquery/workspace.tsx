'use client'

import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowUpRight, BookOpen, ChevronDown, ChevronRight, CircleHelp, Clock3, Earth, FlaskConical, FolderOpen, GitBranch, ImageIcon, Layers2, LayoutDashboard, Plus, Radar, Satellite, ScanLine, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { createResult, modes, routeQuery, scenes, suggestions, type Mode, type Result, type Region } from '@/lib/satquery-simulation'
import { Viewer, type LocalImage } from './viewer'
import { QueryPanel } from './query-panel'
import { ExecutionTrace } from './execution-trace'
import { WorkspaceDialogs, type DialogView } from './workspace-dialogs'
import { AISettingsPanel, loadAISettings, type AISettings } from './ai-settings'

const INITIAL_QUERY = suggestions[0].query

// Convert a local image URL to base64
async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const [header, base64] = dataUrl.split(',')
      const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/png'
      resolve({ base64, mimeType })
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function Workspace() {
  const [mounted, setMounted] = useState(false)
  const [sceneId, setSceneId] = useState('river')
  const [mode, setMode] = useState<Mode>('single')
  const [query, setQuery] = useState(INITIAL_QUERY)
  const [result, setResult] = useState<Result | null>(() => ({
    ...createResult(scenes[0], 'single', INITIAL_QUERY, 'grounding'),
    id: 'example-run',
    createdAt: '2026-09-08T00:00:00Z',
    confidence: 91.4,
  }))
  const [history, setHistory] = useState<Result[]>([])
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(-1)
  const [trace, setTrace] = useState<string[]>(() => createResult(scenes[0], 'single', INITIAL_QUERY, 'grounding').trace)
  const [error, setError] = useState('')
  const [view, setView] = useState<DialogView>(null)
  const [uploads, setUploads] = useState<(LocalImage | null)[]>([null, null])
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [inlineImage, setInlineImage] = useState<LocalImage | null>(null)
  const [inlineUploadError, setInlineUploadError] = useState('')
  // AI settings
  const [aiSettings, setAISettings] = useState<AISettings>({ provider: 'simulation', apiKey: '' })
  const [aiError, setAiError] = useState('')

  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const urls = useRef(new Set<string>())
  const uploadVersion = useRef(0)
  const busy = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const scene = scenes.find(s => s.id === sceneId)!

  // Load AI settings from localStorage on mount
  useEffect(() => {
    setMounted(true)
    setAISettings(loadAISettings())
  }, [])

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
    urls.current.forEach(url => URL.revokeObjectURL(url))
    uploadVersion.current++
    abortRef.current?.abort()
  }, [])

  function cancel() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    busy.current = false
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
    setStage(-1)
  }
  function resetResult() { cancel(); setResult(null); setError(''); setAiError(''); setTrace([]) }
  function clearUploads() { uploadVersion.current++; setUploading(false); urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current.clear(); setUploads([null, null]) }
  function clearInlineImage() { if (inlineImage) { URL.revokeObjectURL(inlineImage.url); urls.current.delete(inlineImage.url) } setInlineImage(null); setInlineUploadError('') }
  function changeScene(id: string) { resetResult(); clearUploads(); clearInlineImage(); setSceneId(id) }
  function changeMode(next: Mode) { if (next === mode) return; resetResult(); setMode(next); clearUploads() }
  function suggest(q: string, next: Mode) { resetResult(); if (mode !== next) clearUploads(); setMode(next); setQuery(q) }

  // ── AI-powered run ─────────────────────────────────────────────────────────
  async function runWithAI(imageUrl: string) {
    const isLive = aiSettings.provider !== 'simulation' && !!aiSettings.apiKey
    if (!isLive) return false // fallback to simulation

    abortRef.current = new AbortController()
    setRunning(true)
    setStage(0)
    const liveTrace = ['Validate inputs', 'Encode image', `Send to ${aiSettings.provider === 'claude' ? 'Claude' : aiSettings.provider === 'gemini' ? 'Gemini' : 'GPT-4o'}`, 'Parse bounding boxes', 'Render regions']
    setTrace(liveTrace)

    try {
      setStage(1)
      const { base64, mimeType } = await urlToBase64(imageUrl)

      setStage(2)
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          prompt: query,
          provider: aiSettings.provider,
          apiKey: aiSettings.apiKey,
        }),
        signal: abortRef.current.signal,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `API error ${res.status}`)

      setStage(3)
      const aiResult: Result = {
        id: `ai-run-${Date.now()}`,
        sceneId: scene.id,
        mode,
        query,
        task: 'grounding',
        answer: data.answer,
        evidence: [
          `${aiSettings.provider === 'claude' ? 'Claude 3.5 Sonnet' : aiSettings.provider === 'gemini' ? 'Gemini 1.5 Flash' : 'GPT-4o'} vision analysis`,
          `${data.regions.length} region${data.regions.length !== 1 ? 's' : ''} detected`,
          'Real model inference — not simulation',
        ],
        regions: data.regions as Region[],
        confidence: data.confidence,
        uploaded: true,
        createdAt: new Date().toISOString(),
        trace: liveTrace,
      }

      setStage(4)
      await new Promise(r => setTimeout(r, 300)) // brief pause for UX
      setResult(aiResult)
      setStage(5)
      setHistory(h => [aiResult, ...h].slice(0, 12))
      return true
    } catch (e) {
      if ((e as Error).name === 'AbortError') return true
      const msg = e instanceof Error ? e.message : 'AI analysis failed.'
      setAiError(msg)
      return false
    } finally {
      busy.current = false
      setRunning(false)
    }
  }

  // ── Main run ───────────────────────────────────────────────────────────────
  async function run() {
    if (busy.current || uploading) return
    setAiError('')

    const effectiveUploads: (LocalImage | null)[] = inlineImage ? [inlineImage, null] : uploads
    const isLive = aiSettings.provider !== 'simulation' && !!aiSettings.apiKey

    // If AI mode + image present → use real AI
    if (isLive && effectiveUploads[0]) {
      busy.current = true
      const ok = await runWithAI(effectiveUploads[0].url)
      if (!ok) busy.current = false
      return
    }

    // Simulation path
    let prepared: Result
    try {
      const task = routeQuery(query, mode)
      if (effectiveUploads[0] && mode !== 'single' && !effectiveUploads[1]) throw new Error('Upload both images for this paired-input mode, or remove the upload to use the sample pair.')
      if (!effectiveUploads[0] && effectiveUploads[1]) throw new Error('Upload the first image as well to complete the pair.')
      prepared = createResult(scene, mode, query, task, !!effectiveUploads[0])
    } catch (e) { setError(e instanceof Error ? e.message : 'Please check your inputs.'); return }

    busy.current = true; setError(''); setResult(null); setRunning(true); setStage(0); setTrace(prepared.trace)
    let step = 0
    timer.current = setInterval(() => {
      step++
      if (step >= prepared.trace.length) {
        cancel(); setStage(prepared.trace.length); setResult(prepared)
        if (!prepared.uploaded) setHistory(h => [prepared, ...h].slice(0, 12))
      } else setStage(step)
    }, 650)
  }

  async function upload(file: File, slot: number) {
    setUploadError('')
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setUploadError('Choose a PNG or JPEG image. TIFF/GeoTIFF needs the future geospatial backend.'); return }
    if (file.size > 10 * 1024 * 1024) { setUploadError('Image exceeds 10 MB. Choose a smaller preview.'); return }
    const version = ++uploadVersion.current
    setUploading(true)
    const url = URL.createObjectURL(file)
    try {
      const image = new Image(); image.src = url; await image.decode()
      if (image.width * image.height > 40_000_000) throw new Error('Image is too large. Use a preview under 40 megapixels.')
      if (version !== uploadVersion.current) { URL.revokeObjectURL(url); return }
      resetResult()
      const previous = uploads[slot]?.url
      if (previous) { URL.revokeObjectURL(previous); urls.current.delete(previous) }
      urls.current.add(url)
      setUploads(current => current.map((u, i) => i === slot ? { url, name: file.name } : u))
    } catch (e) { URL.revokeObjectURL(url); if (version === uploadVersion.current) setUploadError(e instanceof Error && e.message.includes('megapixels') ? e.message : 'This image could not be decoded. Try a different PNG or JPEG.') }
    finally { if (version === uploadVersion.current) setUploading(false) }
  }

  async function handleInlineImage(file: File) {
    setInlineUploadError('')
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setInlineUploadError('Attach a PNG or JPEG image.'); return }
    if (file.size > 10 * 1024 * 1024) { setInlineUploadError('Image exceeds 10 MB. Choose a smaller file.'); return }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image(); image.src = url; await image.decode()
      if (image.width * image.height > 40_000_000) throw new Error('Image too large.')
      clearInlineImage()
      resetResult()
      urls.current.add(url)
      setInlineImage({ url, name: file.name })
    } catch {
      URL.revokeObjectURL(url)
      setInlineUploadError('Could not load this image. Try a smaller PNG or JPEG.')
    }
  }

  function restore(r: Result) { resetResult(); clearUploads(); clearInlineImage(); setSceneId(r.sceneId); setMode(r.mode); setQuery(r.query); setResult(r); setTrace(r.trace); setStage(r.trace.length) }
  function newAnalysis() { resetResult(); clearUploads(); clearInlineImage(); setQuery(''); setMode('single'); setView(null) }

  const viewerUploads: (LocalImage | null)[] = inlineImage ? [inlineImage, null] : uploads
  const isLive = aiSettings.provider !== 'simulation' && !!aiSettings.apiKey
  const providerLabel = aiSettings.provider === 'claude' ? 'Claude' : aiSettings.provider === 'gemini' ? 'Gemini' : aiSettings.provider === 'openai' ? 'GPT-4o' : null

  if (!mounted) return <div className="app-shell" style={{ minHeight: '100vh' }} />
  return <div className="app-shell">
    <aside className="sidebar">
      <a href="/" className="brand" aria-label="SatQuery AI home"><div className="brand-symbol"><Satellite /></div><span>SatQuery<span className="brand-ai">AI</span></span></a>
      <div className="workspace-switch"><div className="workspace-avatar"><Earth className="size-4" /></div><div><strong>Mission control</strong><span>Remote sensing workspace</span></div><ChevronDown className="size-3" /></div>
      <div className="sidebar-section-label">WORKSPACE</div>
      <nav aria-label="Main navigation"><button className={cn('nav-item', !view && 'active')} onClick={() => setView(null)}><LayoutDashboard />Overview<span className="nav-shortcut">⌘ 1</span></button><button className="nav-item" onClick={() => setView('scenes')}><FolderOpen />Scene library<span className="nav-count">3</span></button><button className="nav-item" onClick={() => setView('history')}><Clock3 />Analysis history{history.length > 0 && <span className="nav-count">{history.length}</span>}</button><button className="nav-item" onClick={() => setView('about')}><GitBranch />Architecture<ArrowUpRight className="nav-end" /></button></nav>
      <div className="sidebar-section-label scenes-label">SAMPLE SCENES</div><nav aria-label="Sample scenes" className="scene-nav">{scenes.map(s => <button key={s.id} className={cn('scene-nav-item', sceneId === s.id && 'scene-selected')} onClick={() => changeScene(s.id)}><span className={cn('scene-dot', 'scene-dot-' + s.id)} />{s.id === 'river' ? 'River & agriculture' : s.id === 'urban' ? 'Urban expansion' : 'Floodplain monitoring'}{sceneId === s.id && <span className="active-scene-dot" />}</button>)}</nav>
      <button className="new-scene" onClick={() => setView('upload')}><Plus className="size-3" />Add your imagery</button>
      <div className="sidebar-bottom"><div className="project-note"><div className="flex items-center gap-2"><Radar className="size-4 text-primary" /><strong>See beyond the pixels.</strong></div><p>One workspace. Multiple sensors.<br />A clearer view of our planet.</p><button onClick={() => setView('about')}>Explore the project<ArrowUpRight className="size-3" /></button></div><button className="nav-item" onClick={() => setView('about')}><CircleHelp />Guide & documentation</button><div className="project-identity"><div className="sih-avatar">S</div><div><strong>Smart India Hackathon</strong><span>SIH26167 · Space technology</span></div></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumbs"><span>Workspace</span><ChevronRight className="size-3" /><strong>Overview</strong></div>
        <div className="topbar-right">
          <span className="system-status"><span className="signal-dot" />Demo environment ready</span>
          {isLive
            ? <Badge variant="outline" className="ai-live-badge"><span className="ai-live-dot" />{providerLabel} · Live AI</Badge>
            : <Badge variant="outline"><FlaskConical data-icon="inline-start" />Simulation mode</Badge>}
          {/* AI Provider Settings trigger + panel */}
          <AISettingsPanel settings={aiSettings} onChange={s => { setAISettings(s); resetResult() }} />
          <Button variant="ghost" size="icon-sm" aria-label="Open guide" onClick={() => setView('about')}><BookOpen /></Button>
          <div className="user-avatar" aria-label="Demo workspace">SQ</div>
        </div>
      </header>
      <main>
        <div className="page-heading"><div><div className="page-eyebrow"><span className="signal-dot" />EARTH OBSERVATION, REIMAGINED</div><h1>Your imagery. <span>A new perspective.</span></h1><p>{isLive ? `Connected to ${providerLabel}. Upload an image, describe what to find, and the AI will locate it with real bounding boxes.` : 'Upload an image, describe what to find, and watch the AI locate it with bounding boxes.'}</p></div><Button variant="outline" onClick={newAnalysis}><Plus data-icon="inline-start" />New analysis</Button></div>
        <section className="analysis-toolbar" aria-label="Analysis input configuration"><ToggleGroup value={[mode]} onValueChange={value => { if (value[0]) changeMode(value[0] as Mode) }} spacing={1} aria-label="Input mode">{modes.map((m, i) => <ToggleGroupItem key={m.id} value={m.id}>{i === 0 ? <ImageIcon data-icon="inline-start" /> : i === 1 ? <Layers2 data-icon="inline-start" /> : <ScanLine data-icon="inline-start" />}{m.label}</ToggleGroupItem>)}</ToggleGroup><div className="toolbar-buttons"><Button variant="ghost" size="sm" onClick={() => setView('scenes')}><FolderOpen data-icon="inline-start" />Sample scenes<ChevronDown data-icon="inline-end" /></Button><span className="toolbar-divider" /><Button variant="outline" size="sm" onClick={() => { setUploadError(''); setView('upload') }}><Upload data-icon="inline-start" />Upload imagery</Button></div></section>
        <div className="analysis-grid"><div className="visual-column"><Viewer key={`${sceneId}-${mode}-${viewerUploads[0]?.url ?? ''}`} scene={scene} mode={mode} result={result} running={running} uploads={viewerUploads} onRemove={() => { resetResult(); clearUploads(); clearInlineImage() }} /><ExecutionTrace result={result} stage={stage} running={running} trace={trace} /></div>
          <QueryPanel
            query={query}
            onQuery={q => { setQuery(q); setError(''); setAiError(''); if (result) { setResult(null); setTrace([]); setStage(-1) } }}
            onSuggest={suggest}
            onRun={run}
            onCancel={cancel}
            running={running}
            error={error || aiError}
            result={result}
            onExport={() => setView('export')}
            inlineImage={inlineImage}
            onInlineImage={handleInlineImage}
            onRemoveInlineImage={() => { clearInlineImage(); resetResult() }}
            uploadError={inlineUploadError}
            isLive={isLive}
            providerLabel={providerLabel}
          />
        </div>
        <div className="capabilities"><div><Activity className="size-4 text-primary" /><span>One query. The right specialist.</span></div><span>Visual Q&A</span><span>Scene captioning</span><span>Visual grounding</span><button onClick={() => suggest(suggestions[3].query, 'temporal')}>Change detection<ArrowUpRight className="size-3" /></button><button onClick={() => suggest(suggestions[4].query, 'fusion')}>Multimodal fusion<ArrowUpRight className="size-3" /></button></div>
        <footer className="page-footer"><span><FlaskConical className="size-3" />{isLive ? `Live AI analysis via ${providerLabel}. Real model inference.` : 'Illustrative imagery & simulated results. No live model inference.'}</span><span>SIH26167<span className="footer-dot">/</span>Built for exploration</span></footer>
      </main>
    </div>
    <WorkspaceDialogs view={view} setView={setView} sceneId={sceneId} onScene={changeScene} result={result} history={history} onRestore={restore} mode={mode} uploads={uploads} onUpload={upload} uploadError={uploadError} uploading={uploading} />
  </div>
}
