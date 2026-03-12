/**
 * POST /api/budgets
 * Creates a new budget request from client photos
 *
 * Public endpoint (no auth required for lead generation)
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateQuote } from '@/lib/ai/quoter'
import type { ApiResponse, Budget, PricingInput } from '@/types'

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Budget>>> {
  try {
    const body = await req.json()
    const { name, phone, address, photos, m2, floors, has_elevator, urgency_days, description } = body

    // Basic validation
    if (!phone || !address) {
      return NextResponse.json(
        { error: 'Teléfono y dirección son obligatorios', code: 'MISSING_FIELDS' },
        { status: 400 }
      )
    }

    if (!photos || photos.length === 0) {
      return NextResponse.json(
        { error: 'Se necesita al menos una foto', code: 'NO_PHOTOS' },
        { status: 400 }
      )
    }

    const pricingInput: PricingInput = {
      photos,
      m2: m2 || undefined,
      floors: floors || 1,
      has_elevator: has_elevator ?? true,
      property_type: 'apartment',
      urgency_days: urgency_days || 7,
      description,
    }

    // Generate AI quote
    const quote = await generateQuote(pricingInput)

    // Build budget object (in production: save to Supabase)
    const budget: Budget = {
      id: `TR-${Date.now()}`,
      client_id: `cli_${Date.now()}`,
      property_address: address,
      property_m2: quote.detected_items.length > 0 ? undefined : m2,
      floors,
      has_elevator,
      photos,
      ai_detected_items: quote.detected_items,
      ai_confidence: quote.confidence,
      price_min: quote.price_min,
      price_max: quote.price_max,
      breakdown: quote.breakdown,
      estimated_duration_hours: quote.estimated_duration_hours,
      carbon_saved_kg: quote.carbon_saved_kg,
      status: 'ready',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }

    // TODO: Save to Supabase
    // TODO: Send WhatsApp notification to client
    // TODO: Notify traperia-director via Mission Control

    return NextResponse.json({ data: budget }, { status: 201 })

  } catch (err) {
    console.error('[POST /api/budgets] Error:', err)
    return NextResponse.json(
      { error: 'Error generando presupuesto', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Admin only: list all budgets
  // TODO: Add auth middleware
  return NextResponse.json({ data: [], total: 0, page: 1, per_page: 20 })
}
