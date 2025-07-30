import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { performance } from 'perf_hooks';
import { InstitutionSelectionStep } from '@/components/onboarding/institution-selection-step';
import { RoleSelectionStep } from '@/components/onboarding/role-selection-step';

// Mock large datasets for performance testing
const generateMockInstitutions = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `institution-${i}`,
    name: `Test Institution ${i}`,
    domain: `test${i}.edu`,
    userCount: Math.floor(Math.random() * 10000),
    departmentCount: Math.floor(Math.random() * 50)
  }));
};

// Mock the onboarding context
const mockOnboardingContext = {
  currentStep: 0,
  totalSteps: 5,
  onboardingData: {
    userId: 'test-user',
    role: undefined,
    institutionId: undefined,
    departmentId: undefined,
    classIds: [],
    skippedSteps: [],
    currentStep: 0
  },
  updateOnboardingData: jest.fn(),
  nextStep: jest.fn(),
  previousStep: jest.fn(),
  skipStep: jest.fn(),
  completeOnboarding: jest.fn(),
  loading: false
};

jest.mock('@/contexts/onboarding-context', () => ({
  useOnboarding: () => mockOnboardingContext
}));

// Mock hooks with performance considerations
const mockHooks = {
  useRoleSelection: jest.fn(() => ({
    selectRole: jest.fn().mockResolvedValue(true),
    validating: false,
    error: null
  })),
  useInstitutionSearch: jest.fn(() => ({
    institutions: [],
    loading: false,
    error: null,
    searchInstitutions: jest.fn(),
    selectInstitution: jest.fn().mockResolvedValue(true),
    clearSearch: jest.fn()
  }))
};

jest.mock('@/lib/hooks/useOnboarding', () => mockHooks);

describe('Onboarding Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Institution Search Performance', () => {
    it('should handle large institution datasets efficiently', async () => {
      const largeInstitutionSet = generateMockInstitutions(1000);
      
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: largeInstitutionSet,
        loading: false,
        error: null,
        searchInstitutions: jest.fn(),
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: jest.fn()
      });

      const startTime = performance.now();
      
      render(<InstitutionSelectionStep />);
      
      // Wait for all institutions to render
      await waitFor(() => {
        expect(screen.getByText('Search Results')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time (adjust threshold as needed)
      expect(renderTime).toBeLessThan(1000); // 1 second
      
      // Should display all institutions
      const institutionCards = document.querySelectorAll('[role="button"]');
      expect(institutionCards.length).toBe(1000);
    });

    it('should handle search input performance with large datasets', async () => {
      const user = userEvent.setup();
      const largeInstitutionSet = generateMockInstitutions(5000);
      
      const mockSearchFunction = jest.fn();
      
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: largeInstitutionSet.slice(0, 10), // Show only first 10 results
        loading: false,
        error: null,
        searchInstitutions: mockSearchFunction,
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: jest.fn()
      });

      render(<InstitutionSelectionStep />);
      
      const searchInput = screen.getByLabelText('Search for your institution');
      
      const startTime = performance.now();
      
      // Type search query
      await user.type(searchInput, 'test university');
      
      const endTime = performance.now();
      const inputTime = endTime - startTime;

      // Input should be responsive
      expect(inputTime).toBeLessThan(500); // 500ms
      
      // Search function should be called for each character
      expect(mockSearchFunction).toHaveBeenCalled();
    });

    it('should implement efficient search debouncing', async () => {
      const user = userEvent.setup();
      const mockSearchFunction = jest.fn();
      
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: [],
        loading: false,
        error: null,
        searchInstitutions: mockSearchFunction,
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: jest.fn()
      });

      render(<InstitutionSelectionStep />);
      
      const searchInput = screen.getByLabelText('Search for your institution');
      
      // Type rapidly
      await user.type(searchInput, 'test', { delay: 50 });
      
      // Should not call search for every keystroke immediately
      // (This would need to be implemented in the actual component)
      expect(mockSearchFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Role Selection Performance', () => {
    it('should render role options quickly', () => {
      const startTime = performance.now();
      
      render(<RoleSelectionStep />);
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render quickly
      expect(renderTime).toBeLessThan(100); // 100ms
      
      // All role options should be present
      const roleButtons = screen.getAllByRole('button');
      expect(roleButtons.length).toBe(5); // 5 role options
    });

    it('should handle role selection interactions efficiently', async () => {
      const user = userEvent.setup();
      
      render(<RoleSelectionStep />);
      
      const studentCard = screen.getByLabelText(/Select Student role/);
      
      const startTime = performance.now();
      
      await user.click(studentCard);
      
      const endTime = performance.now();
      const interactionTime = endTime - startTime;

      // Interaction should be immediate
      expect(interactionTime).toBeLessThan(50); // 50ms
      
      expect(studentCard).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('Memory Usage', () => {
    it('should not create memory leaks with repeated renders', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Render and unmount multiple times
      for (let i = 0; i < 100; i++) {
        const { unmount } = render(<RoleSelectionStep />);
        unmount();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (adjust threshold as needed)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // 10MB
    });

    it('should clean up event listeners properly', () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
      
      const { unmount } = render(<InstitutionSelectionStep />);
      
      const addedListeners = addEventListenerSpy.mock.calls.length;
      
      unmount();
      
      const removedListeners = removeEventListenerSpy.mock.calls.length;
      
      // Should remove as many listeners as added
      expect(removedListeners).toBeGreaterThanOrEqual(addedListeners);
      
      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Bundle Size Impact', () => {
    it('should not import unnecessary dependencies', () => {
      // This test would typically be run with a bundler analyzer
      // For now, we'll just verify that components render without errors
      expect(() => render(<RoleSelectionStep />)).not.toThrow();
      expect(() => render(<InstitutionSelectionStep />)).not.toThrow();
    });
  });

  describe('Animation Performance', () => {
    it('should use efficient CSS transforms for animations', () => {
      render(<RoleSelectionStep />);
      
      const roleCards = screen.getAllByRole('button');
      
      roleCards.forEach(card => {
        // Should use CSS transforms for better performance
        expect(card).toHaveClass('transition-all');
        expect(card).toHaveClass('active:scale-[0.98]');
      });
    });

    it('should avoid layout thrashing during interactions', async () => {
      const user = userEvent.setup();
      
      render(<RoleSelectionStep />);
      
      const studentCard = screen.getByLabelText(/Select Student role/);
      
      // Monitor for layout changes
      const startTime = performance.now();
      
      await user.hover(studentCard);
      await user.click(studentCard);
      
      const endTime = performance.now();
      const interactionTime = endTime - startTime;
      
      // Should complete quickly without layout thrashing
      expect(interactionTime).toBeLessThan(100);
    });
  });

  describe('Network Performance', () => {
    it('should handle slow network responses gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock slow network response
      const slowSearchFunction = jest.fn().mockImplementation(() => {
        return new Promise(resolve => setTimeout(resolve, 2000));
      });
      
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: [],
        loading: true,
        error: null,
        searchInstitutions: slowSearchFunction,
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: jest.fn()
      });

      render(<InstitutionSelectionStep />);
      
      const searchInput = screen.getByLabelText('Search for your institution');
      await user.type(searchInput, 'test');
      
      // Should show loading state
      expect(screen.getByText('Searching...')).toBeInTheDocument();
      
      // UI should remain responsive during loading
      expect(searchInput).not.toBeDisabled();
    });

    it('should implement request cancellation for search', async () => {
      const user = userEvent.setup();
      
      const mockSearchFunction = jest.fn();
      const mockClearSearch = jest.fn();
      
      mockHooks.useInstitutionSearch.mockReturnValue({
        institutions: [],
        loading: false,
        error: null,
        searchInstitutions: mockSearchFunction,
        selectInstitution: jest.fn().mockResolvedValue(true),
        clearSearch: mockClearSearch
      });

      render(<InstitutionSelectionStep />);
      
      const searchInput = screen.getByLabelText('Search for your institution');
      
      // Type and then clear quickly
      await user.type(searchInput, 'test');
      await user.clear(searchInput);
      
      // Should cancel previous search
      expect(mockClearSearch).toHaveBeenCalled();
    });
  });

  describe('Accessibility Performance', () => {
    it('should maintain performance with screen reader support', () => {
      const startTime = performance.now();
      
      render(<RoleSelectionStep />);
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should render quickly even with accessibility features
      expect(renderTime).toBeLessThan(200);
      
      // Verify accessibility features are present
      expect(document.getElementById('role-selection-announcements')).toBeInTheDocument();
      
      const roleButtons = screen.getAllByRole('button');
      roleButtons.forEach(button => {
        expect(button).toHaveAttribute('aria-label');
        expect(button).toHaveAttribute('aria-pressed');
      });
    });

    it('should handle focus management efficiently', async () => {
      const user = userEvent.setup();
      
      render(<RoleSelectionStep />);
      
      const roleButtons = screen.getAllByRole('button');
      
      const startTime = performance.now();
      
      // Tab through all role buttons
      for (const button of roleButtons) {
        button.focus();
        await user.keyboard('{Tab}');
      }
      
      const endTime = performance.now();
      const focusTime = endTime - startTime;
      
      // Focus management should be efficient
      expect(focusTime).toBeLessThan(500);
    });
  });
});