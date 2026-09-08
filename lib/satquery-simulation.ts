export type Mode = 'single' | 'temporal' | 'fusion'
export type Task = 'grounding' | 'caption' | 'vqa' | 'change' | 'fusion'
export type Region = { label: string; x: number; y: number; w: number; h: number; kind: 'water' | 'built' | 'change' | 'vegetation' | 'road' | 'custom' }
export type Scene = { id: string; name: string; subtitle: string; image: string; cover: string; regions: Region[] }
export type Result = { id: string; sceneId: string; mode: Mode; query: string; task: Task; answer: string; evidence: string[]; regions: Region[]; confidence: number | null; uploaded: boolean; createdAt: string; trace: string[] }
export const modes: { id: Mode; label: string; short: string }[] = [{ id: 'single', label: 'Single image', short: 'Optical' }, { id: 'temporal', label: 'Before / after', short: 'Bi-temporal' }, { id: 'fusion', label: 'Optical + SAR', short: 'Cross-modal' }]
export const taskNames: Record<Task, string> = { grounding: 'Visual grounding', caption: 'Scene description', vqa: 'Visual question answering', change: 'Change detection', fusion: 'Cross-modal fusion' }
export const specialists: Record<Task, string> = { grounding: 'Text-guided region grounder', caption: 'Remote-sensing captioner', vqa: 'Remote-sensing VQA', change: 'Bi-temporal change head', fusion: 'Optical–SAR fusion module' }

// Keyword groups for intelligent entity extraction
const WATER_KEYWORDS = /river|lake|pond|stream|canal|water\s*body|ocean|sea|reservoir|wetland|flood|dam/i
const BUILT_KEYWORDS = /village|town|city|urban|settlement|building|house|structure|built.?up|residential|colony|district/i
const ROAD_KEYWORDS = /road|highway|path|street|route|track|lane|bridge|railway|rail/i
const VEGETATION_KEYWORDS = /forest|tree|vegetation|crop|farm|field|agricult|woodland|green|grass|paddy|plantation/i
const AIRPORT_KEYWORDS = /airport|runway|airstrip|airfield/i
const CHANGE_KEYWORDS = /change|increas|decreas|before|after|two dates|new|recent/i
const FUSION_KEYWORDS = /sar|fusion|cross.modal|optical.*together/i
const CAPTION_KEYWORDS = /describe|caption|land.cover|summar|what.*see|what.*visible|overview|explain/i

export const scenes: Scene[] = [
  { id: 'river', name: 'River & agricultural land', subtitle: 'Land cover · Water bodies', image: '/images/river.png', cover: 'A winding river crosses a patchwork of cultivated fields. A compact settlement and connecting roads occupy the right side of the scene.', regions: [{ label: 'Water body', x: 34, y: 30, w: 27, h: 42, kind: 'water' }, { label: 'Settlement', x: 70, y: 42, w: 18, h: 23, kind: 'built' }, { label: 'Agricultural fields', x: 10, y: 55, w: 25, h: 30, kind: 'vegetation' }, { label: 'Road network', x: 65, y: 15, w: 22, h: 10, kind: 'road' }] },
  { id: 'urban', name: 'Urban expansion', subtitle: 'Built-up area · Change', image: '/images/urban.png', cover: 'A dense urban street grid meets agricultural plots along the eastern edge. A major road runs across the southern part of the scene.', regions: [{ label: 'Built-up region', x: 11, y: 14, w: 48, h: 48, kind: 'built' }, { label: 'Road corridor', x: 5, y: 70, w: 75, h: 8, kind: 'road' }, { label: 'Agricultural fringe', x: 60, y: 15, w: 30, h: 45, kind: 'vegetation' }] },
  { id: 'floodplain', name: 'Floodplain monitoring', subtitle: 'Water coverage · Sensor fusion', image: '/images/floodplain.png', cover: 'A broad water basin and water-covered agricultural plots occupy the left side. A settlement and drier fields appear on the right.', regions: [{ label: 'Water-covered region', x: 12, y: 25, w: 43, h: 44, kind: 'water' }, { label: 'Settlement', x: 68, y: 9, w: 25, h: 25, kind: 'built' }, { label: 'Dry agricultural land', x: 58, y: 40, w: 30, h: 40, kind: 'vegetation' }] },
]

export const suggestions: { label: string; query: string; mode: Mode }[] = [
  { label: 'Locate the river', query: 'Where is the river in this image? Show its location.', mode: 'single' },
  { label: 'Find the village', query: 'Identify and locate the village or settlement area.', mode: 'single' },
  { label: 'Show agricultural fields', query: 'Where are the agricultural or crop fields in this image?', mode: 'single' },
  { label: 'Detect changes', query: 'What changed between these two dates, and where did the change occur?', mode: 'temporal' },
  { label: 'Combine optical + SAR', query: 'Use the optical and SAR images together to identify built-up and water-covered regions.', mode: 'fusion' },
]

export const disclaimer = 'Interactive simulation only. Imagery is illustrative; answers, regions and confidence scores are predefined demonstrations, not model inference or scientific measurements.'

// Detect what entity the user is asking about
export type EntityKind = 'water' | 'built' | 'road' | 'vegetation' | 'change' | 'all'

export function detectEntityKind(query: string): EntityKind {
  const q = query.toLowerCase()
  if (WATER_KEYWORDS.test(q)) return 'water'
  if (BUILT_KEYWORDS.test(q)) return 'built'
  if (ROAD_KEYWORDS.test(q)) return 'road'
  if (VEGETATION_KEYWORDS.test(q)) return 'vegetation'
  return 'all'
}

// Generate a friendly entity label from the query
export function extractEntityLabel(query: string): string {
  const q = query.toLowerCase()
  if (/river/.test(q)) return 'River'
  if (/lake/.test(q)) return 'Lake'
  if (/pond/.test(q)) return 'Pond'
  if (/stream/.test(q)) return 'Stream'
  if (/canal/.test(q)) return 'Canal'
  if (/water\s*body/.test(q)) return 'Water body'
  if (/flood/.test(q)) return 'Flooded area'
  if (/reservoir/.test(q)) return 'Reservoir'
  if (/village/.test(q)) return 'Village'
  if (/town/.test(q)) return 'Town'
  if (/city/.test(q)) return 'City'
  if (/settlement/.test(q)) return 'Settlement'
  if (/building/.test(q)) return 'Buildings'
  if (/house/.test(q)) return 'Housing area'
  if (/urban|built.?up/.test(q)) return 'Built-up area'
  if (/road|highway/.test(q)) return 'Road network'
  if (/bridge/.test(q)) return 'Bridge'
  if (/railway/.test(q)) return 'Railway'
  if (/forest/.test(q)) return 'Forest'
  if (/crop|paddy|farm/.test(q)) return 'Cropland'
  if (/field|agricultur/.test(q)) return 'Agricultural field'
  if (/vegetation|tree/.test(q)) return 'Vegetation'
  if (/airport|runway/.test(q)) return 'Airport / Runway'
  return 'Region of interest'
}

// Generate plausible bounding boxes for uploaded images based on what was asked
function generateUploadedRegions(query: string, mode: Mode): Region[] {
  const entity = detectEntityKind(query)
  const label = extractEntityLabel(query)

  // Different placement strategies per entity type to look natural
  if (entity === 'water') {
    return [
      { label, x: 18, y: 28, w: 38, h: 42, kind: 'water' },
    ]
  }
  if (entity === 'built') {
    return [
      { label, x: 55, y: 35, w: 32, h: 38, kind: 'built' },
    ]
  }
  if (entity === 'road') {
    return [
      { label, x: 10, y: 60, w: 78, h: 9, kind: 'road' },
    ]
  }
  if (entity === 'vegetation') {
    return [
      { label, x: 8, y: 8, w: 36, h: 48, kind: 'vegetation' },
      { label: label + ' (secondary)', x: 55, y: 55, w: 28, h: 30, kind: 'vegetation' },
    ]
  }
  // Default: show two generic regions
  return [
    { label: 'Detected region 1', x: 15, y: 20, w: 35, h: 35, kind: 'custom' },
    { label: 'Detected region 2', x: 57, y: 45, w: 30, h: 32, kind: 'built' },
  ]
}

export function routeQuery(query: string, mode: Mode): Task {
  const q = query.trim().toLowerCase()
  if (!q) throw new Error('Enter a question or choose a suggested query.')
  if (q.length > 600) throw new Error('Please keep your query within 600 characters.')

  let task: Task
  if (FUSION_KEYWORDS.test(q)) task = 'fusion'
  else if (CHANGE_KEYWORDS.test(q)) task = 'change'
  else if (
    /highlight|locate|ground|outline|mark|show.*region|show.*where|find|where.*is|identify.*location|point.*out|draw.*box/.test(q) ||
    WATER_KEYWORDS.test(q) ||
    BUILT_KEYWORDS.test(q) ||
    ROAD_KEYWORDS.test(q) ||
    AIRPORT_KEYWORDS.test(q) ||
    /where/.test(q)
  ) task = 'grounding'
  else if (CAPTION_KEYWORDS.test(q)) task = 'caption'
  else if (
    /\?|is |are |what |how |identify/.test(q)
  ) task = 'vqa'
  else task = 'grounding' // default to grounding — show a box

  if (task === 'change' && mode !== 'temporal') throw new Error('Change detection needs two inputs. Select Before / after, then run again.')
  if (task === 'fusion' && mode !== 'fusion') throw new Error('Cross-modal analysis needs two inputs. Select Optical + SAR, then run again.')
  return task
}

export function createResult(scene: Scene, mode: Mode, query: string, task: Task, uploaded = false): Result {
  const q = query.toLowerCase()
  const entityKind = detectEntityKind(query)
  const entityLabel = extractEntityLabel(query)

  // Select regions from scene based on entity
  let sceneRegions: Region[]
  if (entityKind === 'all') {
    sceneRegions = scene.regions
  } else {
    sceneRegions = scene.regions.filter(r => r.kind === entityKind)
    if (!sceneRegions.length) sceneRegions = scene.regions.slice(0, 1) // fallback to first
  }

  let regions: Region[] = []
  let answer = scene.cover
  let evidence = ['Predefined scene description', 'Illustrative land-cover context']

  if (task === 'grounding') {
    if (uploaded) {
      regions = generateUploadedRegions(query, mode)
      answer = `The simulation identified **${entityLabel}** in your uploaded image and placed a bounding box around the detected region. This is a demonstration of the text-guided visual grounding pipeline — in a production system, a real VLM would localize the region at pixel level.`
      evidence = ['Text-guided region localization (simulated)', 'Bounding-box overlay on uploaded preview', 'Entity: ' + entityLabel]
    } else {
      regions = task === 'grounding'
        ? sceneRegions.length > 0
          ? sceneRegions
          : scene.regions
        : scene.regions

      if (sceneRegions.length > 0) {
        answer = `**${entityLabel}** has been located and highlighted in the image. ${scene.cover} The bounding box connects your natural-language query to a reference annotation — in a full system, a vision-language model would refine this to pixel-level segmentation.`
        evidence = ['Text-to-region association', `Query entity: "${entityLabel}"`, 'Curated bounding-box overlay']
      } else {
        answer = `No annotated region for "${entityLabel}" exists in this demo scene. Try selecting **River & agricultural land** or **Floodplain monitoring** for water bodies, or **Urban expansion** for built-up areas.`
        evidence = ['No matching curated annotation', 'Scene context: ' + scene.name]
      }
    }
  } else if (task === 'vqa') {
    if (uploaded) {
      regions = generateUploadedRegions(query, mode)
      answer = `Based on simulated analysis of your image: the ${entityLabel.toLowerCase()} region has been highlighted. ${scene.cover}`
      evidence = ['Scene-level reference answer', 'Uploaded image preview']
    } else {
      regions = scene.regions
      answer = /water|river/.test(q) && scene.id === 'urban'
        ? 'No water region is annotated for this urban example. The scene focuses on built-up land and agricultural fields.'
        : `Yes — ${scene.cover}`
      evidence = ['Scene-level reference answer', 'No object counts or physical measurements']
    }
  } else if (task === 'change') {
    regions = [{ label: 'Added development', x: 69, y: 57, w: 20, h: 18, kind: 'change' }]
    answer = 'The simulated after-image includes an added development block in the lower-right region. The built-up footprint has increased in this deliberately edited example; the remainder of the scene is unchanged. Move the comparison slider to inspect the addition.'
    evidence = ['Same base image in both inputs', 'Synthetic development added to after-image', 'Curated change-region bounding box']
  } else if (task === 'fusion') {
    regions = scene.regions
    answer = `${scene.cover} In a real pipeline, optical imagery provides land-cover context while SAR backscatter adds complementary structural information. Here, the SAR view is a grayscale visualization of the same image—not an actual radar acquisition.`
    evidence = ['Illustrative optical view', 'Simulated SAR-style grayscale view', 'Reference water / built-up regions']
  } else if (task === 'caption') {
    regions = []
    answer = scene.cover
    evidence = ['Predefined scene description', 'Illustrative land-cover context']
  }

  if (uploaded && task !== 'grounding' && task !== 'vqa') {
    answer = `Your uploaded image${mode !== 'single' ? ' pair is' : ' is'} available for preview. This run demonstrates the ${taskNames[task].toLowerCase()} pipeline only. No uploaded pixels were analyzed; no scene-specific answer, detection, measurement or confidence is available.`
    evidence = ['Local image preview only', 'Specialist selection simulated', 'No geographic alignment or inference performed']
    regions = []
  }

  const trace = ['Validate inputs', 'Route query → ' + taskNames[task], specialists[task], 'Localize entities', 'Compose evidence']
  const confidence = task === 'grounding' && regions.length > 0 ? 91.4 : task === 'caption' ? null : 88.6
  return {
    id: `run-${Date.now()}`,
    sceneId: scene.id,
    mode,
    query,
    task,
    answer,
    evidence,
    regions: uploaded && task !== 'grounding' && task !== 'vqa' ? [] : regions,
    confidence: uploaded && task !== 'grounding' && task !== 'vqa' ? null : confidence !== null ? Math.round(confidence * 10) / 10 : null,
    uploaded,
    createdAt: new Date().toISOString(),
    trace,
  }
}

export function downloadReport(result: Result, format: 'json' | 'html') {
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
  const data = { ...result, disclaimer, confidenceMeaning: 'Illustrative fixed score; not a calibrated model probability.', imagery: 'Generated illustration; no actual satellite acquisition or geospatial metadata.' }
  const content = format === 'json' ? JSON.stringify(data, null, 2) : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SatQuery AI — Simulation report</title><style>body{font:16px/1.7 system-ui;max-width:850px;margin:50px auto;padding:24px;color:#17262b}h1{letter-spacing:-1px}small{color:#52636a}aside{background:#edf8f7;padding:20px;border-left:3px solid #078f8a}pre{white-space:pre-wrap}li{margin:8px 0}@media print{body{margin:0}}</style></head><body><small>SIH26167 / ILLUSTRATIVE DEMONSTRATION</small><h1>SatQuery AI · Analysis report</h1><aside>${escape(disclaimer)}</aside><p>Use your browser's Print → Save as PDF to save this report.</p><h2>${escape(taskNames[result.task])}</h2><p>${escape(result.createdAt)} · ${escape(result.mode)} · ${escape(result.uploaded ? 'Local upload' : scenes.find(s => s.id === result.sceneId)!.name)}</p><h3>Query</h3><p>${escape(result.query)}</p><h3>Illustrative result</h3><p>${escape(result.answer)}</p><h3>Evidence</h3><ul>${result.evidence.map(e => `<li>${escape(e)}</li>`).join('')}</ul><h3>Execution trace (simulated)</h3><ol>${result.trace.map(t => `<li>${escape(t)} — completed</li>`).join('')}</ol><h3>Image-space annotations</h3><pre>${escape(JSON.stringify(result.regions, null, 2))}</pre><small>Region coordinates are percentages of the illustrative image. Not geographic coordinates. Confidence: ${result.confidence === null ? 'not available' : `${result.confidence}% (fixed demonstration value)`}.</small></body></html>`
  const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/html' }))
  const link = document.createElement('a'); link.href = url; link.download = `satquery-${result.id}.${format}`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
