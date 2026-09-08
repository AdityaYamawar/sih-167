'use client'

import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, GitBranch, LoaderCircle, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Result } from '@/lib/satquery-simulation'

export function ExecutionTrace({ result, stage, running, trace }: { result: Result | null; stage: number; running: boolean; trace: string[] }) {
  const [details, setDetails] = useState(false)
  const steps = trace.length ? trace : ['Validate inputs', 'Route query', 'Run specialist', 'Compose evidence']
  return <section className="trace-panel panel" aria-label="Observable execution trace">
    <div className="panel-heading"><div className="flex items-center gap-2"><GitBranch className="size-4 text-muted-foreground" /><h2>Execution trace</h2><Badge variant="outline">Observable pipeline</Badge></div><Button size="sm" variant="ghost" onClick={() => setDetails(!details)} aria-expanded={details}>Details<ChevronDown data-icon="inline-end" /></Button></div>
    <div className="trace-steps">{steps.map((step, i) => <div className="trace-item" key={step}><div className={cn('trace-icon', (result || stage > i) && 'step-complete', running && stage === i && 'step-active')}>{running && stage === i ? <LoaderCircle className="size-4 animate-spin" /> : result || stage > i ? <Check className="size-4" /> : <span>{i + 1}</span>}</div><div><span className="trace-step-label">{step}</span><span className="mono">{running && stage === i ? 'PROCESSING' : result || stage > i ? 'COMPLETED' : 'WAITING'}</span></div>{i < 3 && <ChevronRight className="trace-arrow size-4" />}</div>)}</div>
    {details && <div className="trace-detail"><Terminal className="size-4 text-primary" /><pre>{JSON.stringify({ execution: 'simulated', task: result?.task ?? 'pending', inputs: result?.mode ?? 'pending', params: { imageSpace: 'normalized', inference: false }, outputs: result ? { regions: result.regions.length, answer: 'predefined reference', confidence: result.confidence } : null }, null, 2)}</pre></div>}
  </section>
}
