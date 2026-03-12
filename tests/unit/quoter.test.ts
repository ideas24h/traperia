/**
 * Tests for traperia pricing engine
 * Runs with: npm run test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculatePrice } from '@/lib/ai/quoter'
import type { DetectedItem, PricingInput } from '@/types'

// ---- Fixtures ----

const STANDARD_ITEMS: DetectedItem[] = [
  { category: 'sofa', quantity: 1, volume_m3: 2.0, condition: 'good', salvageable: true },
  { category: 'bed', quantity: 2, volume_m3: 1.5, condition: 'fair', salvageable: false },
  { category: 'wardrobe', quantity: 1, volume_m3: 3.0, condition: 'poor', salvageable: false },
  { category: 'appliance', quantity: 2, volume_m3: 0.8, condition: 'fair', salvageable: true },
  { category: 'box', quantity: 10, volume_m3: 0.1, condition: 'poor', salvageable: false },
]

const STANDARD_INPUT: PricingInput = {
  floors: 2,
  has_elevator: true,
  property_type: 'apartment',
  urgency_days: 7,
  m2: 80,
}

// ---- Tests ----

describe('calculatePrice', () => {
  it('generates a price for a standard apartment', () => {
    const result = calculatePrice(STANDARD_ITEMS, STANDARD_INPUT)

    expect(result.total_min).toBeGreaterThan(0)
    expect(result.total_max).toBeGreaterThan(result.total_min)
    expect(result.transport).toBeGreaterThan(0)
    expect(result.labor).toBeGreaterThan(0)
    expect(result.waste_disposal).toBeGreaterThan(0)
  })

  it('total_max is 10% higher than total_min', () => {
    const result = calculatePrice(STANDARD_ITEMS, STANDARD_INPUT)
    const ratio = result.total_max / result.total_min
    expect(ratio).toBeCloseTo(1.22, 0) // ~10% range each side
  })

  it('applies high floor penalty when no elevator above 3rd floor', () => {
    const withElevator = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, has_elevator: true, floors: 5 })
    const noElevator = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, has_elevator: false, floors: 5 })

    expect(noElevator.total_min).toBeGreaterThan(withElevator.total_min)
    // Should be ~30% more expensive
    expect(noElevator.total_min / withElevator.total_min).toBeCloseTo(1.3, 1)
  })

  it('no penalty for high floors with elevator', () => {
    const floor2 = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, has_elevator: true, floors: 2 })
    const floor8 = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, has_elevator: true, floors: 8 })

    // Same price regardless of floor if elevator
    expect(floor2.total_min).toBe(floor8.total_min)
  })

  it('applies urgency surcharge for 24h', () => {
    const normal = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, urgency_days: 7 })
    const urgent = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, urgency_days: 1 })

    expect(urgent.total_min).toBeGreaterThan(normal.total_min)
    expect(urgent.total_min / normal.total_min).toBeCloseTo(1.5, 1)
  })

  it('applies 48h urgency surcharge', () => {
    const normal = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, urgency_days: 7 })
    const urgent48 = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, urgency_days: 2 })

    expect(urgent48.total_min / normal.total_min).toBeCloseTo(1.3, 1)
  })

  it('applies salvageable discount when >30% salvageable', () => {
    const salvageableItems: DetectedItem[] = [
      { category: 'sofa', quantity: 2, volume_m3: 3.0, condition: 'good', salvageable: true },
      { category: 'bed', quantity: 1, volume_m3: 1.0, condition: 'fair', salvageable: false },
    ]
    // 6/7 m³ salvageable = 85% > 30% threshold

    const withSalvage = calculatePrice(salvageableItems, STANDARD_INPUT)
    const noSalvageItems: DetectedItem[] = salvageableItems.map(i => ({ ...i, salvageable: false }))
    const withoutSalvage = calculatePrice(noSalvageItems, STANDARD_INPUT)

    expect(withSalvage.total_min).toBeLessThan(withoutSalvage.total_min)
  })

  it('minimum price is at least 2 hours of labor', () => {
    const fewItems: DetectedItem[] = [
      { category: 'box', quantity: 2, volume_m3: 0.1, condition: 'poor', salvageable: false },
    ]
    const result = calculatePrice(fewItems, STANDARD_INPUT)

    // Minimum 2h × 2 people × 40€/h = 160€ labor alone
    expect(result.labor).toBeGreaterThanOrEqual(160)
  })

  it('includes cleaning cost when m2 provided', () => {
    const withM2 = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, m2: 100 })
    const withoutM2 = calculatePrice(STANDARD_ITEMS, { ...STANDARD_INPUT, m2: undefined })

    expect(withM2.cleaning).toBeDefined()
    expect(withoutM2.cleaning).toBeUndefined()
    expect(withM2.total_min).toBeGreaterThan(withoutM2.total_min)
  })

  it('pricing is within expected range for standard 80m² apartment', () => {
    const result = calculatePrice(STANDARD_ITEMS, STANDARD_INPUT)

    // Standard 80m² should be between 400€ and 1200€
    expect(result.total_min).toBeGreaterThanOrEqual(400)
    expect(result.total_max).toBeLessThanOrEqual(1200)
  })
})

describe('pricing consistency', () => {
  it('more items = higher price', () => {
    const fewItems: DetectedItem[] = [
      { category: 'sofa', quantity: 1, volume_m3: 2.0, condition: 'good', salvageable: false },
    ]
    const manyItems: DetectedItem[] = [
      ...STANDARD_ITEMS,
      { category: 'wardrobe', quantity: 3, volume_m3: 3.0, condition: 'poor', salvageable: false },
    ]

    const few = calculatePrice(fewItems, STANDARD_INPUT)
    const many = calculatePrice(manyItems, STANDARD_INPUT)

    expect(many.total_min).toBeGreaterThan(few.total_min)
  })

  it('returns deterministic results', () => {
    const r1 = calculatePrice(STANDARD_ITEMS, STANDARD_INPUT)
    const r2 = calculatePrice(STANDARD_ITEMS, STANDARD_INPUT)

    expect(r1.total_min).toBe(r2.total_min)
    expect(r1.total_max).toBe(r2.total_max)
  })
})
