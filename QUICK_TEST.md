# Quick Test Guide

## 1. Check Debug Page
Visit: `http://localhost:3000/debug`

This will show you:
- Authentication status
- Database connection
- User profile data
- Environment variables

## 2. Test Authentication Flow

### Sign Up Test:
1. Go to `http://localhost:3000/auth/sign-up`
2. Create a new account
3. Check if user profile is created automatically
4. Verify onboarding flow works

### Login Test:
1. Go to `http://localhost:3000/auth/login`
2. Login with existing account
3. Check if redirected to appropriate dashboard
4. Verify role-based navigation works

## 3. Database Setup (If Needed)

If you see database errors, run this SQL in Supabase:

```sql
-- Copy and paste from setup-database-minimal.sql
```

## 4. Expected Behavior

✅ **Working**: Role-based navigation should show/hide based on user role
✅ **Working**: Permission gates should allow access (simplified version)
✅ **Working**: User profiles should be created automatically on signup
✅ **Working**: Onboarding should work for new users

## 5. Common Issues

❌ **Database not set up**: Run the SQL setup script
❌ **Environment variables**: Check .env.local file
❌ **User profile missing**: Database trigger not working
❌ **Permission errors**: Should be fixed with simple permission checker

## 6. Production Readiness

Once all tests pass:
1. Run `npm run build` to test production build
2. Deploy to your hosting platform
3. Update environment variables for production
4. Test the production deployment