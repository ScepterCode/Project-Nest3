# 🗄️ **SUPABASE DATABASE MIGRATIONS**

## 🎯 **ESSENTIAL MIGRATIONS (MINIMUM REQUIRED)**

Run these **3 core migrations** in your Supabase SQL Editor in **exact order**:

### **1. Foundation: User & Institution Setup**
**File:** `lib/database/migrations/001_onboarding_schema.sql`
- Creates `institutions` and `departments` tables
- Adds onboarding fields to users
- Sets up basic relationships
- Includes demo data for testing

### **2. Role Management System**
**File:** `lib/database/migrations/018_enhanced_role_management_schema.sql`
- Creates comprehensive role system
- Adds permissions and role assignments
- Sets up audit logging
- Includes default permissions

### **3. Class Enrollment System**
**File:** `lib/database/migrations/004_enrollment_schema.sql`
- Creates enrollment and waitlist tables
- Adds class capacity management
- Sets up enrollment workflows
- Includes audit trails

## 🚀 **HOW TO RUN MIGRATIONS**

### **Step 1: Access Supabase SQL Editor**
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **"SQL Editor"** in the sidebar
4. Click **"New Query"**

### **Step 2: Run Each Migration**
1. **Copy the entire content** of migration file `001_onboarding_schema.sql`
2. **Paste it** into the SQL Editor
3. **Click "Run"** button
4. **Wait for completion** (should see "Success" message)
5. **Repeat for files** `018_enhanced_role_management_schema.sql` and `004_enrollment_schema.sql`

### **Step 3: Verify Setup**
Run this query to verify tables were created:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see tables like:
- `institutions`
- `departments` 
- `user_role_assignments`
- `enrollments`
- `permissions`
- And many more...

## 🎯 **OPTIONAL ADDITIONAL MIGRATIONS**

After the core 3 migrations work, you can optionally add:

### **Analytics & Reporting**
- `002_onboarding_analytics_schema.sql`
- `006_enrollment_analytics_schema.sql`

### **Advanced Features**
- `008_accommodation_schema.sql` (Accessibility)
- `009_realtime_enrollment_functions.sql` (Real-time updates)
- `011_fraud_prevention_schema.sql` (Security)

### **Compliance & Audit**
- `010_audit_compliance_schema.sql`
- `20240127_create_comprehensive_audit_log.sql`

## 🚨 **TROUBLESHOOTING**

### **If Migration Fails**
- Check for syntax errors in the SQL
- Ensure you're running migrations in order
- Look for foreign key constraint errors
- Check Supabase logs for detailed error messages

### **Common Issues**
1. **"Table already exists"** - Safe to ignore, migrations use `IF NOT EXISTS`
2. **"Foreign key constraint fails"** - Run migrations in correct order
3. **"Permission denied"** - Ensure you're using the correct Supabase project

### **Reset Database (If Needed)**
If you need to start fresh:
1. Go to **Settings** → **Database**
2. Click **"Reset Database"** (⚠️ This deletes all data!)
3. Re-run all migrations

## ✅ **VERIFICATION CHECKLIST**

After running migrations, verify:
- [ ] Tables created successfully
- [ ] Demo institutions exist (`SELECT * FROM institutions;`)
- [ ] Permissions are set up (`SELECT * FROM permissions;`)
- [ ] No error messages in Supabase logs
- [ ] Your app can connect to database

## 🎯 **NEXT STEPS**

After migrations are complete:
1. **Update your `.env.local`** with Supabase credentials
2. **Run your app locally**: `npm run dev`
3. **Test user registration** and onboarding
4. **Verify role assignments** work
5. **Test class enrollment** features

**🚀 Your database will be fully functional after these 3 core migrations!**