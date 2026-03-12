/**
 * traperia-quoter integration
 * Calls OpenClaw Gateway with kimi-k2.5 for visual analysis + pricing
 */

import type { PricingInput, PricingOutput, DetectedItem, BudgetBreakdown } from '@/types'

const OPENCLAW_URL = process.env.OPENCLAW_URL || 'http://localhost:47821/v1'
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN!
const VISION_MODEL = 'kimi-k2.5'
const TEXT_MODEL = 'zai/glm-4.7'

// ---- Internal helpers ----

async function callOpenClaw(model: string, messages: object[], options = {}) {
  const res = await fetch(`${OPENCLAW_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, ...options }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenClaw error ${res.status}: ${err}`)
  }

  const json = await res.json()
  return json.choices[0].message.content
}

// ---- Photo Analysis ----

export async function analyzePhotos(photoUrls: string[]): Promise<{
  detected_items: DetectedItem[]
  m2_estimate: number
  has_elevator: boolean | null
  access_difficulty: 'easy' | 'medium' | 'hard'
  special_items: string[]
}> {
  const imageContent = photoUrls.map(url => ({
    type: 'image_url',
    image_url: { url }
  }))

  const prompt = `Eres el sistema de análisis de traperia.com para vaciados de pisos.

Analiza estas fotos y responde SOLO con JSON válido:
{
  "detected_items": [
    { "category": "sofa|bed|wardrobe|table|appliance|box|other", "quantity": N, "volume_m3": X.X, "condition": "good|fair|poor", "salvageable": true/false }
  ],
  "m2_estimate": N,
  "has_elevator": true/false/null,
  "access_difficulty": "easy|medium|hard",
  "special_items": ["colchon_especial", "raee", "peligroso", ...]
}

Criterios:
- salvageable=true si el item puede venderse en marketplace (buen estado)
- access_difficulty hard = sin ascensor >3ª planta o pasillos muy estrechos
- special_items: incluir si hay electrodomésticos RAEE, materiales peligrosos, colchones`

  const content = await callOpenClaw(VISION_MODEL, [
    {
      role: 'user',
      content: [
        ...imageContent,
        { type: 'text', text: prompt }
      ]
    }
  ])

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Vision model returned non-JSON response')

  return JSON.parse(jsonMatch[0])
}

// ---- Pricing Engine ----

const PRICING_WEIGHTS = {
  transport_per_m3: 30,      // €/m³
  labor_per_hour: 40,        // €/h per person
  waste_per_m3: 20,          // €/m³ disposal
  cleaning_per_m2: 0.5,      // €/m²
  // Modifiers
  no_elevator_high_floor: 1.3,
  special_waste: 1.2,
  urgency_24h: 1.5,
  urgency_48h: 1.3,
  salvageable_discount: 0.9, // if >30% salvageable
}

export function calculatePrice(
  detectedItems: DetectedItem[],
  input: PricingInput
): BudgetBreakdown & { total_min: number; total_max: number } {
  const totalVolume = detectedItems.reduce((sum, item) => sum + item.volume_m3 * item.quantity, 0)
  const hoursEstimated = Math.max(2, totalVolume * 0.8) // ~1.25h per m³
  const teamSize = totalVolume > 15 ? 3 : 2

  let transport = totalVolume * PRICING_WEIGHTS.transport_per_m3
  let labor = hoursEstimated * teamSize * PRICING_WEIGHTS.labor_per_hour
  let waste_disposal = totalVolume * PRICING_WEIGHTS.waste_per_m3
  let cleaning = input.m2 ? input.m2 * PRICING_WEIGHTS.cleaning_per_m2 : 0

  let multiplier = 1.0

  // Access difficulty
  if (!input.has_elevator && input.floors > 3) {
    multiplier *= PRICING_WEIGHTS.no_elevator_high_floor
  }

  // Urgency
  if (input.urgency_days <= 1) multiplier *= PRICING_WEIGHTS.urgency_24h
  else if (input.urgency_days <= 2) multiplier *= PRICING_WEIGHTS.urgency_48h

  // Salvageable discount
  const salvageableVolume = detectedItems
    .filter(i => i.salvageable)
    .reduce((sum, i) => sum + i.volume_m3 * i.quantity, 0)
  if (salvageableVolume / totalVolume > 0.3) {
    multiplier *= PRICING_WEIGHTS.salvageable_discount
  }

  transport *= multiplier
  labor *= multiplier
  waste_disposal *= multiplier

  const base_total = transport + labor + waste_disposal + cleaning

  return {
    transport: Math.round(transport),
    labor: Math.round(labor),
    waste_disposal: Math.round(waste_disposal),
    cleaning: cleaning > 0 ? Math.round(cleaning) : undefined,
    total_min: Math.round(base_total * 0.9),   // -10% uncertainty
    total_max: Math.round(base_total * 1.1),   // +10% uncertainty
  }
}

// ---- Main Export ----

export async function generateQuote(input: PricingInput): Promise<PricingOutput> {
  let detected_items: DetectedItem[] = []
  let access_analysis = {
    has_elevator: input.has_elevator,
    access_difficulty: 'medium' as const,
    m2_estimate: input.m2 || 0,
    special_items: [] as string[],
  }

  // Vision analysis if photos provided
  if (input.photos && input.photos.length > 0) {
    const analysis = await analyzePhotos(input.photos)
    detected_items = analysis.detected_items
    access_analysis = {
      has_elevator: analysis.has_elevator ?? input.has_elevator,
      access_difficulty: analysis.access_difficulty,
      m2_estimate: analysis.m2_estimate || input.m2 || 0,
      special_items: analysis.special_items,
    }
  }

  const pricing = calculatePrice(detected_items, {
    ...input,
    has_elevator: access_analysis.has_elevator,
    m2: access_analysis.m2_estimate,
  })

  // Estimate carbon saved
  const totalVolume = detected_items.reduce((sum, i) => sum + i.volume_m3 * i.quantity, 0)
  const avgWeightPerM3 = 80 // kg/m³ furniture average
  const totalKg = totalVolume * avgWeightPerM3
  const carbon_saved_kg = Math.round(totalKg * 0.45 * 0.6) // 60% diverted from landfill

  // Generate available dates (next 3 working days)
  const available_dates = getNextWorkingDays(3)

  // Reasoning from LLM
  const reasoning = await generateReasoning(detected_items, pricing, access_analysis)

  return {
    price_min: pricing.total_min,
    price_max: pricing.total_max,
    breakdown: {
      transport: pricing.transport,
      labor: pricing.labor,
      waste_disposal: pricing.waste_disposal,
      cleaning: pricing.cleaning,
    },
    detected_items,
    estimated_duration_hours: Math.round(detected_items.reduce((s, i) => s + i.volume_m3 * i.quantity, 0) * 0.8),
    confidence: input.photos && input.photos.length >= 3 ? 0.82 : 0.65,
    available_dates,
    carbon_saved_kg,
    reasoning,
  }
}

async function generateReasoning(
  items: DetectedItem[],
  pricing: ReturnType<typeof calculatePrice>,
  access: typeof access_analysis
): Promise<string> {
  const itemSummary = items
    .map(i => `${i.quantity} ${i.category}(s)`)
    .join(', ')

  const prompt = `Eres el asistente de presupuestos de traperia.com.

Genera una explicación breve (2-3 frases) del presupuesto para el cliente.
Items detectados: ${itemSummary}
Acceso: ${access.access_difficulty}, ascensor: ${access.has_elevator}
Precio estimado: ${pricing.total_min}€-${pricing.total_max}€

Responde en español, tono profesional y cercano.`

  return callOpenClaw(TEXT_MODEL, [{ role: 'user', content: prompt }])
}

function getNextWorkingDays(count: number): string[] {
  const dates: string[] = []
  const d = new Date()
  d.setDate(d.getDate() + 1) // start tomorrow

  while (dates.length < count) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) { // skip weekends
      dates.push(d.toISOString().split('T')[0])
    }
    d.setDate(d.getDate() + 1)
  }

  return dates
}
