// ============================================================
// TRAPERIA — Core Types
// ============================================================

// --- Clients ---

export interface Client {
  id: string
  name: string
  phone: string
  email?: string
  source: 'web' | 'whatsapp' | 'api' | 'referral'
  partner_id?: string // B2B partner that referred
  created_at: string
}

// --- Budget / Quote ---

export type BudgetStatus = 'analyzing' | 'ready' | 'sent' | 'approved' | 'rejected' | 'expired'

export interface DetectedItem {
  category: 'sofa' | 'bed' | 'wardrobe' | 'table' | 'appliance' | 'box' | 'other'
  quantity: number
  volume_m3: number
  condition: 'good' | 'fair' | 'poor'
  salvageable: boolean
}

export interface BudgetBreakdown {
  transport: number
  labor: number
  waste_disposal: number
  cleaning?: number
  special_items?: number
}

export interface Budget {
  id: string
  client_id: string
  property_address: string
  property_m2?: number
  floors?: number
  has_elevator?: boolean
  photos: string[] // storage URLs
  ai_detected_items: DetectedItem[]
  ai_confidence: number // 0-1
  price_min: number
  price_max: number
  breakdown: BudgetBreakdown
  estimated_duration_hours: number
  carbon_saved_kg: number
  status: BudgetStatus
  created_at: string
  expires_at: string
  scheduled_date?: string
}

// --- Clearance (Vaciado) ---

export type ClearanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface WasteReport {
  wood_kg: number
  metal_kg: number
  raee_kg: number // electro residuos
  hazardous_kg: number
  salvaged_kg: number
  landfill_kg: number
}

export interface Clearance {
  id: string
  budget_id: string
  team_id: string
  client_id: string
  status: ClearanceStatus
  scheduled_date: string
  start_time?: string
  end_time?: string
  before_photos: string[]
  after_photos: string[]
  waste_report?: WasteReport
  carbon_saved_kg: number
  final_price: number
  payment_status: 'pending' | 'paid'
  stripe_payment_id?: string
  client_rating?: number // 1-5
  client_feedback?: string
  created_at: string
}

// --- Team ---

export type TeamStatus = 'available' | 'busy' | 'offline'

export interface TeamMember {
  name: string
  phone: string
  role: 'driver' | 'worker'
}

export interface Team {
  id: string
  name: string
  members: TeamMember[]
  vehicle_plate: string
  vehicle_capacity_m3: number
  current_location?: { lat: number; lng: number }
  status: TeamStatus
  rating_avg: number
  total_clearances: number
}

// --- Marketplace ---

export type ItemStatus = 'available' | 'reserved' | 'sold' | 'donated'

export interface MarketplaceItem {
  id: string
  clearance_id: string
  client_id: string // original owner
  name: string
  description: string
  category: string
  condition: 'excellent' | 'good' | 'fair'
  photos: string[]
  ai_generated_description: boolean
  estimated_year?: number
  sale_price: number
  minimum_price: number
  status: ItemStatus
  buyer_id?: string
  commission_rate: number // 0.20
  client_credit: number // sale_price * (1 - commission_rate)
  days_listed: number
  created_at: string
  sold_at?: string
}

// --- B2B Partners ---

export type PartnerPlan = 'starter' | 'pro' | 'enterprise'

export interface B2BPartner {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  api_key: string
  plan: PartnerPlan
  monthly_fee: number
  revenue_share_rate: number // 0.10
  total_clearances: number
  total_revenue: number
  total_commission_paid: number
  active: boolean
  created_at: string
}

// --- AI / Pricing ---

export interface PricingInput {
  photos?: string[] // for vision model
  m2?: number
  floors: number
  has_elevator: boolean
  property_type: 'apartment' | 'house' | 'commercial' | 'storage'
  urgency_days: number // days until preferred date
  location?: { lat: number; lng: number }
  description?: string
}

export interface PricingOutput {
  price_min: number
  price_max: number
  breakdown: BudgetBreakdown
  detected_items: DetectedItem[]
  estimated_duration_hours: number
  confidence: number
  available_dates: string[]
  reasoning: string
}

// --- API Responses ---

export interface ApiResponse<T> {
  data?: T
  error?: string
  code?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
}
