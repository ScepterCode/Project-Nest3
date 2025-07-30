import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailTemplateCustomization } from '@/components/institution/email-template-customization';

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
    const { onChange, value, type, ...rest } = props;
    return (
      <input
        type={type || 'text'}
        value={value}
        onChange={onChange}
        {...rest}
      />
    );
  },
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props: any) => {
    const { onChange, value, rows, ...rest } = props;
    return <textarea value={value} onChange={onChange} rows={rows} {...rest} />;
  },
}));

jest.mock('@/components/ui/card', () => ({
  Card: (props: any) => <div data-testid="card" {...props}>{props.children}</div>,
  CardContent: (props: any) => <div data-testid="card-content" {...props}>{props.children}</div>,
  CardDescription: (props: any) => <div data-testid="card-description" {...props}>{props.children}</div>,
  CardHeader: (props: any) => <div data-testid="card-header" {...props}>{props.children}</div>,
  CardTitle: (props: any) => <h3 data-testid="card-title" {...props}>{props.children}</h3>,
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: (props: any) => <div data-testid="tabs" data-default-value={props.defaultValue} {...props}>{props.children}</div>,
  TabsContent: (props: any) => <div data-testid="tabs-content" data-value={props.value} {...props}>{props.children}</div>,
  TabsList: (props: any) => <div data-testid="tabs-list" {...props}>{props.children}</div>,
  TabsTrigger: (props: any) => <button data-testid="tabs-trigger" data-value={props.value} {...props}>{props.children}</button>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: (props: any) => <span data-testid="badge" data-variant={props.variant} {...props}>{props.children}</span>,
}));

jest.mock('@/components/ui/alert', () => ({
  Alert: (props: any) => <div data-testid="alert" {...props}>{props.children}</div>,
  AlertDescription: (props: any) => <div data-testid="alert-description" {...props}>{props.children}</div>,
}));

jest.mock('@/components/ui/select', () => ({
  Select: (props: any) => {
    const { children, value, onValueChange, ...rest } = props;
    return (
      <div data-testid="select" data-value={value} {...rest}>
        <button onClick={() => onValueChange && onValueChange('test-value')}>
          {children}
        </button>
      </div>
    );
  },
  SelectContent: (props: any) => <div data-testid="select-content" {...props}>{props.children}</div>,
  SelectItem: (props: any) => <div data-testid="select-item" data-value={props.value} {...props}>{props.children}</div>,
  SelectTrigger: (props: any) => <div data-testid="select-trigger" {...props}>{props.children}</div>,
  SelectValue: (props: any) => <div data-testid="select-value" {...props} />,
}));

jest.mock('@/components/ui/label', () => ({
  Label: (props: any) => <label {...props}>{props.children}</label>,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Eye: () => <div data-testid="eye-icon" />,
  Code: () => <div data-testid="code-icon" />,
  Send: () => <div data-testid="send-icon" />,
  Info: () => <div data-testid="info-icon" />,
}));

const mockTemplates = [
  {
    id: 'welcome-template',
    name: 'Welcome Email',
    subject: 'Welcome to {{institutionName}}',
    htmlContent: '<h1>Welcome {{userName}}!</h1><p>Thank you for joining {{institutionName}}.</p>',
    textContent: 'Welcome {{userName}}! Thank you for joining {{institutionName}}.',
    variables: ['{{userName}}', '{{institutionName}}', '{{loginUrl}}'],
    category: 'welcome' as const
  },
  {
    id: 'invitation-template',
    name: 'Invitation Email',
    subject: 'You\'re invited to {{institutionName}}',
    htmlContent: '<h1>You\'re invited!</h1><p>{{invitedBy}} has invited you to join {{institutionName}}.</p>',
    textContent: 'You\'re invited! {{invitedBy}} has invited you to join {{institutionName}}.',
    variables: ['{{invitedBy}}', '{{institutionName}}', '{{invitationUrl}}'],
    category: 'invitation' as const
  }
];

const defaultProps = {
  institutionId: 'test-institution-id',
  templates: mockTemplates,
  onUpdateTemplate: jest.fn(),
  onPreviewTemplate: jest.fn(),
  onSendTestEmail: jest.fn(),
  isLoading: false,
  canCustomizeEmails: true,
};

describe('EmailTemplateCustomization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the email template customization interface', () => {
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    expect(screen.getByText('Email Template Customization')).toBeInTheDocument();
    expect(screen.getByText('Customize email templates with your institution\'s branding and messaging')).toBeInTheDocument();
  });

  it('displays upgrade required message when email customization is not allowed', () => {
    render(<EmailTemplateCustomization {...defaultProps} canCustomizeEmails={false} />);
    
    expect(screen.getByText('Email Template Customization')).toBeInTheDocument();
    expect(screen.getByText('Email template customization is not available on your current plan.')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('Upgrade Required');
  });

  it('displays template list', () => {
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    expect(screen.getByText('Welcome Email')).toBeInTheDocument();
    expect(screen.getByText('Invitation Email')).toBeInTheDocument();
    expect(screen.getByText('welcome')).toBeInTheDocument();
    expect(screen.getByText('invitation')).toBeInTheDocument();
  });

  it('selects template and shows content', async () => {
    const user = userEvent.setup();
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    // First template should be selected by default
    expect(screen.getByDisplayValue('Welcome to {{institutionName}}')).toBeInTheDocument();
    expect(screen.getByDisplayValue('<h1>Welcome {{userName}}!</h1><p>Thank you for joining {{institutionName}}.</p>')).toBeInTheDocument();
    
    // Select second template
    await user.click(screen.getByText('Invitation Email'));
    
    expect(screen.getByDisplayValue('You\'re invited to {{institutionName}}')).toBeInTheDocument();
  });

  it('handles template content changes', async () => {
    const user = userEvent.setup();
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    const subjectInput = screen.getByDisplayValue('Welcome to {{institutionName}}');
    await user.clear(subjectInput);
    await user.type(subjectInput, 'New welcome subject');
    
    expect(subjectInput).toHaveValue('New welcome subject');
  });

  it('handles HTML content changes', async () => {
    const user = userEvent.setup();
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    const htmlTextarea = screen.getByDisplayValue('<h1>Welcome {{userName}}!</h1><p>Thank you for joining {{institutionName}}.</p>');
    await user.clear(htmlTextarea);
    await user.type(htmlTextarea, '<h1>New HTML content</h1>');
    
    expect(htmlTextarea).toHaveValue('<h1>New HTML content</h1>');
  });

  it('handles text content changes', async () => {
    const user = userEvent.setup();
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    const textTextarea = screen.getByDisplayValue('Welcome {{userName}}! Thank you for joining {{institutionName}}.');
    await user.clear(textTextarea);
    await user.type(textTextarea, 'New text content');
    
    expect(textTextarea).toHaveValue('New text content');
  });

  it('displays available variables', () => {
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    // Check for variable categories
    expect(screen.getByText('User Variables')).toBeInTheDocument();
    expect(screen.getByText('Institution Variables')).toBeInTheDocument();
    expect(screen.getByText('System Variables')).toBeInTheDocument();
    
    // Check for specific variables
    expect(screen.getByText('{{userName}}')).toBeInTheDocument();
    expect(screen.getByText('{{institutionName}}')).toBeInTheDocument();
    expect(screen.getByText('{{loginUrl}}')).toBeInTheDocument();
  });

  it('displays current template variables', () => {
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    expect(screen.getByText('Current Template Variables')).toBeInTheDocument();
    
    // Should show variables for the selected template
    const variableBadges = screen.getAllByTestId('badge');
    const templateVariables = variableBadges.filter(badge => 
      badge.textContent?.includes('{{') && badge.textContent?.includes('}}')
    );
    expect(templateVariables.length).toBeGreaterThan(0);
  });

  it('handles template save', async () => {
    const mockOnUpdateTemplate = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();
    
    render(<EmailTemplateCustomization {...defaultProps} onUpdateTemplate={mockOnUpdateTemplate} />);
    
    // Make a change
    const subjectInput = screen.getByDisplayValue('Welcome to {{institutionName}}');
    await user.clear(subjectInput);
    await user.type(subjectInput, 'Updated subject');
    
    // Save
    await user.click(screen.getByText('Save Changes'));
    
    await waitFor(() => {
      expect(mockOnUpdateTemplate).toHaveBeenCalledWith('welcome-template', expect.objectContaining({
        subject: 'Updated subject'
      }));
    });
  });

  it('handles template save with errors', async () => {
    const mockOnUpdateTemplate = jest.fn().mockResolvedValue({
      success: false,
      errors: [{ field: 'subject', message: 'Subject is required' }]
    });
    const user = userEvent.setup();
    
    render(<EmailTemplateCustomization {...defaultProps} onUpdateTemplate={mockOnUpdateTemplate} />);
    
    await user.click(screen.getByText('Save Changes'));
    
    await waitFor(() => {
      expect(screen.getByText('Subject is required')).toBeInTheDocument();
    });
  });

  it('handles test email sending', async () => {
    const mockOnSendTestEmail = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();
    
    render(<EmailTemplateCustomization {...defaultProps} onSendTestEmail={mockOnSendTestEmail} />);
    
    // Enter test email
    const testEmailInput = screen.getByPlaceholderText('test@example.com');
    await user.type(testEmailInput, 'test@example.com');
    
    // Send test email
    await user.click(screen.getByText('Send Test Email'));
    
    await waitFor(() => {
      expect(mockOnSendTestEmail).toHaveBeenCalledWith(
        'welcome-template',
        'test@example.com',
        expect.any(Object)
      );
    });
  });

  it('handles test email sending with errors', async () => {
    const mockOnSendTestEmail = jest.fn().mockResolvedValue({
      success: false,
      errors: [{ message: 'Invalid email address' }]
    });
    const user = userEvent.setup();
    
    render(<EmailTemplateCustomization {...defaultProps} onSendTestEmail={mockOnSendTestEmail} />);
    
    const testEmailInput = screen.getByPlaceholderText('test@example.com');
    await user.type(testEmailInput, 'invalid-email');
    await user.click(screen.getByText('Send Test Email'));
    
    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });
  });

  it('handles preview generation', async () => {
    const mockOnPreviewTemplate = jest.fn().mockResolvedValue({
      success: true,
      preview: '<h1>Preview Content</h1>'
    });
    const user = userEvent.setup();
    
    render(<EmailTemplateCustomization {...defaultProps} onPreviewTemplate={mockOnPreviewTemplate} />);
    
    await user.click(screen.getByText('Generate Preview'));
    
    await waitFor(() => {
      expect(mockOnPreviewTemplate).toHaveBeenCalledWith(
        'welcome-template',
        expect.any(Object)
      );
    });
  });

  it('toggles between edit and preview modes', async () => {
    const user = userEvent.setup();
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    // Should start in edit mode
    expect(screen.getByTestId('code-icon')).toBeInTheDocument();
    
    // Toggle to preview mode
    await user.click(screen.getByTestId('code-icon').closest('button')!);
    
    expect(screen.getByTestId('eye-icon')).toBeInTheDocument();
  });

  it('handles test variable changes', async () => {
    const user = userEvent.setup();
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    // Find a test variable input (should have sample data)
    const userNameInput = screen.getByDisplayValue('John Doe');
    await user.clear(userNameInput);
    await user.type(userNameInput, 'Jane Smith');
    
    expect(userNameInput).toHaveValue('Jane Smith');
  });

  it('shows loading state during save', () => {
    render(<EmailTemplateCustomization {...defaultProps} isLoading={true} />);
    
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeDisabled();
  });

  it('shows loading state during test email send', async () => {
    const mockOnSendTestEmail = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
    const user = userEvent.setup();
    
    render(<EmailTemplateCustomization {...defaultProps} onSendTestEmail={mockOnSendTestEmail} />);
    
    const testEmailInput = screen.getByPlaceholderText('test@example.com');
    await user.type(testEmailInput, 'test@example.com');
    await user.click(screen.getByText('Send Test Email'));
    
    expect(screen.getByText('Sending...')).toBeInTheDocument();
  });

  it('shows loading state during preview generation', async () => {
    const mockOnPreviewTemplate = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
    const user = userEvent.setup();
    
    render(<EmailTemplateCustomization {...defaultProps} onPreviewTemplate={mockOnPreviewTemplate} />);
    
    await user.click(screen.getByText('Generate Preview'));
    
    expect(screen.getByText('Generating...')).toBeInTheDocument();
  });

  it('handles empty template list', () => {
    render(<EmailTemplateCustomization {...defaultProps} templates={[]} />);
    
    expect(screen.getByText('Select a template to start customizing')).toBeInTheDocument();
  });

  it('prevents sending test email without email address', async () => {
    const user = userEvent.setup();
    render(<EmailTemplateCustomization {...defaultProps} />);
    
    const sendButton = screen.getByText('Send Test Email');
    expect(sendButton).toBeDisabled();
    
    // Add email address
    const testEmailInput = screen.getByPlaceholderText('test@example.com');
    await user.type(testEmailInput, 'test@example.com');
    
    expect(sendButton).not.toBeDisabled();
  });
});