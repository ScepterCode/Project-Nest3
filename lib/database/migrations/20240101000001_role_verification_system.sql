-- Role Verification System Migration
-- Creates tables for institutional affiliation verification workflows

-- Verification requests table
CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  requested_role VARCHAR NOT NULL,
  verification_method VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  justification TEXT,
  submitted_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by UUID REFERENCES users(id),
  review_notes TEXT,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Verification evidence table
CREATE TABLE IF NOT EXISTS verification_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID REFERENCES verification_requests(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL CHECK (type IN ('document', 'email', 'reference', 'other')),
  description TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Institution domain verification table (enhanced)
CREATE TABLE IF NOT EXISTS institution_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  domain VARCHAR NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  auto_approve_roles VARCHAR[] DEFAULT '{}',
  verification_token VARCHAR,
  verification_method VARCHAR DEFAULT 'dns', -- 'dns', 'file', 'email'
  verified_at TIMESTAMP,
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain)
);

-- Verification reviewers table
CREATE TABLE IF NOT EXISTS verification_reviewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  institution_id UUID REFERENCES institutions(id) NOT NULL,
  can_review_roles VARCHAR[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, institution_id)
);

-- Verification status tracking table
CREATE TABLE IF NOT EXISTS verification_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID REFERENCES verification_requests(id) ON DELETE CASCADE,
  status VARCHAR NOT NULL,
  changed_by UUID REFERENCES users(id),
  reason TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_requests_user_id ON verification_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_institution_id ON verification_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_requests_expires_at ON verification_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_evidence_request_id ON verification_evidence(verification_request_id);
CREATE INDEX IF NOT EXISTS idx_institution_domains_domain ON institution_domains(domain);
CREATE INDEX IF NOT EXISTS idx_institution_domains_institution_id ON institution_domains(institution_id);
CREATE INDEX IF NOT EXISTS idx_verification_reviewers_user_id ON verification_reviewers(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_reviewers_institution_id ON verification_reviewers(institution_id);
CREATE INDEX IF NOT EXISTS idx_verification_status_log_request_id ON verification_status_log(verification_request_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_verification_requests_updated_at 
  BEFORE UPDATE ON verification_requests 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_institution_domains_updated_at 
  BEFORE UPDATE ON institution_domains 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();