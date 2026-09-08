#!/usr/bin/env node
/**
 * SatQuery AI — MCP Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposes satellite image analysis tools to Claude Desktop, Claude.ai browser
 * extension, and any MCP-compatible client.
 *
 * Tools exposed:
 *  • analyze_image      — send image URL/base64 + prompt → get bounding boxes
 *  • analyze_image_url  — fetch a public URL and analyze it
 *  • list_scenes        — list the built-in SatQuery demo scenes
 *  • describe_image     — ask an AI to describe the whole image (no boxes)
 *
 * Configuration (env vars or ~/.satquery-mcp.json):
 *  SATQUERY_PROVIDER  = claude | gemini | openai   (default: claude)
 *  SATQUERY_API_KEY   = your API key
 *  SATQUERY_BASE_URL  = http://localhost:3000       (your running SatQuery app)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'
import https from 'https'
import http from 'http'

// ── Config ─────────────────────────────────────────────────────────────────
const CONFIG_FILE = join(homedir(), '.satquery-mcp.json')

async function loadConfig() {
  const defaults = {
    provider: process.env.SATQUERY_PROVIDER || 'claude',
    apiKey: process.env.SATQUERY_API_KEY || '',
    baseUrl: process.env.SATQUERY_BASE_URL || 'http://localhost:3000',
  }
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8')
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

async function saveConfig(config) {
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))
}

// ── System prompt used for all vision calls ─────────────────────────────────
const SYSTEM_PROMPT = `You are a satellite/aerial imagery analysis AI with remote sensing expertise.

Given an image and a user prompt, identify and locate what the user describes.
Return ONLY valid JSON — no markdown fences, no explanation outside the JSON — in this exact shape:

{
  "answer": "<1-2 sentence description of what you found and where in the image>",
  "confidence": <integer 0-100>,
  "regions": [
    {
      "label": "<short label>",
      "x": <left edge % of image width 0-100>,
      "y": <top edge % of image height 0-100>,
      "w": <width % 5-90>,
      "h": <height % 5-90>,
      "kind": "<water|built|vegetation|road|change|custom>"
    }
  ]
}

Rules:
- Coordinates are percentages (0=left/top, 100=right/bottom)
- Include 1-4 tight bounding boxes
- If nothing is found, return regions:[] and explain in answer
- kind must be: water, built, vegetation, road, change, or custom
- Return raw JSON only — no markdown`

// ── Vision API callers ──────────────────────────────────────────────────────
async function callClaude(apiKey, imageBase64, mimeType, prompt) {
  const body = JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: prompt },
      ],
    }],
  })
  const res = await fetchJSON('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body,
  })
  return res.content?.[0]?.text ?? ''
}

async function callGemini(apiKey, imageBase64, mimeType, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: prompt },
      ],
    }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
  })
  const res = await fetchJSON(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  return res.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callOpenAI(apiKey, imageBase64, mimeType, prompt) {
  const body = JSON.stringify({
    model: 'gpt-4o',
    max_tokens: 1024,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  })
  const res = await fetchJSON('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body,
  })
  return res.choices?.[0]?.message?.content ?? ''
}

// ── Simple fetch for Node (no dependency) ──────────────────────────────────
function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${parsed.error?.message || data.slice(0, 200)}`))
          else resolve(parsed)
        } catch { reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

// Fetch a URL and return base64
function fetchImageAsBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(imageUrl)
    const lib = parsed.protocol === 'https:' ? https : http
    lib.get(imageUrl, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        const mimeType = res.headers['content-type'] || 'image/png'
        resolve({ base64: buf.toString('base64'), mimeType: mimeType.split(';')[0] })
      })
    }).on('error', reject)
  })
}

// ── Parse AI response ───────────────────────────────────────────────────────
function parseResponse(raw) {
  const clean = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('AI returned non-JSON response')
  const parsed = JSON.parse(clean.slice(start, end + 1))
  const allowed = ['water', 'built', 'change', 'vegetation', 'road', 'custom']
  const regions = (parsed.regions || []).map(r => ({
    label: String(r.label || 'Region').slice(0, 60),
    x: Math.max(0, Math.min(95, Number(r.x) || 10)),
    y: Math.max(0, Math.min(95, Number(r.y) || 10)),
    w: Math.max(5, Math.min(90, Number(r.w) || 20)),
    h: Math.max(5, Math.min(90, Number(r.h) || 20)),
    kind: allowed.includes(r.kind) ? r.kind : 'custom',
  }))
  return {
    answer: String(parsed.answer || '').slice(0, 800),
    confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 80))),
    regions,
  }
}

// ── Built-in demo scenes ────────────────────────────────────────────────────
const DEMO_SCENES = [
  {
    id: 'river',
    name: 'River & agricultural land',
    description: 'A winding river crosses cultivated fields with a compact settlement.',
    imageUrl: '/images/river.png',
    regions: [
      { label: 'Water body', x: 34, y: 30, w: 27, h: 42, kind: 'water' },
      { label: 'Settlement', x: 70, y: 42, w: 18, h: 23, kind: 'built' },
      { label: 'Agricultural fields', x: 10, y: 55, w: 25, h: 30, kind: 'vegetation' },
    ],
  },
  {
    id: 'urban',
    name: 'Urban expansion',
    description: 'Dense urban street grid meeting agricultural plots with a major road.',
    imageUrl: '/images/urban.png',
    regions: [
      { label: 'Built-up region', x: 11, y: 14, w: 48, h: 48, kind: 'built' },
      { label: 'Road corridor', x: 5, y: 70, w: 75, h: 8, kind: 'road' },
    ],
  },
  {
    id: 'floodplain',
    name: 'Floodplain monitoring',
    description: 'Broad water basin and water-covered agricultural plots with a settlement.',
    imageUrl: '/images/floodplain.png',
    regions: [
      { label: 'Water-covered region', x: 12, y: 25, w: 43, h: 44, kind: 'water' },
      { label: 'Settlement', x: 68, y: 9, w: 25, h: 25, kind: 'built' },
    ],
  },
]

// ── Format regions as a readable table ─────────────────────────────────────
function formatRegions(regions) {
  if (!regions.length) return 'No regions detected.'
  return regions.map((r, i) =>
    `Region ${i + 1}: "${r.label}" [${r.kind}]\n  Position: x=${r.x}%, y=${r.y}%, w=${r.w}%, h=${r.h}%`
  ).join('\n')
}

// ── MCP Server ──────────────────────────────────────────────────────────────
const server = new McpServer({
  name: 'satquery-ai',
  version: '1.0.0',
})

// ── Tool: configure ─────────────────────────────────────────────────────────
server.tool(
  'configure',
  'Set your AI provider and API key for image analysis. Call this once to save your configuration.',
  {
    provider: z.enum(['claude', 'gemini', 'openai']).describe('AI provider to use'),
    apiKey: z.string().min(1).describe('Your API key for the chosen provider'),
    baseUrl: z.string().optional().describe('Base URL of your SatQuery app (default: http://localhost:3000)'),
  },
  async ({ provider, apiKey, baseUrl }) => {
    const config = await loadConfig()
    config.provider = provider
    config.apiKey = apiKey
    if (baseUrl) config.baseUrl = baseUrl
    await saveConfig(config)
    return {
      content: [{
        type: 'text',
        text: `✅ Configuration saved!\n\nProvider: ${provider}\nAPI Key: ${apiKey.slice(0, 8)}…${apiKey.slice(-4)}\nBase URL: ${config.baseUrl}\n\nYour settings are stored in ${CONFIG_FILE}.\nYou can now use analyze_image or analyze_image_url to detect regions.`,
      }],
    }
  }
)

// ── Tool: list_scenes ───────────────────────────────────────────────────────
server.tool(
  'list_scenes',
  'List all built-in satellite image demo scenes available in SatQuery AI.',
  {},
  async () => {
    const config = await loadConfig()
    const scenes = DEMO_SCENES.map(s =>
      `• ${s.name} (id: ${s.id})\n  ${s.description}\n  Image: ${config.baseUrl}${s.imageUrl}\n  Pre-labeled regions: ${s.regions.length}`
    ).join('\n\n')
    return {
      content: [{
        type: 'text',
        text: `SatQuery AI — Available Demo Scenes\n${'─'.repeat(40)}\n\n${scenes}\n\nUse analyze_image_url with any of these image URLs to run AI detection.`,
      }],
    }
  }
)

// ── Tool: get_scene_regions ─────────────────────────────────────────────────
server.tool(
  'get_scene_regions',
  'Get the pre-labeled reference regions for a built-in SatQuery demo scene.',
  {
    sceneId: z.enum(['river', 'urban', 'floodplain']).describe('Scene ID to retrieve regions for'),
  },
  async ({ sceneId }) => {
    const scene = DEMO_SCENES.find(s => s.id === sceneId)
    if (!scene) return { content: [{ type: 'text', text: `Scene "${sceneId}" not found.` }] }
    const config = await loadConfig()
    const regionText = formatRegions(scene.regions)
    return {
      content: [{
        type: 'text',
        text: `Scene: ${scene.name}\nDescription: ${scene.description}\nImage: ${config.baseUrl}${scene.imageUrl}\n\nPre-labeled regions:\n${regionText}`,
      }],
    }
  }
)

// ── Tool: analyze_image_url ─────────────────────────────────────────────────
server.tool(
  'analyze_image_url',
  'Fetch a satellite image from a URL and analyze it with AI to locate features and draw bounding boxes.',
  {
    imageUrl: z.string().url().describe('Public URL of the image to analyze'),
    prompt: z.string().min(1).max(600).describe('What to find in the image, e.g. "where is the river?" or "locate the village"'),
    provider: z.enum(['claude', 'gemini', 'openai']).optional().describe('Override the default AI provider'),
    apiKey: z.string().optional().describe('Override the default API key'),
  },
  async ({ imageUrl, prompt, provider: overrideProvider, apiKey: overrideKey }) => {
    const config = await loadConfig()
    const provider = overrideProvider || config.provider
    const apiKey = overrideKey || config.apiKey

    if (!apiKey) {
      return {
        content: [{
          type: 'text',
          text: `❌ No API key configured.\n\nRun the "configure" tool first:\n  configure({ provider: "claude", apiKey: "sk-ant-..." })\n\nOr pass apiKey directly to this tool.`,
        }],
      }
    }

    try {
      const { base64, mimeType } = await fetchImageAsBase64(imageUrl)
      const rawText = provider === 'claude'
        ? await callClaude(apiKey, base64, mimeType, prompt)
        : provider === 'gemini'
          ? await callGemini(apiKey, base64, mimeType, prompt)
          : await callOpenAI(apiKey, base64, mimeType, prompt)

      const result = parseResponse(rawText)
      const regionText = formatRegions(result.regions)
      const webUrl = `${config.baseUrl}?scene=custom&prompt=${encodeURIComponent(prompt)}`

      return {
        content: [{
          type: 'text',
          text: [
            `🛰️ SatQuery AI Analysis — ${provider.toUpperCase()}`,
            `${'─'.repeat(45)}`,
            `Prompt: "${prompt}"`,
            `Image: ${imageUrl}`,
            `Confidence: ${result.confidence}%`,
            ``,
            `📍 Answer:`,
            result.answer,
            ``,
            `🔲 Detected Regions (${result.regions.length}):`,
            regionText,
            ``,
            `💡 To visualize these boxes on the website:`,
            `Open ${config.baseUrl}, attach the image, type your prompt, and click Run.`,
          ].join('\n'),
        }],
      }
    } catch (e) {
      return {
        content: [{
          type: 'text',
          text: `❌ Analysis failed: ${e.message}\n\nCheck your API key and that the image URL is publicly accessible.`,
        }],
      }
    }
  }
)

// ── Tool: analyze_image (base64) ────────────────────────────────────────────
server.tool(
  'analyze_image',
  'Analyze a base64-encoded satellite image with AI to locate features and return bounding boxes.',
  {
    imageBase64: z.string().min(10).describe('Base64-encoded image data (without data:// prefix)'),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']).describe('Image MIME type'),
    prompt: z.string().min(1).max(600).describe('What to find in the image, e.g. "where is the river?" or "locate the village and show its boundary"'),
    provider: z.enum(['claude', 'gemini', 'openai']).optional().describe('AI provider to use'),
    apiKey: z.string().optional().describe('API key (overrides saved config)'),
  },
  async ({ imageBase64, mimeType, prompt, provider: overrideProvider, apiKey: overrideKey }) => {
    const config = await loadConfig()
    const provider = overrideProvider || config.provider
    const apiKey = overrideKey || config.apiKey

    if (!apiKey) {
      return {
        content: [{
          type: 'text',
          text: `❌ No API key configured. Run the "configure" tool first.`,
        }],
      }
    }

    try {
      const rawText = provider === 'claude'
        ? await callClaude(apiKey, imageBase64, mimeType, prompt)
        : provider === 'gemini'
          ? await callGemini(apiKey, imageBase64, mimeType, prompt)
          : await callOpenAI(apiKey, imageBase64, mimeType, prompt)

      const result = parseResponse(rawText)
      const regionText = formatRegions(result.regions)

      return {
        content: [{
          type: 'text',
          text: [
            `🛰️ SatQuery AI Analysis — ${provider.toUpperCase()}`,
            `${'─'.repeat(45)}`,
            `Prompt: "${prompt}"`,
            `Confidence: ${result.confidence}%`,
            ``,
            `📍 Answer:`,
            result.answer,
            ``,
            `🔲 Detected Regions (${result.regions.length}):`,
            regionText,
            ``,
            `📋 Raw JSON (for rendering boxes):`,
            JSON.stringify(result.regions, null, 2),
          ].join('\n'),
        }],
      }
    } catch (e) {
      return {
        content: [{
          type: 'text',
          text: `❌ Analysis failed: ${e.message}`,
        }],
      }
    }
  }
)

// ── Tool: open_in_satquery ──────────────────────────────────────────────────
server.tool(
  'open_in_satquery',
  'Get a direct link to open the SatQuery AI dashboard with a specific scene pre-selected.',
  {
    sceneId: z.enum(['river', 'urban', 'floodplain']).optional().describe('Scene to open (optional)'),
    prompt: z.string().optional().describe('Pre-fill a query prompt'),
  },
  async ({ sceneId, prompt }) => {
    const config = await loadConfig()
    const params = new URLSearchParams()
    if (sceneId) params.set('scene', sceneId)
    if (prompt) params.set('q', prompt)
    const url = `${config.baseUrl}${params.toString() ? '?' + params.toString() : ''}`
    return {
      content: [{
        type: 'text',
        text: `Open SatQuery AI in your browser:\n${url}\n\nOr use the website directly to:\n1. Click "Attach image" in the query panel\n2. Type your prompt (e.g. "where is the river?")\n3. Click Run analysis\n4. Bounding boxes will appear on the image`,
      }],
    }
  }
)

// ── Start ───────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
console.error('SatQuery AI MCP Server running on stdio')
