import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateEditor } from '@/components/notifications/template-editor';
import { NotificationTemplate, BrandingConfig } from '@/lib/types/enhanced-notifications';

// Mock the auth context
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' }
  })
}));

const mockBranding = {
  primary_color: '#007bff',
  secondary_color: '#6c757d',
  font_family: 'Arial, sans-serif',
  header_text: 'Test Institution',
  footer_text: 'Test Footer'
};

const mockTemplate = {
  id: 'test-template',
  institution_id: 'test-institution',
  name: 'Test Template',
  type: 'system_message',
  subject_template: 'Test Subject {{name}}',
  html_template: '<p>Hello {{name}}</p>',
  text_template: 'Hello {{name}}',
  variables: [
    {
      name: 'name',
      type: 'text',
      description: 'User name',
      required: true
    }
  ],
  conditions: [],
  is_active: true,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  created_by: 'test-user',
  version: 1
};

describe('TemplateEditor', () => {
  const mockOnSave = jest.fn();
  const mockOnPreview = jest.fn();
  const mockOnTest = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders template editor with empty form for new template', () => {
    render(
      <TemplateEditor
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    expect(screen.getByText('Create Template')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter template name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter email subject template with {{variables}}')).toBeInTheDocument();
  });

  it('renders template editor with existing template data', () => {
    render(
      <TemplateEditor
        template={mockTemplate}
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    expect(screen.getByText('Edit Template')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Template')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Subject {{name}}')).toBeInTheDocument();
  });

  it('allows editing template fields', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    const nameInput = screen.getByPlaceholderText('Enter template name');
    await user.type(nameInput, 'New Template');

    expect(nameInput).toHaveValue('New Template');
  });

  it('allows adding and removing variables', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    // Switch to variables tab
    await user.click(screen.getByText('Variables'));

    // Add a variable
    await user.click(screen.getByText('Add Variable'));

    expect(screen.getByText('Variable 1')).toBeInTheDocument();

    // Fill in variable details
    const variableNameInput = screen.getByPlaceholderText('variable_name');
    await user.type(variableNameInput, 'test_var');

    expect(variableNameInput).toHaveValue('test_var');
  });

  it('calls onSave when save button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    // Fill in required fields
    await user.type(screen.getByPlaceholderText('Enter template name'), 'Test Template');
    await user.type(screen.getByPlaceholderText('Enter email subject template with {{variables}}'), 'Test Subject');

    // Click save
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Template',
          subject_template: 'Test Subject'
        })
      );
    });
  });

  it('calls onPreview when preview button is clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        template={mockTemplate}
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    await user.click(screen.getByText('Preview'));

    await waitFor(() => {
      expect(mockOnPreview).toHaveBeenCalled();
    });
  });

  it('calls onTest when test button is clicked with recipients', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        template={mockTemplate}
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    // Switch to testing tab
    await user.click(screen.getByText('Testing'));

    // Add test recipients
    const recipientsInput = screen.getByPlaceholderText('user1,user2,user3');
    await user.type(recipientsInput, 'test-user-1,test-user-2');

    // Click test button
    await user.click(screen.getByText('Test'));

    await waitFor(() => {
      expect(mockOnTest).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Template'
        }),
        ['test-user-1', 'test-user-2'],
        expect.any(Object)
      );
    });
  });

  it('shows branding variables in styling tab', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    // Switch to styling tab
    await user.click(screen.getByText('Styling'));

    expect(screen.getByText('{{primary_color}}')).toBeInTheDocument();
    expect(screen.getByText('{{logo_url}}')).toBeInTheDocument();
    expect(screen.getByText('Current Branding')).toBeInTheDocument();
  });

  it('inserts variables when clicked', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        template={mockTemplate}
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    // The template has a 'name' variable, click on it
    const variableBadge = screen.getByText('name');
    await user.click(variableBadge);

    // Check if the variable was inserted into the subject template
    const subjectInput = screen.getByDisplayValue('Test Subject {{name}}');
    expect(subjectInput).toHaveValue('Test Subject {{name}}{{name}}');
  });

  it('validates required fields before saving', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    // Try to save without filling required fields
    const saveButton = screen.getByText('Save');
    expect(saveButton).toBeDisabled();

    // Fill in name but not subject
    await user.type(screen.getByPlaceholderText('Enter template name'), 'Test');
    expect(saveButton).toBeDisabled();

    // Fill in subject
    await user.type(screen.getByPlaceholderText('Enter email subject template with {{variables}}'), 'Subject');
    expect(saveButton).not.toBeDisabled();
  });

  it('toggles template active status', async () => {
    const user = userEvent.setup();
    
    render(
      <TemplateEditor
        template={mockTemplate}
        onSave={mockOnSave}
        onPreview={mockOnPreview}
        onTest={mockOnTest}
        branding={mockBranding}
      />
    );

    const activeSwitch = screen.getByRole('switch', { name: /active template/i });
    expect(activeSwitch).toBeChecked();

    await user.click(activeSwitch);
    expect(activeSwitch).not.toBeChecked();
  });
});