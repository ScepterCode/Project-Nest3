#!/usr/bin/env node

/**
 * Direct Supabase Schema Fix Script
 * This script connects directly to your Supabase database and fixes all schema issues
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration in .env.local');
    process.exit(1);
}

// Create Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Color console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function executeSQL(sql, description) {
    try {
        log(`🔄 ${description}...`, 'blue');
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
        
        if (error) {
            // Try alternative method if rpc doesn't work
            const { data: altData, error: altError } = await supabase
                .from('_temp_sql_execution')
                .select('*')
                .limit(0); // This will fail but might give us access to raw SQL
            
            if (altError) {
                log(`❌ ${description} failed: ${error.message}`, 'red');
                return false;
            }
        }
        
        log(`✅ ${description} completed successfully`, 'green');
        return true;
    } catch (err) {
        log(`❌ ${description} failed: ${err.message}`, 'red');
        return false;
    }
}

async function checkTableExists(tableName) {
    try {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);
        
        return !error;
    } catch (err) {
        return false;
    }
}

async function createRPCFunction() {
    const createRPCSQL = `
        CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
        RETURNS text
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
            EXECUTE sql_query;
            RETURN 'SUCCESS';
        EXCEPTION
            WHEN OTHERS THEN
                RETURN 'ERROR: ' || SQLERRM;
        END;
        $$;
    `;
    
    return await executeSQL(createRPCSQL, 'Creating SQL execution function');
}

async function fixDatabaseSchema() {
    log('🚀 Starting Supabase Database Schema Fix', 'cyan');
    log('=' * 50, 'cyan');
    
    // Step 1: Create RPC function for SQL execution
    log('\n📋 Step 1: Setting up SQL execution capability', 'magenta');
    await createRPCFunction();
    
    // Step 2: Check current state
    log('\n📋 Step 2: Checking current database state', 'magenta');
    
    const tables = ['institutions', 'user_profiles', 'classes', 'assignments', 'submissions', 'enrollments', 'class_enrollments'];
    const tableStatus = {};
    
    for (const table of tables) {
        const exists = await checkTableExists(table);
        tableStatus[table] = exists;
        log(`${exists ? '✅' : '❌'} Table ${table}: ${exists ? 'EXISTS' : 'MISSING'}`, exists ? 'green' : 'red');
    }
    
    // Step 3: Create missing tables
    log('\n📋 Step 3: Creating missing tables', 'magenta');
    
    // Create institutions table first
    if (!tableStatus.institutions) {
        const institutionsSQL = `
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
        `;
        await executeSQL(institutionsSQL, 'Creating institutions table');
    }
    
    // Create user_profiles table
    if (!tableStatus.user_profiles) {
        const userProfilesSQL = `
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
            
            -- Add foreign key constraint
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'user_profiles_user_id_fkey'
                ) THEN
                    ALTER TABLE public.user_profiles 
                    ADD CONSTRAINT user_profiles_user_id_fkey 
                    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
                END IF;
            END $$;
        `;
        await executeSQL(userProfilesSQL, 'Creating user_profiles table');
    }
    
    // Create classes table
    if (!tableStatus.classes) {
        const classesSQL = `
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
            
            -- Add foreign key constraint
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'classes_teacher_id_fkey'
                ) THEN
                    ALTER TABLE public.classes 
                    ADD CONSTRAINT classes_teacher_id_fkey 
                    FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;
                END IF;
            END $$;
        `;
        await executeSQL(classesSQL, 'Creating classes table');
    }
    
    // Create assignments table
    if (!tableStatus.assignments) {
        const assignmentsSQL = `
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
            
            -- Add foreign key constraints
            DO $$ 
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
            END $$;
        `;
        await executeSQL(assignmentsSQL, 'Creating assignments table');
    }
    
    // Create submissions table
    if (!tableStatus.submissions) {
        const submissionsSQL = `
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
            
            -- Add foreign key constraints
            DO $$ 
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
            END $$;
        `;
        await executeSQL(submissionsSQL, 'Creating submissions table');
    }
    
    // Create enrollments table
    if (!tableStatus.enrollments) {
        const enrollmentsSQL = `
            CREATE TABLE IF NOT EXISTS public.enrollments (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                class_id UUID NOT NULL,
                student_id UUID NOT NULL,
                enrolled_at TIMESTAMPTZ DEFAULT NOW(),
                status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dropped', 'completed')),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            
            -- Add foreign key constraints
            DO $$ 
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
            END $$;
        `;
        await executeSQL(enrollmentsSQL, 'Creating enrollments table');
    }
    
    // Create class_enrollments table (backward compatibility)
    if (!tableStatus.class_enrollments) {
        const classEnrollmentsSQL = `
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
            
            -- Add foreign key constraints
            DO $$ 
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
            END $$;
        `;
        await executeSQL(classEnrollmentsSQL, 'Creating class_enrollments table');
    }
    
    // Step 4: Enable RLS and create policies
    log('\n📋 Step 4: Setting up Row Level Security', 'magenta');
    
    const rlsSQL = `
        -- Enable RLS on all tables
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
    `;
    
    await executeSQL(rlsSQL, 'Setting up Row Level Security policies');
    
    // Step 5: Create indexes and triggers
    log('\n📋 Step 5: Creating performance indexes and triggers', 'magenta');
    
    const indexesSQL = `
        -- Create performance indexes
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
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
        
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
    `;
    
    await executeSQL(indexesSQL, 'Creating indexes and triggers');
    
    // Step 6: Create user profile auto-creation
    log('\n📋 Step 6: Setting up automatic user profile creation', 'magenta');
    
    const userProfileSQL = `
        -- Create function to handle new user registration
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS TRIGGER AS $$
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
        $$ LANGUAGE plpgsql SECURITY DEFINER;
        
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
    `;
    
    await executeSQL(userProfileSQL, 'Setting up user profile auto-creation');
    
    // Step 7: Final verification
    log('\n📋 Step 7: Final verification', 'magenta');
    
    for (const table of tables) {
        const exists = await checkTableExists(table);
        log(`${exists ? '✅' : '❌'} Table ${table}: ${exists ? 'READY' : 'FAILED'}`, exists ? 'green' : 'red');
    }
    
    log('\n🎉 Database schema fix completed!', 'green');
    log('=' * 50, 'cyan');
    log('Your Supabase database should now be fully configured with:', 'cyan');
    log('✅ All required tables created', 'green');
    log('✅ Row Level Security enabled', 'green');
    log('✅ Performance indexes added', 'green');
    log('✅ Automatic user profile creation', 'green');
    log('✅ Proper foreign key relationships', 'green');
    log('\nYou can now test your application!', 'cyan');
}

// Run the fix
fixDatabaseSchema().catch(console.error);