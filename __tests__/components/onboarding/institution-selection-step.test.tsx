import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstitutionSelectionStep } from '@/components/onboarding/institution-selection-step';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useInstitutionSearch } from '@/lib/hooks/useOnboarding';
import { InstitutionSearchResult, UserRole } from '@/lib/types/onboarding';

// Mock the hooks
jest.mock('@/contexts/onboarding-context');
jest.mock('@/lib/hooks/useOnboarding');

const mockUseOnboarding = useOnboarding as jest.MockedFunction<typeof useOnboarding>;
const mockUseInstitutionSearch = useInstitutionSearch as jest.MockedFunction<typeof useInstitutionSearch>;

const mockInstitutions: InstitutionSearchResult[] = [
  {
    id: '1',
    name: 'University of Example',
    domain: 'example.edu',
    type: 'university',
    departmentCount: 15,
    userCount: 1200
  },
  {
    id: '2',
    name: 'Example College',
    domain: 'college.edu',
    type: 'college',
    departmentCount: 8,
    userCount: 500
  }
];

describe('InstitutionSelectionStep', () => {
  const mockNextStep = jest.fn();
  const mockUpdateOnboardingData = jest.fn();
  const mockSearchInstitutions = jest.fn();
  const mockSelectInstitution = jest.fn();
  const mockClearSearch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUseOnboarding.mockReturnValue({
      currentStep: 1,
      totalSteps: 5,
      onboardingData: {
        userId: 'test-user',
        role: UserRole.STUDENT,
        currentStep: 1,
        skippedSteps: []
      },
      session: undefined,
      loading: false,
      error: undefined,
      updateOnboardingData: mockUpdateOnboardingData,
      nextStep: mockNextStep,
      previousStep: jest.fn(),
      skipStep: jest.fn(),
      completeOnboarding: jest.fn(),
      restartOnboarding: jest.fn()
    });

    mockUseInstitutionSearch.mockReturnValue({
      institutions: [],
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });
  });

  it('renders search input and placeholder text', () => {
    render(<InstitutionSelectionStep />);
    
    expect(screen.getByPlaceholderText(/Type your school, university, or organization name/)).toBeInTheDocument();
    expect(screen.getByText('Start typing to search for your institution')).toBeInTheDocument();
  });

  it('triggers search when typing in search input', async () => {
    render(<InstitutionSelectionStep />);
    
    const searchInput = screen.getByPlaceholderText(/Type your school, university, or organization name/);
    
    fireEvent.change(searchInput, { target: { value: 'University' } });
    
    await waitFor(() => {
      expect(mockSearchInstitutions).toHaveBeenCalledWith('University');
    });
  });

  it('does not search for queries shorter than 2 characters', async () => {
    render(<InstitutionSelectionStep />);
    
    const searchInput = screen.getByPlaceholderText(/Type your school, university, or organization name/);
    
    fireEvent.change(searchInput, { target: { value: 'U' } });
    
    await waitFor(() => {
      expect(mockClearSearch).toHaveBeenCalled();
    });
    
    expect(mockSearchInstitutions).not.toHaveBeenCalled();
  });

  it('displays search results when available', () => {
    mockUseInstitutionSearch.mockReturnValue({
      institutions: mockInstitutions,
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });

    render(<InstitutionSelectionStep />);
    
    expect(screen.getByText('University of Example')).toBeInTheDocument();
    expect(screen.getByText('Example College')).toBeInTheDocument();
    expect(screen.getByText('example.edu')).toBeInTheDocument();
    expect(screen.getByText('1200 users')).toBeInTheDocument();
    expect(screen.getByText('15 departments')).toBeInTheDocument();
  });

  it('shows loading state during search', () => {
    mockUseInstitutionSearch.mockReturnValue({
      institutions: [],
      loading: true,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });

    render(<InstitutionSelectionStep />);
    
    expect(screen.getByText('Searching...')).toBeInTheDocument();
  });

  it('displays error message when search fails', () => {
    mockUseInstitutionSearch.mockReturnValue({
      institutions: [],
      loading: false,
      error: 'Search failed',
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });

    render(<InstitutionSelectionStep />);
    
    expect(screen.getByText('Search failed')).toBeInTheDocument();
  });

  it('allows institution selection', async () => {
    mockUseInstitutionSearch.mockReturnValue({
      institutions: mockInstitutions,
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });

    mockSelectInstitution.mockResolvedValue(true);

    render(<InstitutionSelectionStep />);
    
    const institutionCard = screen.getByText('University of Example').closest('div[class*="cursor-pointer"]');
    
    if (institutionCard) {
      fireEvent.click(institutionCard);
    }
    
    await waitFor(() => {
      expect(mockSelectInstitution).toHaveBeenCalledWith(mockInstitutions[0]);
    });
  });

  it('shows selected institution confirmation', async () => {
    mockUseInstitutionSearch.mockReturnValue({
      institutions: mockInstitutions,
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });

    mockSelectInstitution.mockResolvedValue(true);

    render(<InstitutionSelectionStep />);
    
    const institutionCard = screen.getByText('University of Example').closest('div[class*="cursor-pointer"]');
    
    if (institutionCard) {
      fireEvent.click(institutionCard);
    }
    
    await waitFor(() => {
      expect(screen.getByText('Selected: University of Example')).toBeInTheDocument();
      expect(screen.getByText('Great! We\'ll connect you with this institution.')).toBeInTheDocument();
    });
  });

  it('enables continue button when institution is selected', async () => {
    mockUseInstitutionSearch.mockReturnValue({
      institutions: mockInstitutions,
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });

    mockSelectInstitution.mockResolvedValue(true);

    render(<InstitutionSelectionStep />);
    
    // Initially disabled
    const continueButton = screen.getByText('Continue');
    expect(continueButton).toBeDisabled();
    
    // Select institution
    const institutionCard = screen.getByText('University of Example').closest('div[class*="cursor-pointer"]');
    
    if (institutionCard) {
      fireEvent.click(institutionCard);
    }
    
    await waitFor(() => {
      expect(continueButton).not.toBeDisabled();
    });
  });

  it('proceeds to next step when continue is clicked', async () => {
    mockUseInstitutionSearch.mockReturnValue({
      institutions: mockInstitutions,
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });

    mockSelectInstitution.mockResolvedValue(true);

    render(<InstitutionSelectionStep />);
    
    // Select institution
    const institutionCard = screen.getByText('University of Example').closest('div[class*="cursor-pointer"]');
    
    if (institutionCard) {
      fireEvent.click(institutionCard);
    }
    
    await waitFor(() => {
      const continueButton = screen.getByText('Continue');
      expect(continueButton).not.toBeDisabled();
      fireEvent.click(continueButton);
    });
    
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled();
    });
  });

  it('shows request institution form when no results found', () => {
    // Set up state with search query but no results
    const component = render(<InstitutionSelectionStep />);
    
    // Simulate search with no results
    const searchInput = screen.getByPlaceholderText(/Type your school, university, or organization name/);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent University' } });
    
    // Mock the hook to return no results
    mockUseInstitutionSearch.mockReturnValue({
      institutions: [],
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });
    
    component.rerender(<InstitutionSelectionStep />);
    
    expect(screen.getByText('Institution not found')).toBeInTheDocument();
    expect(screen.getByText('Request Institution')).toBeInTheDocument();
  });

  it('opens request form when request institution button is clicked', () => {
    // Set up state with search query but no results
    const component = render(<InstitutionSelectionStep />);
    
    const searchInput = screen.getByPlaceholderText(/Type your school, university, or organization name/);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent University' } });
    
    mockUseInstitutionSearch.mockReturnValue({
      institutions: [],
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });
    
    component.rerender(<InstitutionSelectionStep />);
    
    const requestButton = screen.getByText('Request Institution');
    fireEvent.click(requestButton);
    
    expect(screen.getByText('Request New Institution')).toBeInTheDocument();
    expect(screen.getByText('We\'ll review your request and add the institution to our database.')).toBeInTheDocument();
  });

  it('handles institution selection failure gracefully', async () => {
    mockUseInstitutionSearch.mockReturnValue({
      institutions: mockInstitutions,
      loading: false,
      error: null,
      searchInstitutions: mockSearchInstitutions,
      selectInstitution: mockSelectInstitution,
      clearSearch: mockClearSearch
    });

    mockSelectInstitution.mockResolvedValue(false);

    render(<InstitutionSelectionStep />);
    
    const institutionCard = screen.getByText('University of Example').closest('div[class*="cursor-pointer"]');
    
    if (institutionCard) {
      fireEvent.click(institutionCard);
    }
    
    await waitFor(() => {
      expect(mockSelectInstitution).toHaveBeenCalledWith(mockInstitutions[0]);
    });
    
    // Should not show selected state if selection failed
    expect(screen.queryByText('Selected: University of Example')).not.toBeInTheDocument();
  });
});