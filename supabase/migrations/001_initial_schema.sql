-- ============================================================
-- TRAPERIA — Initial Schema
-- Migration: 001_initial_schema
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- for GPS coordinates

-- ---- Clients ----

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'whatsapp', 'api', 'referral')),
  partner_id UUID, -- B2B partner reference (added FK after b2b_partners table)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_phone ON clients(phone);

-- ---- B2B Partners ----

CREATE TABLE b2b_partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL UNIQUE,
  contact_phone TEXT,
  api_key TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  revenue_share_rate DECIMAL(4,3) NOT NULL DEFAULT 0.10,
  total_clearances INTEGER NOT NULL DEFAULT 0,
  total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_commission_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK for clients.partner_id
ALTER TABLE clients
  ADD CONSTRAINT fk_clients_partner
  FOREIGN KEY (partner_id) REFERENCES b2b_partners(id);

-- ---- Teams ----

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  members JSONB NOT NULL DEFAULT '[]', -- [{name, phone, role}]
  vehicle_plate TEXT NOT NULL,
  vehicle_capacity_m3 DECIMAL(5,1) NOT NULL DEFAULT 20,
  current_location GEOGRAPHY(POINT, 4326),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'busy', 'offline')),
  rating_avg DECIMAL(3,2) NOT NULL DEFAULT 0,
  total_clearances INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Budgets ----

CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id),
  property_address TEXT NOT NULL,
  property_m2 INTEGER,
  floors INTEGER NOT NULL DEFAULT 1,
  has_elevator BOOLEAN,
  photos TEXT[] NOT NULL DEFAULT '{}',
  ai_detected_items JSONB NOT NULL DEFAULT '[]',
  ai_confidence DECIMAL(3,2) NOT NULL DEFAULT 0,
  price_min DECIMAL(10,2) NOT NULL,
  price_max DECIMAL(10,2) NOT NULL,
  breakdown JSONB NOT NULL DEFAULT '{}',
  estimated_duration_hours DECIMAL(4,1),
  carbon_saved_kg DECIMAL(8,2),
  status TEXT NOT NULL DEFAULT 'analyzing'
    CHECK (status IN ('analyzing', 'ready', 'sent', 'approved', 'rejected', 'expired')),
  scheduled_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX idx_budgets_client ON budgets(client_id);
CREATE INDEX idx_budgets_status ON budgets(status);
CREATE INDEX idx_budgets_created ON budgets(created_at DESC);

-- ---- Clearances (Vaciados) ----

CREATE TABLE clearances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID NOT NULL REFERENCES budgets(id),
  team_id UUID REFERENCES teams(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  before_photos TEXT[] NOT NULL DEFAULT '{}',
  after_photos TEXT[] NOT NULL DEFAULT '{}',
  waste_report JSONB, -- {wood_kg, metal_kg, raee_kg, hazardous_kg, salvaged_kg, landfill_kg}
  carbon_saved_kg DECIMAL(8,2),
  final_price DECIMAL(10,2),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  stripe_payment_id TEXT,
  client_rating INTEGER CHECK (client_rating BETWEEN 1 AND 5),
  client_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clearances_team ON clearances(team_id);
CREATE INDEX idx_clearances_status ON clearances(status);
CREATE INDEX idx_clearances_date ON clearances(scheduled_date);

-- ---- Marketplace Items ----

CREATE TABLE marketplace_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clearance_id UUID NOT NULL REFERENCES clearances(id),
  client_id UUID NOT NULL REFERENCES clients(id), -- original owner
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('excellent', 'good', 'fair')),
  photos TEXT[] NOT NULL DEFAULT '{}',
  ai_generated_description BOOLEAN NOT NULL DEFAULT false,
  estimated_year INTEGER,
  sale_price DECIMAL(10,2) NOT NULL,
  minimum_price DECIMAL(10,2) NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'reserved', 'sold', 'donated')),
  buyer_id UUID REFERENCES clients(id),
  commission_rate DECIMAL(4,3) NOT NULL DEFAULT 0.20,
  client_credit DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at TIMESTAMPTZ,
  days_listed INTEGER GENERATED ALWAYS AS (
    EXTRACT(DAY FROM NOW() - created_at)::INTEGER
  ) STORED
);

CREATE INDEX idx_marketplace_status ON marketplace_items(status);
CREATE INDEX idx_marketplace_clearance ON marketplace_items(clearance_id);
CREATE INDEX idx_marketplace_category ON marketplace_items(category);

-- ---- Carbon Reports ----

CREATE TABLE carbon_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clearance_id UUID NOT NULL UNIQUE REFERENCES clearances(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  kg_co2_saved DECIMAL(8,2) NOT NULL,
  equivalent_trees INTEGER NOT NULL,
  equivalent_km_car DECIMAL(10,2) NOT NULL,
  percentile INTEGER, -- vs all traperia clients
  reuse_percentage DECIMAL(5,2),
  certificate_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- Row Level Security ----

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_items ENABLE ROW LEVEL SECURITY;

-- Public can read marketplace items
CREATE POLICY "marketplace_public_read"
  ON marketplace_items FOR SELECT
  USING (status = 'available');

-- Service role has full access (for API routes)
-- Configured via Supabase service role key in env
