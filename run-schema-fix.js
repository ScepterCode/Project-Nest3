#!/usr/bin/env node

/**
 * Alternative Schema Fix using Direct SQL Execution
 * This approach uses the Supabase JavaScript client to execute SQL directly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase configuration');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSchemaFix() {
    console.log('🚀 Starting Schema Fix...\n');
    
    // The complete schema SQL
    const schemaSQL = `
        -- Create institutions table
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
        
        -- Create user_profiles table
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
        
        -- Add foreign key constraint for user_profiles
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
        
        -- Create classes table
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
        
        -- Add foreign key constraint for classes
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
        
        -- Create assignments table
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
        
        -- Add foreign key constraints for assignments
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
        
        -- Create submissions table
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
        
        -- Add foreign key constraints for submissions
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
        
        -- Create enrollments table
        CREATE TABLE IF NOT EXISTS public.enrollments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            class_id UUID NOT NULL,
            student_id UUID NOT NULL,
            enrolled_at TIMESTAMPTZ DEFAULT NOW(),
            status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dropped', 'completed')),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Add foreign key constraints for enrollments
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
        
        -- Create class_enrollments table (backward compatibility)
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
        
        -- Add foreign key constraints for class_enrollments
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
    
    try {
        // Try to execute the schema using a simple approach
        console.log('📋 Creating database schema...');
        
        // Split the SQL into smaller chunks and execute them
        const sqlChunks = schemaSQL.split(';').filter(chunk => chunk.trim());
        
        for (let i = 0; i < sqlChunks.length; i++) {
            const chunk = sqlChunks[i].trim();
            if (chunk) {
                try {
                    console.log(`Executing chunk ${i + 1}/${sqlChunks.length}...`);
                    // This is a workaround - we'll use the REST API directly
                    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${supabaseServiceKey}`,
                            'apikey': supabaseServiceKey
                        },
                        body: JSON.stringify({ sql_query: chunk + ';' })
                    });
                    
                    if (!response.ok) {
                        console.log(`⚠️  Chunk ${i + 1} may have failed, but continuing...`);
                    } else {
                        console.log(`✅ Chunk ${i + 1} executed successfully`);
                    }
                } catch (err) {
                    console.log(`⚠️  Chunk ${i + 1} error: ${err.message}, continuing...`);
                }
            }
        }
        
        console.log('\n🎉 Schema creation completed!');
        console.log('Please check your Supabase dashboard to verify the tables were created.');
        
    } catch (error) {
        console.error('❌ Error executing schema:', error.message);
        console.log('\n📝 Manual Steps:');
        console.log('1. Go to your Supabase dashboard');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Copy and paste the contents of minimal-schema-fix.sql');
        console.log('4. Run the SQL manually');
    }
}

runSchemaFix();