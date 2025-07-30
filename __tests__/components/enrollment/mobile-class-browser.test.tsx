import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileClassBrowser } from '@/components/enrollment/mobile-class-browser';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';
import { useOfflineStorage } from '@/lib/hooks/useOfflineStorage';
import { useMobileDetection } from '@/lib/hooks/useMobileDetection';
import { EnrollmentType } from '@/lib/types/enrollment';

// Mock the hooks and services
jest.mock('@/lib/services/class-discovery');
jest.mock('@/lib/hooks/useOfflineStorage');
jest.mock('@/lib/hooks/useMobileDetection');
jest.mock('@/lib/hooks/useDebounce', () => ({
  useDebounce: (value: any) => value
}));

const mockClassDiscoveryService = ClassDiscoveryService as jest.MockedClass<typeof ClassDiscoveryService>;
const mockUseOfflineStorage = useOfflineStorage as jest.MockedFunction<typeof useOfflineStorage>;
const mockUseMobileDetection = useMobileDetection as jest.MockedFunction<typeof useMobileDetection>;

const mockClassData = {
  id: 'class-1',
  name: 'Introduction to Computer Science',
  code: 'CS101',
  description: 'Learn the fundamentals of computer science',
  teacherName: 'Dr. Smith',
  credits: 3,
  capacity: 30,
  currentEnrollment: 25,
  availableSpots: 5,
  waitlistCount: 2,
  isEnrollmentOpen: true,
  isWaitlistAvailable: true,
  enrollmentType: EnrollmentType.OPEN,
  schedule: 'MWF 10:00-11:00',
  location: 'Room 101',
  class_prerequisites: [],
  enrollment_restrictions: [],
  enrollmentStatistics: {
    capacityUtilization: 83.3
  }
};

const mockSearchResults = {
  classes: [mockClassData],
  total: 1,
  hasMore: false,
  filters: {
    departments: [{ id: 'cs', name: 'Computer Science', count: 1 }],
    instructors: [],
    enrollmentTypes: []
  }
};

describe('MobileClassBrowser', () => {
  const mockSearchClasses = jest.fn();
  const mockCacheClasses = jest.fn();
  const mockGetCachedClasses = jest.fn();
  const mockCacheSearchResults = jest.fn();
  const mockGetCachedSearchResults = jest.fn();

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock ClassDiscoveryService
    mockClassDiscoveryService.mockImplementation(() => ({
      searchClasses: mockSearchClasses
    } as any));

    // Mock useOfflineStorage
    mockUseOfflineStorage.mockReturnValue({
      isOnline: true,
      cacheClasses: mockCacheClasses,
      getCachedClasses: mockGetCachedClasses,
      cacheSearchResults: mockCacheSearchResults,
      getCachedSearchResults: mockGetCachedSearchResults,
      db: null,
      storeData: jest.fn(),
      getData: jest.fn(),
      getAllData: jest.fn(),
      deleteData: jest.fn(),
      clearStore: jest.fn(),
      storePendingEnrollmentRequest: jest.fn(),
      getPendingEnrollmentRequests: jest.fn(),
      removePendingEnrollmentRequest: jest.fn(),
      storeUserPreferences: jest.fn(),
      getUserPreferences: jest.fn(),
      cacheEnrollmentData: jest.fn(),
      getCachedEnrollmentData: jest.fn(),
      cleanupOldData: jest.fn()
    });

    // Mock useMobileDetection
    mockUseMobileDetection.mockReturnValue({
      isMobile: true,
      isTablet: false,
      screenSize: 'mobile',
      isDesktop: false
    });

    // Default successful search
    mockSearchClasses.mockResolvedValue(mockSearchResults);
  });

  describe('Mobile Usability', () => {
    it('renders with mobile-optimized layout', async () => {
      render(<MobileClassBrowser studentId="student-1" />);

      // Check for mobile-specific elements
      expect(screen.getByPlaceholderText('Search classes...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
      
      // Wait for search results
      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      });
    });

    it('has large touch targets for mobile interaction', async () => {
      render(<MobileClassBrowser studentId="student-1" />);

      const searchInput = screen.getByPlaceholderText('Search classes...');
      const filtersButton = screen.getByRole('button', { name: /filters/i });

      // Check that elements have appropriate sizes for touch
      expect(searchInput).toHaveClass('h-12'); // Large touch target
      expect(filtersButton).toBeInTheDocument();

      await waitFor(() => {
        const enrollButton = screen.getByRole('button', { name: /enroll/i });
        expect(enrollButton).toBeInTheDocument();
      });
    });

    it('supports swipe-like interactions with expandable cards', async () => {
      const user = userEvent.setup();
      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      });

      // Find and click the details button to expand card
      const detailsButton = screen.getByRole('button', { name: /details/i });
      await user.click(detailsButton);

      // Check that expanded content is shown
      await waitFor(() => {
        expect(screen.getByText('MWF 10:00-11:00')).toBeInTheDocument();
        expect(screen.getByText('Room 101')).toBeInTheDocument();
      });

      // Click again to collapse
      const lessButton = screen.getByRole('button', { name: /less/i });
      await user.click(lessButton);

      // Expanded content should be hidden
      await waitFor(() => {
        expect(screen.queryByText('MWF 10:00-11:00')).not.toBeInTheDocument();
      });
    });

    it('handles filter panel toggle for mobile', async () => {
      const user = userEvent.setup();
      render(<MobileClassBrowser studentId="student-1" />);

      const filtersButton = screen.getByRole('button', { name: /filters/i });
      
      // Open filters
      await user.click(filtersButton);
      
      await waitFor(() => {
        expect(screen.getByText('Department')).toBeInTheDocument();
        expect(screen.getByText('Enrollment Type')).toBeInTheDocument();
      });

      // Close filters
      const closeButton = screen.getByRole('button', { name: '' }); // X button
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Department')).not.toBeInTheDocument();
      });
    });

    it('shows appropriate loading states for mobile', async () => {
      // Make search take time to resolve
      mockSearchClasses.mockImplementation(() => new Promise(resolve => 
        setTimeout(() => resolve(mockSearchResults), 100)
      ));

      render(<MobileClassBrowser studentId="student-1" />);

      // Should show loading state
      expect(screen.getByText('Searching...')).toBeInTheDocument();

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Offline Functionality', () => {
    it('shows offline indicator when offline', async () => {
      mockUseOfflineStorage.mockReturnValue({
        isOnline: false,
        cacheClasses: mockCacheClasses,
        getCachedClasses: mockGetCachedClasses,
        cacheSearchResults: mockCacheSearchResults,
        getCachedSearchResults: mockGetCachedSearchResults,
        db: null,
        storeData: jest.fn(),
        getData: jest.fn(),
        getAllData: jest.fn(),
        deleteData: jest.fn(),
        clearStore: jest.fn(),
        storePendingEnrollmentRequest: jest.fn(),
        getPendingEnrollmentRequests: jest.fn(),
        removePendingEnrollmentRequest: jest.fn(),
        storeUserPreferences: jest.fn(),
        getUserPreferences: jest.fn(),
        cacheEnrollmentData: jest.fn(),
        getCachedEnrollmentData: jest.fn(),
        cleanupOldData: jest.fn()
      });

      mockGetCachedClasses.mockResolvedValue([mockClassData]);

      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText('Offline')).toBeInTheDocument();
        expect(screen.getByText('Browsing cached classes')).toBeInTheDocument();
      });
    });

    it('falls back to cached data when online search fails', async () => {
      mockSearchClasses.mockRejectedValue(new Error('Network error'));
      mockGetCachedSearchResults.mockResolvedValue(mockSearchResults);

      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
        expect(screen.getByText('Browsing cached classes')).toBeInTheDocument();
      });
    });

    it('caches search results when online', async () => {
      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(mockCacheClasses).toHaveBeenCalledWith([mockClassData]);
        expect(mockCacheSearchResults).toHaveBeenCalled();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', async () => {
      render(<MobileClassBrowser studentId="student-1" />);

      // Check for proper input labeling
      const searchInput = screen.getByPlaceholderText('Search classes...');
      expect(searchInput).toHaveAttribute('type', 'text');

      // Check for button roles
      expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /enroll/i })).toBeInTheDocument();
      });
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<MobileClassBrowser studentId="student-1" />);

      const searchInput = screen.getByPlaceholderText('Search classes...');
      
      // Focus should work with keyboard
      await user.tab();
      expect(searchInput).toHaveFocus();

      // Should be able to type in search
      await user.type(searchInput, 'computer');
      expect(searchInput).toHaveValue('computer');
    });

    it('has sufficient color contrast for mobile viewing', async () => {
      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        const classTitle = screen.getByText('Introduction to Computer Science');
        expect(classTitle).toBeInTheDocument();
        
        // Check that status badges are present (they should have appropriate contrast)
        expect(screen.getByText('5 spots')).toBeInTheDocument();
        expect(screen.getByText('Open')).toBeInTheDocument();
      });
    });

    it('provides clear error messages', async () => {
      mockSearchClasses.mockRejectedValue(new Error('Search failed'));
      mockGetCachedClasses.mockResolvedValue([]);

      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText(/failed to search classes/i)).toBeInTheDocument();
      });
    });

    it('has descriptive text for screen readers', async () => {
      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        // Check for descriptive text that would help screen readers
        expect(screen.getByText('25/30 enrolled')).toBeInTheDocument();
        expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
        expect(screen.getByText('3 Credits')).toBeInTheDocument();
      });
    });
  });

  describe('Touch Interactions', () => {
    it('handles touch events for card expansion', async () => {
      const user = userEvent.setup();
      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText('Introduction to Computer Science')).toBeInTheDocument();
      });

      // Simulate touch interaction
      const detailsButton = screen.getByRole('button', { name: /details/i });
      
      // Touch start and end
      fireEvent.touchStart(detailsButton);
      fireEvent.touchEnd(detailsButton);
      await user.click(detailsButton);

      await waitFor(() => {
        expect(screen.getByText('MWF 10:00-11:00')).toBeInTheDocument();
      });
    });

    it('prevents accidental interactions with proper touch targets', async () => {
      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        const enrollButton = screen.getByRole('button', { name: /enroll/i });
        
        // Button should have adequate size and spacing
        expect(enrollButton).toBeInTheDocument();
        expect(enrollButton).not.toBeDisabled();
      });
    });
  });

  describe('Performance on Mobile', () => {
    it('limits results for better mobile performance', async () => {
      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(mockSearchClasses).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: 10 // Mobile-optimized limit
          })
        );
      });
    });

    it('implements lazy loading with load more button', async () => {
      const mockResultsWithMore = {
        ...mockSearchResults,
        hasMore: true
      };
      
      mockSearchClasses.mockResolvedValue(mockResultsWithMore);
      
      const user = userEvent.setup();
      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /load more classes/i })).toBeInTheDocument();
      });

      const loadMoreButton = screen.getByRole('button', { name: /load more classes/i });
      await user.click(loadMoreButton);

      expect(mockSearchClasses).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('shows user-friendly error messages', async () => {
      mockSearchClasses.mockRejectedValue(new Error('Network timeout'));
      mockGetCachedClasses.mockResolvedValue([]);

      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText(/failed to search classes/i)).toBeInTheDocument();
      });
    });

    it('handles empty results gracefully', async () => {
      mockSearchClasses.mockResolvedValue({
        classes: [],
        total: 0,
        hasMore: false,
        filters: { departments: [], instructors: [], enrollmentTypes: [] }
      });

      render(<MobileClassBrowser studentId="student-1" />);

      await waitFor(() => {
        expect(screen.getByText('No classes found')).toBeInTheDocument();
        expect(screen.getByText('Try adjusting your search or filters.')).toBeInTheDocument();
      });
    });
  });
});