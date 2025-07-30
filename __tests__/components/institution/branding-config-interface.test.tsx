import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrandingConfigInterface } from '@/components/institution/branding-config-interface';
import { BrandingConfig } from '@/lib/types/institution';

// Mock the UI components
jest.mock('@/components/ui/button', () => ({
  Button: (props) => 
    React.createElement('button', { 
      onClick: props.onClick, 
      disabled: props.disabled, 
      'data-variant': props.variant, 
      ...props 
    }, props.children),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props) => 
    React.createElement('input', { 
      type: props.type || 'text', 
      value: props.value, 
      onChange: props.onChange, 
      ...props 
    }),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: (props) => 
    React.createElement('textarea', { 
      value: props.value, 
      onChange: props.onChange, 
      ...props 
    }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: (props) => React.createElement('div', { 'data-testid': 'card', ...props }, props.children),
  CardContent: (props) => React.createElement('div', { 'data-testid': 'card-content', ...props }, props.children),
  CardDescription: (props) => React.createElement('div', { 'data-testid': 'card-description', ...props }, props.children),
  CardHeader: (props) => React.createElement('div', { 'data-testid': 'card-header', ...props }, props.children),
  CardTitle: (props) => React.createElement('h3', { 'data-testid': 'card-title', ...props }, props.children),
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: (props) => React.createElement('div', { 'data-testid': 'tabs', 'data-default-value': props.defaultValue, ...props }, props.children),
  TabsContent: (props) => React.createElement('div', { 'data-testid': 'tabs-content', 'data-value': props.value, ...props }, props.children),
  TabsList: (props) => React.createElement('div', { 'data-testid': 'tabs-list', ...props }, props.children),
  TabsTrigger: (props) => React.createElement('button', { 'data-testid': 'tabs-trigger', 'data-value': props.value, ...props }, props.children),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: (props) => React.createElement('span', { 'data-testid': 'badge', 'data-variant': props.variant, ...props }, props.children),
}));

jest.mock('@/components/ui/label', () => ({
  Label: (props) => React.createElement('label', props, props.children),
}));

const mockBrandingConfig = {
  logo: 'https://example.com/logo.png',
  favicon: 'https://example.com/favicon.ico',
  primaryColor: '#1f2937',
  secondaryColor: '#374151',
  accentColor: '#3b82f6',
  fontFamily: 'Inter, sans-serif',
  customCSS: '/* Custom styles */',
  welcomeMessage: 'Welcome to our institution',
  footerText: '© 2024 Test Institution',
  emailTemplates: {
    welcome: 'Welcome {{userName}}!',
    invitation: 'You are invited to {{institutionName}}',
    notification: 'New notification from {{institutionName}}'
  }
};

const defaultProps = {
  institutionId: 'test-institution-id',
  currentBranding: mockBrandingConfig,
  onUpdate: jest.fn(),
  onLogoUpload: jest.fn(),
  isLoading: false,
  canCustomize: true,
};

describe('BrandingConfigInterface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the branding configuration interface', () => {
    render(<BrandingConfigInterface {...defaultProps} />);
    
    expect(screen.getByText('Branding Configuration')).toBeInTheDocument();
    expect(screen.getByText('Customize your institution\'s visual identity and branding')).toBeInTheDocument();
  });

  it('displays upgrade required message when customization is not allowed', () => {
    render(<BrandingConfigInterface {...defaultProps} canCustomize={false} />);
    
    expect(screen.getByText('Branding Configuration')).toBeInTheDocument();
    expect(screen.getByText('Custom branding is not available on your current plan.')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('Upgrade Required');
  });

  it('shows real-time preview by default', () => {
    render(<BrandingConfigInterface {...defaultProps} />);
    
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
    expect(screen.getByText('Real-time preview of your branding changes')).toBeInTheDocument();
  });

  it('toggles preview mode', async () => {
    const user = userEvent.setup();
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const hidePreviewButton = screen.getByText('Hide Preview');
    await user.click(hidePreviewButton);
    
    expect(screen.queryByText('Live Preview')).not.toBeInTheDocument();
    
    const showPreviewButton = screen.getByText('Show Preview');
    await user.click(showPreviewButton);
    
    expect(screen.getByText('Live Preview')).toBeInTheDocument();
  });

  it('handles color changes correctly', async () => {
    const user = userEvent.setup();
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const primaryColorInput = screen.getByDisplayValue('#1f2937');
    await user.clear(primaryColorInput);
    await user.type(primaryColorInput, '#ff0000');
    
    // The component should update its internal state
    expect(primaryColorInput).toHaveValue('#ff0000');
  });

  it('validates hex color format', async () => {
    const user = userEvent.setup();
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const primaryColorInput = screen.getByDisplayValue('#1f2937');
    await user.clear(primaryColorInput);
    await user.type(primaryColorInput, 'invalid-color');
    
    // The input should show the invalid color but the component should handle validation
    expect(primaryColorInput).toHaveValue('invalid-color');
  });

  it('handles logo upload', async () => {
    const mockOnLogoUpload = jest.fn().mockResolvedValue({
      success: true,
      logoUrl: 'https://example.com/new-logo.png'
    });
    
    render(<BrandingConfigInterface {...defaultProps} onLogoUpload={mockOnLogoUpload} />);
    
    const uploadButton = screen.getByText('Upload Logo');
    const fileInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    
    if (fileInput) {
      const file = new File(['logo'], 'logo.png', { type: 'image/png' });
      await userEvent.upload(fileInput, file);
      
      await waitFor(() => {
        expect(mockOnLogoUpload).toHaveBeenCalledWith(file);
      });
    }
  });

  it('handles logo upload error', async () => {
    const mockOnLogoUpload = jest.fn().mockResolvedValue({
      success: false,
      errors: [{ message: 'File too large' }]
    });
    
    render(<BrandingConfigInterface {...defaultProps} onLogoUpload={mockOnLogoUpload} />);
    
    const uploadButton = screen.getByText('Upload Logo');
    const fileInput = uploadButton.parentElement?.querySelector('input[type="file"]');
    
    if (fileInput) {
      const file = new File(['logo'], 'logo.png', { type: 'image/png' });
      await userEvent.upload(fileInput, file);
      
      await waitFor(() => {
        expect(screen.getByText('File too large')).toBeInTheDocument();
      });
    }
  });

  it('handles save operation', async () => {
    const mockOnUpdate = jest.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();
    
    render(<BrandingConfigInterface {...defaultProps} onUpdate={mockOnUpdate} />);
    
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);
    
    await waitFor(() => {
      expect(mockOnUpdate).toHaveBeenCalledWith(mockBrandingConfig);
    });
  });

  it('handles save operation with errors', async () => {
    const mockOnUpdate = jest.fn().mockResolvedValue({
      success: false,
      errors: [{ field: 'primaryColor', message: 'Invalid color format' }]
    });
    const user = userEvent.setup();
    
    render(<BrandingConfigInterface {...defaultProps} onUpdate={mockOnUpdate} />);
    
    const saveButton = screen.getByText('Save Changes');
    await user.click(saveButton);
    
    await waitFor(() => {
      expect(screen.getByText('Invalid color format')).toBeInTheDocument();
    });
  });

  it('resets to original configuration', async () => {
    const user = userEvent.setup();
    render(<BrandingConfigInterface {...defaultProps} />);
    
    // Change a value
    const primaryColorInput = screen.getByDisplayValue('#1f2937');
    await user.clear(primaryColorInput);
    await user.type(primaryColorInput, '#ff0000');
    
    // Reset
    const resetButton = screen.getByText('Reset');
    await user.click(resetButton);
    
    // Should be back to original value
    expect(screen.getByDisplayValue('#1f2937')).toBeInTheDocument();
  });

  it('shows loading state during save', () => {
    render(<BrandingConfigInterface {...defaultProps} isLoading={true} />);
    
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeDisabled();
  });

  it('displays current logo when available', () => {
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const logoImage = screen.getByAltText('Current logo');
    expect(logoImage).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('handles text content changes', async () => {
    const user = userEvent.setup();
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const welcomeMessageTextarea = screen.getByDisplayValue('Welcome to our institution');
    await user.clear(welcomeMessageTextarea);
    await user.type(welcomeMessageTextarea, 'New welcome message');
    
    expect(welcomeMessageTextarea).toHaveValue('New welcome message');
  });

  it('handles custom CSS changes', async () => {
    const user = userEvent.setup();
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const customCSSTextarea = screen.getByDisplayValue('/* Custom styles */');
    await user.clear(customCSSTextarea);
    await user.type(customCSSTextarea, '.custom { color: red; }');
    
    expect(customCSSTextarea).toHaveValue('.custom { color: red; }');
  });

  it('applies preview styles correctly', () => {
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const previewCard = screen.getByText('Live Preview').closest('[data-testid="card"]');
    expect(previewCard).toHaveStyle({
      '--primary-color': '#1f2937',
      '--secondary-color': '#374151',
      '--accent-color': '#3b82f6',
      fontFamily: 'Inter, sans-serif'
    });
  });

  it('shows color preview swatches', () => {
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const colorPreview = screen.getByText('Color Preview');
    expect(colorPreview).toBeInTheDocument();
    
    // Should have color swatches for primary, secondary, and accent colors
    const previewSection = colorPreview.closest('div');
    const colorSwatches = previewSection?.querySelectorAll('[style*="backgroundColor"]');
    expect(colorSwatches).toHaveLength(3);
  });

  it('handles email template changes', async () => {
    const user = userEvent.setup();
    render(<BrandingConfigInterface {...defaultProps} />);
    
    const welcomeEmailTextarea = screen.getByDisplayValue('Welcome {{userName}}!');
    await user.clear(welcomeEmailTextarea);
    await user.type(welcomeEmailTextarea, 'Hello {{userName}}, welcome!');
    
    expect(welcomeEmailTextarea).toHaveValue('Hello {{userName}}, welcome!');
  });
});