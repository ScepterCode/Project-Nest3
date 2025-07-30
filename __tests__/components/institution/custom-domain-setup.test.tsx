import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomDomainSetup } from '@/components/institution/custom-domain-setup';

// Mock the UI components
jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => {
    const { children, onClick, disabled, variant, asChild, ...rest } = props;
    if (asChild) {
      return <div {...rest}>{children}</div>;
    }
    return (
      <button onClick={onClick} disabled={disabled} data-variant={variant} {...rest}>
        {children}
      </button>
    );
  },
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => {
    const { onChange, value, type, className, ...rest } = props;
    return (
      <input
        type={type || 'text'}
        value={value}
        onChange={onChange}
        className={className}
        {...rest}
      />
    );
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: (props: any) => <div data-testid="card" {...props}>{props.children}</div>,
  CardContent: (props: any) => <div data-testid="card-content" {...props}>{props.children}</div>,
  CardDescription: (props: any) => <div data-testid="card-description" {...props}>{props.children}</div>,
  CardHeader: (props: any) => <div data-testid="card-header" {...props}>{props.children}</div>,
  CardTitle: (props: any) => <h3 data-testid="card-title" {...props}>{props.children}</h3>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: (props: any) => <span data-testid="badge" data-variant={props.variant} {...props}>{props.children}</span>,
}));

jest.mock('@/components/ui/alert', () => ({
  Alert: (props: any) => <div data-testid="alert" {...props}>{props.children}</div>,
  AlertDescription: (props: any) => <div data-testid="alert-description" {...props}>{props.children}</div>,
}));

jest.mock('@/components/ui/label', () => ({
  Label: (props: any) => <label {...props}>{props.children}</label>,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  XCircle: () => <div data-testid="x-circle-icon" />,
  Clock: () => <div data-testid="clock-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
  Copy: () => <div data-testid="copy-icon" />,
}));

const mockValidationResult = {
  isValid: true,
  records: [
    {
      record: { type: 'CNAME' as const, name: 'portal.example.edu', value: 'test-id.platform.example.com', ttl: 300 },
      status: 'valid' as const,
      message: 'Record found and valid'
    },
    {
      record: { type: 'TXT' as const, name: '_platform-verification.portal.example.edu', value: 'platform-verification=test-id', ttl: 300 },
      status: 'valid' as const,
      message: 'Verification record found'
    }
  ],
  sslStatus: 'valid' as const,
  lastChecked: new Date('2024-01-01T12:00:00Z')
};

const defaultProps = {
  institutionId: 'test-institution-id',
  currentDomain: '',
  onDomainUpdate: jest.fn(),
  onValidateDomain: jest.fn(),
  isLoading: false,
  canCustomizeDomain: true,
};

describe('CustomDomainSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the custom domain setup interface', () => {
    render(<CustomDomainSetup {...defaultProps} />);
    
    expect(screen.getByText('Custom Domain Setup')).toBeInTheDocument();
    expect(screen.getByText('Configure a custom domain for your institution\'s portal')).toBeInTheDocument();
  });

  it('displays upgrade required message when domain customization is not allowed', () => {
    render(<CustomDomainSetup {...defaultProps} canCustomizeDomain={false} />);
    
    expect(screen.getByText('Custom Domain')).toBeInTheDocument();
    expect(screen.getByText('Custom domains are not available on your current plan.')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('Upgrade Required');
  });

  it('shows progress steps correctly', () => {
    render(<CustomDomainSetup {...defaultProps} />);
    
    expect(screen.getByText('Domain')).toBeInTheDocument();
    expect(screen.getByText('DNS Setup')).toBeInTheDocument();
    expect(screen.getByText('Validation')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('handles domain input validation', async () => {
    const user = userEvent.setup();
    render(<CustomDomainSetup {...defaultProps} />);
    
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    
    // Test invalid domain
    await user.type(domainInput, 'invalid-domain');
    expect(domainInput).toHaveValue('invalid-domain');
    
    // Test valid domain
    await user.clear(domainInput);
    await user.type(domainInput, 'portal.example.edu');
    expect(domainInput).toHaveValue('portal.example.edu');
  });

  it('prevents proceeding with invalid domain', async () => {
    const user = userEvent.setup();
    render(<CustomDomainSetup {...defaultProps} />);
    
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    const nextButton = screen.getByText('Next: Configure DNS');
    
    await user.type(domainInput, 'invalid..domain');
    await user.click(nextButton);
    
    expect(screen.getByText('Please enter a valid domain name')).toBeInTheDocument();
  });

  it('proceeds to DNS setup with valid domain', async () => {
    const user = userEvent.setup();
    render(<CustomDomainSetup {...defaultProps} />);
    
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    const nextButton = screen.getByText('Next: Configure DNS');
    
    await user.type(domainInput, 'portal.example.edu');
    await user.click(nextButton);
    
    expect(screen.getByText('Configure DNS Records')).toBeInTheDocument();
    expect(screen.getByText('Add these DNS records to your domain provider to verify ownership')).toBeInTheDocument();
  });

  it('displays DNS records correctly', async () => {
    const user = userEvent.setup();
    render(<CustomDomainSetup {...defaultProps} />);
    
    // Navigate to DNS setup
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    await user.type(domainInput, 'portal.example.edu');
    await user.click(screen.getByText('Next: Configure DNS'));
    
    // Check DNS records are displayed
    expect(screen.getByText('CNAME Record')).toBeInTheDocument();
    expect(screen.getByText('TXT Record')).toBeInTheDocument();
    
    // Check record values
    expect(screen.getByText('portal.example.edu')).toBeInTheDocument();
    expect(screen.getByText('test-institution-id.platform.example.com')).toBeInTheDocument();
  });

  it('handles domain validation successfully', async () => {
    const mockOnValidateDomain = jest.fn().mockResolvedValue(mockValidationResult);
    const user = userEvent.setup();
    
    render(<CustomDomainSetup {...defaultProps} onValidateDomain={mockOnValidateDomain} />);
    
    // Navigate to validation step
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    await user.type(domainInput, 'portal.example.edu');
    await user.click(screen.getByText('Next: Configure DNS'));
    await user.click(screen.getByText('I\'ve Added the Records'));
    
    // Trigger validation
    await user.click(screen.getByText('Check DNS Records'));
    
    await waitFor(() => {
      expect(mockOnValidateDomain).toHaveBeenCalledWith('portal.example.edu');
    });
    
    await waitFor(() => {
      expect(screen.getByText('DNS Records Status')).toBeInTheDocument();
      expect(screen.getByText('SSL Certificate')).toBeInTheDocument();
    });
  });

  it('handles domain validation failure', async () => {
    const mockOnValidateDomain = jest.fn().mockResolvedValue({
      ...mockValidationResult,
      isValid: false,
      records: [
        {
          record: { type: 'CNAME' as const, name: 'portal.example.edu', value: 'test-id.platform.example.com', ttl: 300 },
          status: 'invalid' as const,
          message: 'Record not found'
        }
      ],
      sslStatus: 'invalid' as const
    });
    const user = userEvent.setup();
    
    render(<CustomDomainSetup {...defaultProps} onValidateDomain={mockOnValidateDomain} />);
    
    // Navigate to validation and trigger check
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    await user.type(domainInput, 'portal.example.edu');
    await user.click(screen.getByText('Next: Configure DNS'));
    await user.click(screen.getByText('I\'ve Added the Records'));
    await user.click(screen.getByText('Check DNS Records'));
    
    await waitFor(() => {
      expect(screen.getByText('DNS Records Status')).toBeInTheDocument();
    });
  });

  it('completes setup when validation passes', async () => {
    const mockOnValidateDomain = jest.fn().mockResolvedValue(mockValidationResult);
    const mockOnDomainUpdate = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();
    
    render(<CustomDomainSetup 
      {...defaultProps} 
      onValidateDomain={mockOnValidateDomain}
      onDomainUpdate={mockOnDomainUpdate}
    />);
    
    // Navigate through the flow
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    await user.type(domainInput, 'portal.example.edu');
    await user.click(screen.getByText('Next: Configure DNS'));
    await user.click(screen.getByText('I\'ve Added the Records'));
    await user.click(screen.getByText('Check DNS Records'));
    
    await waitFor(() => {
      expect(screen.getByText('Complete Setup')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Complete Setup'));
    
    await waitFor(() => {
      expect(screen.getByText('Domain Setup Complete')).toBeInTheDocument();
      expect(mockOnDomainUpdate).toHaveBeenCalledWith('portal.example.edu');
    });
  });

  it('allows copying DNS record values', async () => {
    const user = userEvent.setup();
    
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(),
      },
    });
    
    render(<CustomDomainSetup {...defaultProps} />);
    
    // Navigate to DNS setup
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    await user.type(domainInput, 'portal.example.edu');
    await user.click(screen.getByText('Next: Configure DNS'));
    
    // Click copy button
    const copyButtons = screen.getAllByTestId('copy-icon');
    await user.click(copyButtons[0].closest('button')!);
    
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('shows loading state during validation', async () => {
    const mockOnValidateDomain = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
    const user = userEvent.setup();
    
    render(<CustomDomainSetup {...defaultProps} onValidateDomain={mockOnValidateDomain} />);
    
    // Navigate to validation
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    await user.type(domainInput, 'portal.example.edu');
    await user.click(screen.getByText('Next: Configure DNS'));
    await user.click(screen.getByText('I\'ve Added the Records'));
    
    // Start validation
    await user.click(screen.getByText('Check DNS Records'));
    
    expect(screen.getByText('Validating...')).toBeInTheDocument();
  });

  it('allows navigation back to previous steps', async () => {
    const user = userEvent.setup();
    render(<CustomDomainSetup {...defaultProps} />);
    
    // Navigate forward
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    await user.type(domainInput, 'portal.example.edu');
    await user.click(screen.getByText('Next: Configure DNS'));
    
    // Navigate back
    await user.click(screen.getByText('Back'));
    
    expect(screen.getByText('Enter Your Domain')).toBeInTheDocument();
  });

  it('handles existing domain configuration', () => {
    render(<CustomDomainSetup {...defaultProps} currentDomain="existing.example.edu" />);
    
    const domainInput = screen.getByDisplayValue('existing.example.edu');
    expect(domainInput).toBeInTheDocument();
  });

  it('shows completion state with portal link', async () => {
    const mockOnValidateDomain = jest.fn().mockResolvedValue(mockValidationResult);
    const user = userEvent.setup();
    
    render(<CustomDomainSetup {...defaultProps} onValidateDomain={mockOnValidateDomain} />);
    
    // Complete the flow
    const domainInput = screen.getByPlaceholderText('portal.yourinstitution.edu');
    await user.type(domainInput, 'portal.example.edu');
    await user.click(screen.getByText('Next: Configure DNS'));
    await user.click(screen.getByText('I\'ve Added the Records'));
    await user.click(screen.getByText('Check DNS Records'));
    
    await waitFor(() => {
      expect(screen.getByText('Complete Setup')).toBeInTheDocument();
    });
    
    await user.click(screen.getByText('Complete Setup'));
    
    await waitFor(() => {
      expect(screen.getByText('Visit Your Portal')).toBeInTheDocument();
      expect(screen.getByText('https://portal.example.edu')).toBeInTheDocument();
    });
  });
});