import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

// ── Types ──────────────────────────────────────────────────────────────────────
type Provider = 'claude' | 'gemini' | 'openai'
type RegionKind = 'water' | 'built' | 'change' | 'vegetation' | 'road' | 'custom'
interface Region { label: string; x: number; y: number; w: number; h: number; kind: RegionKind }
interface AnalyzeResponse { regions: Region[]; answer: string; confidence: number }

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a satellite / aerial imagery analysis assistant with expertise in remote sensing.
The user will provide an image and a natural-language prompt describing something they want to locate or identify in it.

Your job is to:
1. Carefully read the prompt and understand what geographic feature or object they want found.
2. Analyse the image and identify the location(s) of that feature.
3. Return ONLY a valid JSON object — no markdown, no code fences, no extra text — with exactly this shape:

{
  "answer": "<one or two sentence natural-language description of what you found and where>",
  "confidence": <integer 0-100>,
  "regions": [
    {
      "label": "<short readable label for this region>",
      "x": <left edge as % of image width, 0-100>,
      "y": <top edge as % of image height, 0-100>,
      "w": <width as % of image width, 5-95>,
      "h": <height as % of image height, 5-95>,
      "kind": "<one of: water | built | vegetation | road | change | custom>"
    }
  ]
}

Rules:
- Coordinates are percentages of the image dimensions (0 = left/top, 100 = right/bottom).
- Include 1-4 bounding boxes. Each box should tightly surround the detected region.
- If nothing matching the prompt is visible, return regions: [] and explain in answer.
- kind must be one of the allowed values: water, built, vegetation, road, change, custom.
- Do not include markdown. Return raw JSON only.`

// ── Claude (Anthropic) ─────────────────────────────────────────────────────────
async function callClaude(apiKey: string, imageBase64: string, mimeType: string, prompt: string): Promise<AnalyzeResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
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
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  const text: string = data.content?.[0]?.text ?? ''
  return parseAIResponse(text)
}

// ── Gemini (Google) ────────────────────────────────────────────────────────────
async function callGemini(apiKey: string, imageBase64: string, mimeType: string, prompt: string): Promise<AnalyzeResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.1 },
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return parseAIResponse(text)
}

// ── OpenAI / GPT-4o ───────────────────────────────────────────────────────────
async function callOpenAI(apiKey: string, imageBase64: string, mimeType: string, prompt: string): Promise<AnalyzeResponse> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  return parseAIResponse(text)
}

// ── JSON parser ────────────────────────────────────────────────────────────────
function parseAIResponse(raw: string): AnalyzeResponse {
  // Strip markdown code fences if model added them despite instructions
  const clean = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  // Find the JSON object
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('AI did not return valid JSON')
  const parsed = JSON.parse(clean.slice(start, end + 1))

  const allowed: RegionKind[] = ['water', 'built', 'change', 'vegetation', 'road', 'custom']
  const regions: Region[] = (parsed.regions ?? []).map((r: Record<string, unknown>) => ({
    label: String(r.label ?? 'Detected region').slice(0, 60),
    x: Math.max(0, Math.min(95, Number(r.x) || 10)),
    y: Math.max(0, Math.min(95, Number(r.y) || 10)),
    w: Math.max(5, Math.min(90, Number(r.w) || 20)),
    h: Math.max(5, Math.min(90, Number(r.h) || 20)),
    kind: allowed.includes(r.kind as RegionKind) ? (r.kind as RegionKind) : 'custom',
  }))

  return {
    answer: String(parsed.answer ?? 'Analysis complete.').slice(0, 800),
    confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 80))),
    regions,
  }
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, prompt, provider, apiKey } = await req.json() as {
      imageBase64: string; mimeType: string; prompt: string; provider: Provider; apiKey: string
    }

    if (!imageBase64 || !prompt || !provider || !apiKey) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
      return NextResponse.json({ error: 'Unsupported image type.' }, { status: 400 })
    }
    if (prompt.length > 600) {
      return NextResponse.json({ error: 'Prompt too long.' }, { status: 400 })
    }

    let result: AnalyzeResponse
    if (provider === 'claude') result = await callClaude(apiKey, imageBase64, mimeType, prompt)
    else if (provider === 'gemini') result = await callGemini(apiKey, imageBase64, mimeType, prompt)
    else if (provider === 'openai') result = await callOpenAI(apiKey, imageBase64, mimeType, prompt)
    else return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 })

    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Analysis failed.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
