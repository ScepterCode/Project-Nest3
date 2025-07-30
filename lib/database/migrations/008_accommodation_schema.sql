-- Student accommodations and accessibility support
CREATE TABLE student_accommodations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  accommodation_type VARCHAR NOT NULL, -- 'mobility', 'visual', 'hearing', 'cognitive', 'other'
  description TEXT NOT NULL,
  documentation_verified BOOLEAN DEFAULT FALSE,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMP,
  priority_level INTEGER DEFAULT 1, -- 1=low, 2=medium, 3=high
  active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Class accessibility features and limitations
CREATE TABLE class_accessibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) NOT NULL,
  accessibility_type VARCHAR NOT NULL, -- 'wheelchair_accessible', 'hearing_loop', 'visual_aids', 'quiet_environment'
  available BOOLEAN DEFAULT TRUE,
  description TEXT,
  alternative_arrangements TEXT,
  contact_info TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(class_id, accessibility_type)
);

-- Accommodation requests for specific enrollments
CREATE TABLE enrollment_accommodations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID REFERENCES enrollments(id),
  enrollment_request_id UUID REFERENCES enrollment_requests(id),
  student_id UUID REFERENCES users(id) NOT NULL,
  class_id UUID REFERENCES classes(id) NOT NULL,
  accommodation_id UUID REFERENCES student_accommodations(id) NOT NULL,
  status VARCHAR DEFAULT 'pending', -- 'pending', 'approved', 'denied', 'implemented'
  requested_arrangements TEXT,
  approved_arrangements TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  implementation_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Reserved capacity for students with accommodations
CREATE TABLE accommodation_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES classes(id) NOT NULL,
  accommodation_type VARCHAR NOT NULL,
  reserved_spots INTEGER DEFAULT 1,
  used_spots INTEGER DEFAULT 0,
  expires_at TIMESTAMP,
  created_by UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Communication log for accommodation coordination
CREATE TABLE accommodation_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_accommodation_id UUID REFERENCES enrollment_accommodations(id) NOT NULL,
  sender_id UUID REFERENCES users(id) NOT NULL,
  recipient_id UUID REFERENCES users(id) NOT NULL,
  message TEXT NOT NULL,
  communication_type VARCHAR DEFAULT 'general', -- 'general', 'urgent', 'follow_up', 'resolution'
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_student_accommodations_student_id ON student_accommodations(student_id);
CREATE INDEX idx_student_accommodations_active ON student_accommodations(active) WHERE active = TRUE;
CREATE INDEX idx_class_accessibility_class_id ON class_accessibility(class_id);
CREATE INDEX idx_enrollment_accommodations_student_class ON enrollment_accommodations(student_id, class_id);
CREATE INDEX idx_enrollment_accommodations_status ON enrollment_accommodations(status);
CREATE INDEX idx_accommodation_reservations_class_id ON accommodation_reservations(class_id);
CREATE INDEX idx_accommodation_communications_enrollment ON accommodation_communications(enrollment_accommodation_id);