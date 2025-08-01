# Role Access Debug Tools Created

## 🔧 **Debug Tools Available**

I've created comprehensive debugging tools to help identify and fix the role access issues:

### **1. Role Debug Component** (`/debug` page)
- **Location**: Visit `http://localhost:3000/debug`
- **Features**:
  - Shows auth user metadata vs database user record
  - Tests role gate logic for all roles
  - Identifies specific issues with role detection
  - Provides clear recommendations

### **2. Role Assignment Tool** (`/debug` page)
- **Location**: Same debug page, below role debug info
- **Features**:
  - Allows manual role assignment for testing
  - Creates user profile if missing
  - Updates existing user role
  - Immediate feedback on success/failure

## 🎯 **How to Use**

### **Step 1: Check Current Status**
1. Go to `http://localhost:3000/debug`
2. Look at the "Role Debug Information" section
3. Check if:
   - User exists in database
   - User has correct role assigned
   - Role gate tests are passing

### **Step 2: Fix Role Issues**
If you see issues, use the "Role Assignment Tool":
1. Select "Teacher" from the dropdown
2. Click "Assign Role"
3. Refresh the page after success message

### **Step 3: Test Access**
After fixing the role:
1. Go to teacher dashboard: `/dashboard/teacher`
2. Try accessing create features:
   - `/dashboard/teacher/classes/create`
   - `/dashboard/teacher/assignments/create`
   - `/dashboard/teacher/rubrics/create`

## 🔍 **Common Issues & Solutions**

### **Issue 1: No Database User Record**
- **Symptom**: "No user record found in database"
- **Solution**: Use Role Assignment Tool to create profile
- **Cause**: Database trigger not working or user created before trigger

### **Issue 2: Wrong Role in Database**
- **Symptom**: Role shows as "student" but you need "teacher"
- **Solution**: Use Role Assignment Tool to update role to "teacher"
- **Cause**: Role was set incorrectly during onboarding

### **Issue 3: Role Gate Tests Failing**
- **Symptom**: All role tests show "✗ Fail"
- **Solution**: Check database connection and user profile
- **Cause**: Database not accessible or user profile missing

### **Issue 4: Permission Gates Not Working**
- **Symptom**: Teacher features still not accessible
- **Solution**: Refresh page after role assignment
- **Cause**: Role cached in browser, needs refresh

## 📝 **Expected Debug Output**

### **Healthy Teacher User:**
```
Auth User Metadata:
- Metadata Role: teacher (or any role)

Database User Record:
- Database Role: teacher ✓
- Onboarding Complete: Yes

Role Gate Tests:
- Student: ✗ Fail
- Teacher: ✓ Pass  ← This should be green
- Department Admin: ✗ Fail
- Institution Admin: ✗ Fail
```

### **Problem User:**
```
Database User Record:
- Error: No user record found ← Issue here

OR

Database User Record:
- Database Role: student ← Wrong role
```

## 🚀 **Quick Fix Steps**

1. **Visit Debug Page**: `http://localhost:3000/debug`
2. **Check Role Status**: Look for red errors or wrong roles
3. **Assign Teacher Role**: Use the role assignment tool
4. **Refresh Page**: After successful assignment
5. **Test Access**: Try creating classes/assignments

The debug tools will show you exactly what's wrong and provide a one-click fix for role issues!