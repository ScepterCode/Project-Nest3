import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileAppBranding } from '@/components/institution/mobile-app-branding';

// Mock the UI components
jest.mock('@/components/ui/button', () => ({
  Button: (props: any) => {
    const { children, onClick, disabled, variant, size, asChild, ...rest } = props;
    if (asChild) {
      return <div {...rest}>{children}</div>;
    }
    return (
      <button onClick={onClick} disabled={disabled} data-variant={variant} data-size={size} {...rest}>
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

jest.mock('@/components/ui/switch', () => ({
  Switch: (props: any) => {
    const { checked, onCheckedChange, ...rest } = props;
    return (
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange && onCheckedChange(e.target.checked)}
        data-testid="switch"
        {...rest}
      />
    );
  },
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
  Smartphone: () => <div data-testid="smartphone-icon" />,
  Upload: () => <div data-testid="upload-icon" />,
  Eye: () => <div data-testid="eye-icon" />,
  Download: () => <div data-testid="download-icon" />,
  Info: () => <div data-testid="info-icon" />,
}));

const mockConfig = {
  appName: 'Test Institution App',
  appIcon: 'https://example.com/app-icon.png',
  splashScreenLogo: 'https://example.com/splash-logo.png',
  primaryColor: '#1f2937',
  secondaryColor: '#374151',
  accentColor: '#3b82f6',
  statusBarStyle: 'light' as const,
  navigationBarColor: '#1f2937',
  tabBarColor: '#ffffff',
  welcomeMessage: 'Welcome to our mobile app',
  pushNotificationIcon: 'https://example.com/notification-icon.png',
  customFonts: {
    primary: 'Inter, sans-serif',
    secondary: 'Roboto, sans-serif'
  },
  darkModeSupport: false,
  darkModeColors: {
    primaryColor: '#1a1a1a',
    secondaryColor: '#2a2a2a',
    accentColor: '#4a90e2',
    backgroundColor: '#000000'
  }
};

const defaultProps = {
  institutionId: 'test-institution-id',
  currentConfig: mockConfig,
  onUpdate: jest.fn(),
  onUploadAsset: jest.fn(),
  onGeneratePreview: jest.fn(),
  isLoading: false,
  canCustomizeMobileApp: true,
};

describe('MobileAppBranding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the mobile app branding interface', () => {
    render(<MobileAppBranding {...defaultProps} />);
    
    expect(screen.getByText('Mobile App Branding')).toBeInTheDocument();
    expect(screen.getByText('Customize your institution\'s mobile app appearance and branding')).toBeInTheDocument();
  });

  it('displays upgrade required message when mobile app customization is not allowed', () => {
    render(<MobileAppBranding {...defaultProps} canCustomizeMobileApp={false} />);
    
    expect(screen.getByText('Mobile App Branding')).toBeInTheDocument();
    expect(screen.getByText('Mobile app branding customization is not available on your current plan.')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('Upgrade Required');
  });

  it('displays current configuration values', () => {
    render(<MobileAppBranding {...defaultProps} />);
    
    expect(screen.getByDisplayValue('Test Institution App')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Welcome to our mobile app')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#1f2937')).toBeInTheDocument();
  });

  it('shows mobile preview with device selection', () => {
    render(<MobileAppBranding {...defaultProps} />);
    
    expect(screen.getByText('Mobile Preview')).toBeInTheDocument();
    expect(screen.getByText('Live preview of your mobile app branding')).toBeInTheDocument();
    expect(screen.getByTestId('smartphone-icon')).toBeInTheDocument();
  });

  it('handles app name changes', async () => {
    const user = userEvent.setup();
    render(<MobileAppBranding {...defaultProps} />);
    
    const appNameInput = screen.getByDisplayValue('Test Institution App');
    await user.clear(appNameInput);
    await user.type(appNameInput, 'New App Name');
    
    expect(appNameInput).toHaveValue('New App Name');
  });

  it('handles color changes', async () => {
    const user = userEvent.setup();
    render(<MobileAppBranding {...defaultProps} />);
    
    const primaryColorInput = screen.getByDisplayValue('#1f2937');
    await user.clear(primaryColorInput);
    await user.type(primaryColorInput, '#ff0000');
    
    expect(primaryColorInput).toHaveValue('#ff0000');
  });

  it('handles welcome message changes', async () => {
    const user = userEvent.setup();
    render(<MobileAppBranding {...defaultProps} />);
    
    const welcomeMessageTextarea = screen.getByDisplayValue('Welcome to our mobile app');
    await user.clear(welcomeMessageTextarea);
    await user.type(welcomeMessageTextarea, 'New welcome message');
    
    expect(welcomeMessageTextarea).toHaveValue('New welcome message');
  });

  it('handles dark mode toggle', async () => {
    const user = userEvent.setup();
    render(<MobileAppBranding {...defaultProps} />);
    
    const darkModeSwitch = screen.getByTestId('switch');
    expect(darkModeSwitch).not.toBeChecked();
    
    await user.click(darkModeSwitch);
    expect(darkModeSwitch).toBeChecked();
  });

  it('shows dark mode colors when dark mode is enabled', async () => {
    const user = userEvent.setup();
    const configWithDarkMode = {
      ...mockConfig,
      darkModeSupport: true
    };
    
    render(<MobileAppBranding {...defaultProps} currentConfig={configWithDarkMode} />);
    
    expect(screen.getByText('Dark Mode Colors')).toBeInTheDocument();
    expect(screen.getByText('Dark Primary Color')).toBeInTheDocument();
    expect(screen.getByText('Dark Background Color')).toBeInTheDocument();
  });

  it('handles asset upload', async () => {
    const mockOnUploadAsset = jest.fn().mockResolvedValue({
      success: true,
      assetUrl: 'https://example.com/new-icon.png'
    });
    
    render(<MobileAppBranding {...defaultProps} onUploadAsset={mockOnUploadAsset} />);
    
    const uploadButton = screen.getByText('Upload Icon');
    const fileInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    
    if (fileInput) {
      const file = new File(['icon'], 'icon.png', { type: 'image/png' });
      await userEvent.upload(fileInput, file);
      
      await waitFor(() => {
        expect(mockOnUploadAsset).toHaveBeenCalledWith(file, 'appIcon');
      });
    }
  });

  it('handles asset upload error', async () => {
    const mockOnUploadAsset = jest.fn().mockResolvedValue({
      success: false,
      errors: [{ message: 'File too large' }]
    });
    
    render(<MobileAppBranding {...defaultProps} onUploadAsset={mockOnUploadAsset} />);
    
    const uploadButton = screen.getByText('Upload Icon');
    const fileInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    
    if (fileInput) {
      const file = new File(['icon'], 'icon.png', { type: 'image/png' });
      await userEvent.upload(fileInput, file);
      
      await waitFor(() => {
        expect(screen.getByText('File too large')).toBeInTheDocument();
      });
    }
  });

  it('handles configuration save', async () => {
    const mockOnUpdate = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();
    
    render(<MobileAppBranding {...defaultProps} onUpdate={mockOnUpdate} />);
    
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(mockConfig);
    });
  });

  it('handles configuration save with errors', async () => {
    const mockOnUpdate = jest.fn().mockResolvedValue({
      success: false,
      errors: [{ field: 'appName', message: 'App name is required' }]
    });
    const user = userEvent.setup();
    
    render(<MobileAppBranding {...defaultProps} onUpdate={mockOnUpdate} />);
    
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText('App name is required')).toBeInTheDocument();
    });
  });

  it('handles preview generation', async () => {
    const mockOnGeneratePreview = jest.fn().mockResolvedValue({
      success: true,
      previewUrl: 'https://example.com/preview.png'
    });
    const user = userEvent.setup();
    
    render(<MobileAppBranding {...defaultProps} onGeneratePreview={mockOnGeneratePreview} />);
    
    const generatePreviewButton = screen.getByText('Generate Preview');
    await user.click(generatePreviewButton);
    
    await waitFor(() => {
      expect(mockOnGeneratePreview).toHaveBeenCalledWith(mockConfig);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Download Preview')).toBeInTheDocument();
    });
  });

  it('shows loading state during save', () => {
    render(<MobileAppBranding {...defaultProps} isLoading={true} />);
    
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeDisabled();
  });

  it('shows loading state during preview generation', async () => {
    const mockOnGeneratePreview = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
    const user = userEvent.setup();
    
    render(<MobileAppBranding {...defaultProps} onGeneratePreview={mockOnGeneratePreview} />);
    
    const generatePreviewButton = screen.getByText('Generate Preview');
    await user.click(generatePreviewButton);
    
    expect(screen.getByText('Generating...')).toBeInTheDocument();
  });

  it('shows loading state during asset upload', async () => {
    const mockOnUploadAsset = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));
    
    render(<MobileAppBranding {...defaultProps} onUploadAsset={mockOnUploadAsset} />);
    
    const uploadButton = screen.getByText('Upload Icon');
    const fileInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    
    if (fileInput) {
      const file = new File(['icon'], 'icon.png', { type: 'image/png' });
      await userEvent.upload(fileInput, file);
      
      expect(screen.getByText('Uploading...')).toBeInTheDocument();
    }
  });

  it('displays current assets when available', () => {
    render(<MobileAppBranding {...defaultProps} />);
    
    const appIconImage = screen.getByAltText('App icon');
    expect(appIconImage).toHaveAttribute('src', 'https://example.com/app-icon.png');
    
    const splashLogoImage = screen.getByAltText('Splash screen logo');
    expect(splashLogoImage).toHaveAttribute('src', 'https://example.com/splash-logo.png');
  });

  it('handles font configuration changes', async () => {
    const user = userEvent.setup();
    render(<MobileAppBranding {...defaultProps} />);
    
    const primaryFontInput = screen.getByDisplayValue('Inter, sans-serif');
    await user.clear(primaryFontInput);
    await user.type(primaryFontInput, 'Roboto, sans-serif');
    
    expect(primaryFontInput).toHaveValue('Roboto, sans-serif');
  });

  it('toggles between light and dark preview modes', async () => {
    const user = userEvent.setup();
    render(<MobileAppBranding {...defaultProps} />);
    
    // Find the theme toggle button (moon/sun emoji)
    const themeToggle = screen.getByText('🌙');
    await user.click(themeToggle);
    
    expect(screen.getByText('☀️')).toBeInTheDocument();
  });

  it('applies preview styles correctly', () => {
    render(<MobileAppBranding {...defaultProps} />);
    
    // The preview should apply the configured styles
    const previewContainer = screen.getByText('Your App').closest('div');
    expect(previewContainer).toHaveStyle({
      '--primary-color': '#1f2937',
      '--secondary-color': '#374151',
      '--accent-color': '#3b82f6'
    });
  });

  it('shows device preview options', () => {
    render(<MobileAppBranding {...defaultProps} />);
    
    // Should show device selection
    expect(screen.getByTestId('select')).toBeInTheDocument();
  });

  it('displays app preview content', () => {
    render(<MobileAppBranding {...defaultProps} />);
    
    // Should show app name in preview
    expect(screen.getByText('Test Institution App')).toBeInTheDocument();
    
    // Should show welcome message in preview
    expect(screen.getByText('Welcome to our mobile app')).toBeInTheDocument();
    
    // Should show navigation elements
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.getByText('Grades')).toBeInTheDocument();
  });

  it('shows status bar with correct styling', () => {
    render(<MobileAppBranding {...defaultProps} />);
    
    // Should show status bar elements
    expect(screen.getByText('9:41')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('handles nested configuration changes for dark mode colors', async () => {
    const user = userEvent.setup();
    const configWithDarkMode = {
      ...mockConfig,
      darkModeSupport: true
    };
    
    render(<MobileAppBranding {...defaultProps} currentConfig={configWithDarkMode} />);
    
    const darkPrimaryColorInput = screen.getByDisplayValue('#1a1a1a');
    await user.clear(darkPrimaryColorInput);
    await user.type(darkPrimaryColorInput, '#333333');
    
    expect(darkPrimaryColorInput).toHaveValue('#333333');
  });
});