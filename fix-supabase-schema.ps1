# PowerShell script to fix Supabase schema
# Run this with: powershell -ExecutionPolicy Bypass -File fix-supabase-schema.ps1

Write-Host "🚀 Supabase Schema Fix Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if .env.local exists
if (-not (Test-Path ".env.local")) {
    Write-Host "❌ .env.local file not found" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Environment file found" -ForegroundColor Green

# Install required packages if not present
Write-Host "📦 Checking dependencies..." -ForegroundColor Blue

if (-not (Test-Path "node_modules/@supabase/supabase-js")) {
    Write-Host "Installing @supabase/supabase-js..." -ForegroundColor Yellow
    npm install @supabase/supabase-js
}

if (-not (Test-Path "node_modules/dotenv")) {
    Write-Host "Installing dotenv..." -ForegroundColor Yellow
    npm install dotenv
}

Write-Host "✅ Dependencies ready" -ForegroundColor Green

# Method 1: Try the Node.js script
Write-Host "`n🔧 Method 1: Attempting automated fix..." -ForegroundColor Blue
try {
    node run-schema-fix.js
    Write-Host "✅ Automated fix completed!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Automated fix failed, trying alternative method..." -ForegroundColor Yellow
    
    # Method 2: Manual SQL execution guide
    Write-Host "`n🔧 Method 2: Manual SQL execution required" -ForegroundColor Blue
    Write-Host "Please follow these steps:" -ForegroundColor Yellow
    Write-Host "1. Open your Supabase dashboard" -ForegroundColor White
    Write-Host "2. Go to SQL Editor" -ForegroundColor White
    Write-Host "3. Copy and paste the following files in order:" -ForegroundColor White
    Write-Host "   a) minimal-schema-fix.sql" -ForegroundColor Cyan
    Write-Host "   b) add-rls-policies.sql" -ForegroundColor Cyan
    Write-Host "   c) add-indexes-triggers.sql" -ForegroundColor Cyan
    Write-Host "4. Run each file separately" -ForegroundColor White
    
    # Create a combined SQL file for easy copy-paste
    Write-Host "`n📝 Creating combined SQL file..." -ForegroundColor Blue
    
    $combinedSQL = @"
-- SUPABASE SCHEMA FIX - COMBINED SQL
-- Copy and paste this entire content into Supabase SQL Editor

-- Step 1: Create basic tables
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Default Institution',
    domain TEXT DEFAULT 'example.com',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.institutions (name, domain, status) 
VALUES ('Default Institution', 'example.com', 'active')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'institution_admin')),
    institution_id UUID REFERENCES institutions(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO `$`$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_profiles_user_id_fkey'
    ) THEN
        ALTER TABLE public.user_profiles 
        ADD CONSTRAINT user_profiles_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END `$`$;

CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    code TEXT UNIQUE NOT NULL,
    teacher_id UUID NOT NULL,
    institution_id UUID REFERENCES institutions(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO `$`$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'classes_teacher_id_fkey'
    ) THEN
        ALTER TABLE public.classes 
        ADD CONSTRAINT classes_teacher_id_fkey 
        FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END `$`$;

CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    class_id UUID NOT NULL,
    teacher_id UUID NOT NULL,
    due_date TIMESTAMPTZ,
    points_possible INTEGER DEFAULT 100,
    assignment_type TEXT DEFAULT 'assignment',
    status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
    instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO `$`$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'assignments_class_id_fkey'
    ) THEN
        ALTER TABLE public.assignments 
        ADD CONSTRAINT assignments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'assignments_teacher_id_fkey'
    ) THEN
        ALTER TABLE public.assignments 
        ADD CONSTRAINT assignments_teacher_id_fkey 
        FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END `$`$;

CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL,
    student_id UUID NOT NULL,
    content TEXT,
    file_url TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'graded', 'returned')),
    grade DECIMAL(5,2),
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO `$`$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_assignment_id_fkey'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_assignment_id_fkey 
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_student_id_fkey'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'submissions_assignment_student_unique'
    ) THEN
        ALTER TABLE public.submissions 
        ADD CONSTRAINT submissions_assignment_student_unique 
        UNIQUE (assignment_id, student_id);
    END IF;
END `$`$;

CREATE TABLE IF NOT EXISTS public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dropped', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO `$`$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_class_id_fkey'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_student_id_fkey'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'enrollments_class_student_unique'
    ) THEN
        ALTER TABLE public.enrollments 
        ADD CONSTRAINT enrollments_class_student_unique 
        UNIQUE (class_id, student_id);
    END IF;
END `$`$;

CREATE TABLE IF NOT EXISTS public.class_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL,
    user_id UUID NOT NULL,
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dropped', 'completed')),
    role TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'assistant')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO `$`$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'class_enrollments_class_id_fkey'
    ) THEN
        ALTER TABLE public.class_enrollments 
        ADD CONSTRAINT class_enrollments_class_id_fkey 
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'class_enrollments_user_id_fkey'
    ) THEN
        ALTER TABLE public.class_enrollments 
        ADD CONSTRAINT class_enrollments_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'class_enrollments_class_user_unique'
    ) THEN
        ALTER TABLE public.class_enrollments 
        ADD CONSTRAINT class_enrollments_class_user_unique 
        UNIQUE (class_id, user_id);
    END IF;
END `$`$;

-- Step 2: Enable RLS and create policies
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Everyone can view institutions" ON public.institutions;
DROP POLICY IF EXISTS "Users can view and update their own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Teachers can manage their own classes" ON public.classes;
DROP POLICY IF EXISTS "Students can view enrolled classes" ON public.classes;
DROP POLICY IF EXISTS "Teachers can manage their own assignments" ON public.assignments;
DROP POLICY IF EXISTS "Students can view assignments from enrolled classes" ON public.assignments;
DROP POLICY IF EXISTS "Students can manage their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Teachers can view submissions for their assignments" ON public.submissions;
DROP POLICY IF EXISTS "Teachers can update grades for their assignments" ON public.submissions;
DROP POLICY IF EXISTS "Students can view their own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can view enrollments for their classes" ON public.enrollments;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Users can view their own class enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Teachers can view class enrollments" ON public.class_enrollments;
DROP POLICY IF EXISTS "Users can enroll in classes" ON public.class_enrollments;

-- Create RLS policies
CREATE POLICY "Everyone can view institutions" ON public.institutions FOR SELECT USING (true);
CREATE POLICY "Users can view and update their own profile" ON public.user_profiles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Teachers can manage their own classes" ON public.classes FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Students can view enrolled classes" ON public.classes FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM enrollments 
        WHERE class_id = classes.id 
        AND student_id = auth.uid() 
        AND status = 'active'
    )
    OR EXISTS (
        SELECT 1 FROM class_enrollments 
        WHERE class_id = classes.id 
        AND user_id = auth.uid() 
        AND status = 'active'
    )
);
CREATE POLICY "Teachers can manage their own assignments" ON public.assignments FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Students can view assignments from enrolled classes" ON public.assignments FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.class_id = assignments.class_id
        AND e.student_id = auth.uid()
        AND e.status = 'active'
    )
    OR EXISTS (
        SELECT 1 FROM class_enrollments ce
        WHERE ce.class_id = assignments.class_id
        AND ce.user_id = auth.uid()
        AND ce.status = 'active'
    )
);
CREATE POLICY "Students can manage their own submissions" ON public.submissions FOR ALL USING (auth.uid() = student_id);
CREATE POLICY "Teachers can view submissions for their assignments" ON public.submissions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.id = submissions.assignment_id
        AND a.teacher_id = auth.uid()
    )
);
CREATE POLICY "Teachers can update grades for their assignments" ON public.submissions FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM assignments a
        WHERE a.id = submissions.assignment_id
        AND a.teacher_id = auth.uid()
    )
);
CREATE POLICY "Students can view their own enrollments" ON public.enrollments FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Teachers can view enrollments for their classes" ON public.enrollments FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = enrollments.class_id
        AND c.teacher_id = auth.uid()
    )
);
CREATE POLICY "Students can enroll themselves" ON public.enrollments FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Users can view their own class enrollments" ON public.class_enrollments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Teachers can view class enrollments" ON public.class_enrollments FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM classes c
        WHERE c.id = class_enrollments.class_id
        AND c.teacher_id = auth.uid()
    )
);
CREATE POLICY "Users can enroll in classes" ON public.class_enrollments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Step 3: Create indexes and triggers
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_code ON public.classes(code);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON public.assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON public.assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON public.assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON public.submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON public.enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_class_id ON public.class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_class_enrollments_user_id ON public.class_enrollments(user_id);

-- Create function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS `$`$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
`$`$ language 'plpgsql';

-- Create triggers for updated_at columns
DROP TRIGGER IF EXISTS update_institutions_updated_at ON public.institutions;
CREATE TRIGGER update_institutions_updated_at BEFORE UPDATE ON public.institutions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_classes_updated_at ON public.classes;
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_assignments_updated_at ON public.assignments;
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_submissions_updated_at ON public.submissions;
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON public.submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_enrollments_updated_at ON public.enrollments;
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON public.enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_class_enrollments_updated_at ON public.class_enrollments;
CREATE TRIGGER update_class_enrollments_updated_at BEFORE UPDATE ON public.class_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 4: Create user profile auto-creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS `$`$
BEGIN
    INSERT INTO public.user_profiles (user_id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
`$`$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migrate existing users to user_profiles
INSERT INTO public.user_profiles (user_id, email, first_name, last_name)
SELECT 
    id,
    email,
    COALESCE(raw_user_meta_data->>'first_name', ''),
    COALESCE(raw_user_meta_data->>'last_name', '')
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_profiles)
ON CONFLICT (user_id) DO NOTHING;
"@

    $combinedSQL | Out-File -FilePath "COMPLETE_SCHEMA_FIX.sql" -Encoding UTF8
    Write-Host "✅ Created COMPLETE_SCHEMA_FIX.sql" -ForegroundColor Green
    Write-Host "📋 Copy and paste the contents of COMPLETE_SCHEMA_FIX.sql into your Supabase SQL Editor" -ForegroundColor Cyan
}

Write-Host "`n🎉 Schema fix process completed!" -ForegroundColor Green
Write-Host "Your database should now be ready for the learning management system." -ForegroundColor Cyan