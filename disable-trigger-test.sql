-- Temporarily disable the trigger to test if it's causing the 500 error
-- Run this to disable the trigger, then test registration

-- Step 1: Disable the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 2: Test registration now (try signing up)
-- If registration works without the trigger, then the trigger has an issue

-- Step 3: If registration still fails, the issue is elsewhere
-- Step 4: Re-enable trigger after testing
-- CREATE TRIGGER on_auth_user_created
--     AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
