# Testing Strategy for Supabase Integration

## The Problem

Supabase uses ES modules and native dependencies that don't work well in Jest's Node.js environment. This causes import errors when testing components that use Supabase.

## Our Solution

We use a **layered testing approach** that separates concerns:

### 1. **Pure Logic Testing** ✅
Test business logic without Supabase dependencies:
- `__tests__/lib/types/onboarding.test.ts` - Type definitions and enums
- `__tests__/lib/utils/onboarding-logic.test.ts` - Pure functions
- `__tests__/contexts/onboarding-context.test.ts` - Context logic

### 2. **Mocked Integration Testing** ✅
Test components with mocked Supabase:
- Use `__tests__/__mocks__/supabase.ts` for consistent mocking
- Test component behavior without real database calls
- Validate error handling and edge cases

### 3. **E2E Testing** (Future)
For full integration testing:
- Use Playwright or Cypress for browser-based tests
- Test real Supabase integration in browser environment
- Validate complete user flows

## Testing Patterns

### ✅ Good: Test Pure Logic
```typescript
// Test business logic without dependencies
describe('Onboarding Logic', () => {
  it('should validate user data correctly', () => {
    const result = validateOnboardingData(mockData);
    expect(result.isValid).toBe(true);
  });
});
```

### ✅ Good: Test with Mocks
```typescript
// Mock Supabase and test component behavior
jest.mock('@/lib/supabase/client');

describe('OnboardingComponent', () => {
  it('should handle loading states', () => {
    // Test component with mocked Supabase
  });
});
```

### ❌ Avoid: Direct Supabase Imports in Jest
```typescript
// This will cause ES module errors
import { onboardingService } from '@/lib/services/onboarding';
```

## Benefits of This Approach

1. **Fast Tests**: Pure logic tests run quickly without database overhead
2. **Reliable**: Mocked tests don't depend on external services
3. **Comprehensive**: We can test error scenarios easily with mocks
4. **Maintainable**: Clear separation between logic and integration

## When to Use Each Type

- **Pure Logic Tests**: Business rules, calculations, validations
- **Mocked Integration Tests**: Component behavior, error handling
- **E2E Tests**: Critical user flows, real integration validation

## Running Tests

```bash
# Run all tests
npm test

# Run specific test files
npm test -- __tests__/lib/utils/onboarding-logic.test.ts

# Run with coverage
npm test -- --coverage
```

## Future Improvements

1. **Vitest Migration**: Consider migrating to Vitest for better ES module support
2. **MSW Integration**: Use Mock Service Worker for more realistic API mocking
3. **Component Testing**: Add React Testing Library tests for UI components
4. **E2E Setup**: Implement Playwright for full integration testing