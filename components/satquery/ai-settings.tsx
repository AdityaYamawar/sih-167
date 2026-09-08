'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Eye, EyeOff, KeyRound, Settings2, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type AIProvider = 'claude' | 'gemini' | 'openai' | 'simulation'

export interface AISettings {
  provider: AIProvider
  apiKey: string
}

const STORAGE_KEY = 'satquery-ai-settings'

const PROVIDERS: { id: AIProvider; name: string; model: string; color: string; docsUrl: string; keyUrl: string }[] = [
  {
    id: 'simulation',
    name: 'Simulation',
    model: 'Built-in demo',
    color: '#58d5c9',
    docsUrl: '#',
    keyUrl: '#',
  },
  {
    id: 'claude',
    name: 'Claude',
    model: 'claude-3-5-sonnet',
    color: '#d4a27f',
    docsUrl: 'https://docs.anthropic.com/claude/docs/vision',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    model: 'gemini-1.5-flash',
    color: '#81c7f0',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/vision',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openai',
    name: 'GPT-4o',
    model: 'gpt-4o',
    color: '#a8e6a3',
    docsUrl: 'https://platform.openai.com/docs/guides/vision',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
]

export function loadAISettings(): AISettings {
  if (typeof window === 'undefined') return { provider: 'simulation', apiKey: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { provider: 'simulation', apiKey: '' }
}

function saveAISettings(s: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

type Props = {
  settings: AISettings
  onChange: (s: AISettings) => void
}

export function AISettingsPanel({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AISettings>(settings)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sync draft when settings prop changes (e.g. on mount)
  useEffect(() => { setDraft(settings) }, [settings])

  const selectedProvider = PROVIDERS.find(p => p.id === draft.provider) ?? PROVIDERS[0]
  const needsKey = draft.provider !== 'simulation'

  function save() {
    saveAISettings(draft)
    onChange(draft)
    setSaved(true)
    setTimeout(() => { setSaved(false); setOpen(false) }, 900)
  }

  function handleProviderChange(id: AIProvider) {
    setDraft(d => ({ ...d, provider: id, apiKey: id === 'simulation' ? '' : d.apiKey }))
  }

  const activeProvider = PROVIDERS.find(p => p.id === settings.provider) ?? PROVIDERS[0]
  const isLive = settings.provider !== 'simulation' && !!settings.apiKey

  return (
    <>
      {/* Trigger button in topbar */}
      <button
        className="ai-settings-trigger"
        aria-label="AI provider settings"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="ai-status-dot" style={{ background: activeProvider.color }} />
        <span className="ai-status-label">
          {isLive ? activeProvider.name : 'Simulation'}
        </span>
        <ChevronDown className="size-3" />
      </button>

      {/* Overlay */}
      {open && (
        <div className="settings-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      {/* Slide-in panel */}
      <div className={cn('settings-panel', open && 'settings-panel-open')} role="dialog" aria-label="AI provider settings">
        <div className="settings-panel-header">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-primary" />
            <strong>AI Provider</strong>
          </div>
          <button aria-label="Close settings" onClick={() => setOpen(false)}><X className="size-4" /></button>
        </div>

        <div className="settings-panel-body">
          <p className="settings-description">
            Connect a real AI to analyse your images and return precise bounding boxes.
            Your API key is stored only in this browser and sent directly to the AI provider.
          </p>

          {/* Provider cards */}
          <div className="provider-grid">
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                className={cn('provider-card', draft.provider === p.id && 'provider-card-selected')}
                onClick={() => handleProviderChange(p.id)}
                style={draft.provider === p.id ? { borderColor: p.color + '80', background: p.color + '10' } : {}}
              >
                <div className="provider-dot" style={{ background: p.color }} />
                <div className="provider-info">
                  <strong style={draft.provider === p.id ? { color: p.color } : {}}>{p.name}</strong>
                  <span>{p.model}</span>
                </div>
                {draft.provider === p.id && <Check className="size-3.5 provider-check" style={{ color: p.color }} />}
              </button>
            ))}
          </div>

          {/* API key input — only shown when real provider selected */}
          {needsKey && (
            <div className="api-key-section">
              <label className="settings-label" htmlFor="api-key-input">
                <KeyRound className="size-3" />
                {selectedProvider.name} API Key
                <a href={selectedProvider.keyUrl} target="_blank" rel="noreferrer" className="get-key-link">
                  Get a key <ExternalLink className="size-2.5" />
                </a>
              </label>
              <div className="api-key-input-wrap">
                <input
                  id="api-key-input"
                  type={showKey ? 'text' : 'password'}
                  className="api-key-input"
                  placeholder={`sk-ant-… / AIzaSy… / sk-proj-…`}
                  value={draft.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={e => setDraft(d => ({ ...d, apiKey: e.target.value.trim() }))}
                />
                <button
                  type="button"
                  className="api-key-toggle"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  onClick={() => setShowKey(s => !s)}
                >
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              <p className="api-key-note">
                🔒 Your key stays in <strong>browser localStorage</strong> only — never stored on any server.
              </p>
            </div>
          )}

          {/* Capability note */}
          <div className="capability-note">
            <Zap className="size-3.5 text-primary" />
            <span>
              {needsKey && draft.apiKey
                ? `${selectedProvider.name} will analyse the image and return real bounding box coordinates around whatever you describe.`
                : draft.provider === 'simulation'
                  ? 'Built-in simulation — no API key needed. Fast but uses predefined demo regions.'
                  : `Enter your ${selectedProvider.name} API key above to enable real AI-powered detection.`}
            </span>
          </div>
        </div>

        <div className="settings-panel-footer">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={needsKey && !draft.apiKey}
            onClick={save}
          >
            {saved ? <><Check className="size-3" /> Saved!</> : 'Save & Apply'}
          </Button>
        </div>
      </div>
    </>
  )
}
