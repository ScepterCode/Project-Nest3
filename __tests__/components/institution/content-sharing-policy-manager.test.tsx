import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContentSharingPolicyManager } from '@/components/institution/content-sharing-policy-manager';

// Mock fetch
global.fetch = jest.fn();

const mockPolicies = [
  {
    id: 'policy-1',
    institutionId: 'inst-1',
    resourceType: 'assignment',
    sharingLevel: 'department',
    conditions: { requireApproval: false },
    attributionRequired: true,
    allowCrossInstitution: false,
    restrictedDomains: [],
    allowedDomains: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1'
  },
  {
    id: 'policy-2',
    institutionId: 'inst-1',
    resourceType: 'class',
    sharingLevel: 'institution',
    conditions: { requireApproval: true },
    attributionRequired: false,
    allowCrossInstitution: true,
    restrictedDomains: ['restricted.edu'],
    allowedDomains: ['partner.edu'],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1'
  }
];

const mockCollaborationSettings = {
  id: 'settings-1',
  institutionId: 'inst-1',
  allowCrossInstitutionCollaboration: true,
  allowCrossDepartmentCollaboration: true,
  defaultPermissions: ['view', 'comment'],
  approvalRequired: false,
  approverRoles: ['admin'],
  maxCollaborators: 10,
  allowExternalCollaborators: false,
  externalDomainWhitelist: [],
  createdAt: new Date(),
  updatedAt: new Date()
};

describe('ContentSharingPolicyManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders content sharing policy manager', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    expect(screen.getByText('Content Sharing & Collaboration')).toBeInTheDocument();
    expect(screen.getByText('Manage how content is shared and collaborated on within and outside your institution')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Sharing Policies')).toBeInTheDocument();
      expect(screen.getByText('Collaboration Settings')).toBeInTheDocument();
    });
  });

  it('displays existing policies', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      expect(screen.getByText('Assignment')).toBeInTheDocument();
      expect(screen.getByText('Class')).toBeInTheDocument();
      expect(screen.getByText('Max: department')).toBeInTheDocument();
      expect(screen.getByText('Max: institution')).toBeInTheDocument();
    });
  });

  it('shows policy badges correctly', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      expect(screen.getByText('Attribution Required')).toBeInTheDocument();
      expect(screen.getByText('Cross-Institution Allowed')).toBeInTheDocument();
      expect(screen.getByText('Approval Required')).toBeInTheDocument();
    });
  });

  it('shows domain restrictions', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      expect(screen.getByText('Restricted: restricted.edu')).toBeInTheDocument();
      expect(screen.getByText('Allowed: partner.edu')).toBeInTheDocument();
    });
  });

  it('opens new policy form when add button is clicked', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const addButton = screen.getByText('Add New Policy');
      fireEvent.click(addButton);
    });

    expect(screen.getByText('New Sharing Policy')).toBeInTheDocument();
    expect(screen.getByLabelText('Resource Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Maximum Sharing Level')).toBeInTheDocument();
  });

  it('creates new policy', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'new-policy' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockPolicies[0]]
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const addButton = screen.getByText('Add New Policy');
      fireEvent.click(addButton);
    });

    // Fill form
    const resourceTypeSelect = screen.getByLabelText('Resource Type');
    fireEvent.click(resourceTypeSelect);
    fireEvent.click(screen.getByText('Assignment'));

    const sharingLevelSelect = screen.getByLabelText('Maximum Sharing Level');
    fireEvent.click(sharingLevelSelect);
    fireEvent.click(screen.getByText('Department'));

    const attributionSwitch = screen.getByLabelText('Require Attribution');
    fireEvent.click(attributionSwitch);

    const createButton = screen.getByText('Create Policy');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/institutions/inst-1/content-policies',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"resourceType":"assignment"')
        })
      );
    });
  });

  it('edits existing policy', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockPolicies[0], sharingLevel: 'institution' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);
    });

    expect(screen.getByText('Edit Policy')).toBeInTheDocument();

    const sharingLevelSelect = screen.getByLabelText('Maximum Sharing Level');
    fireEvent.click(sharingLevelSelect);
    fireEvent.click(screen.getByText('Institution'));

    const updateButton = screen.getByText('Update Policy');
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/content-policies/${mockPolicies[0].id}`,
        expect.objectContaining({
          method: 'PUT'
        })
      );
    });
  });

  it('deletes policy with confirmation', async () => {
    // Mock window.confirm
    window.confirm = jest.fn(() => true);

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]);
    });

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this policy?');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/content-policies/${mockPolicies[0].id}`,
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  it('switches to collaboration settings tab', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const collaborationTab = screen.getByText('Collaboration Settings');
      fireEvent.click(collaborationTab);
    });

    expect(screen.getByText('Configure how users can collaborate on content within and outside your institution')).toBeInTheDocument();
    expect(screen.getByLabelText('Allow Cross-Institution Collaboration')).toBeInTheDocument();
    expect(screen.getByLabelText('Allow Cross-Department Collaboration')).toBeInTheDocument();
  });

  it('updates collaboration settings', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockCollaborationSettings, allowCrossInstitutionCollaboration: false })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockCollaborationSettings, allowCrossInstitutionCollaboration: false })
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const collaborationTab = screen.getByText('Collaboration Settings');
      fireEvent.click(collaborationTab);
    });

    const crossInstitutionSwitch = screen.getByLabelText('Allow Cross-Institution Collaboration');
    fireEvent.click(crossInstitutionSwitch);

    const saveButton = screen.getByText('Save Collaboration Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/collaboration-settings/${mockCollaborationSettings.id}`,
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
  });

  it('shows empty state when no policies exist', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      expect(screen.getByText('No content sharing policies configured. Add a policy to control how content is shared.')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error('API Error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load policies:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('validates policy form inputs', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const addButton = screen.getByText('Add New Policy');
      fireEvent.click(addButton);
    });

    // Test domain input validation
    const restrictedDomainsInput = screen.getByLabelText('Restricted Domains (comma-separated)');
    fireEvent.change(restrictedDomainsInput, { target: { value: 'example.com, test.edu' } });

    expect(restrictedDomainsInput).toHaveValue('example.com, test.edu');

    const allowedDomainsInput = screen.getByLabelText('Allowed Domains (comma-separated)');
    fireEvent.change(allowedDomainsInput, { target: { value: 'partner.edu' } });

    expect(allowedDomainsInput).toHaveValue('partner.edu');
  });

  it('handles collaboration settings for departments', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockCollaborationSettings, departmentId: 'dept-1' })
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" departmentId="dept-1" />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/departments/dept-1/collaboration-settings');
    });
  });

  it('calls onPolicyChange callback when policies are loaded', async () => {
    const onPolicyChange = jest.fn();

    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockCollaborationSettings
      });

    render(
      <ContentSharingPolicyManager 
        institutionId="inst-1" 
        onPolicyChange={onPolicyChange}
      />
    );

    await waitFor(() => {
      expect(onPolicyChange).toHaveBeenCalledWith(mockPolicies);
    });
  });

  it('disables external domain input when external collaborators is disabled', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockCollaborationSettings, allowExternalCollaborators: false })
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const collaborationTab = screen.getByText('Collaboration Settings');
      fireEvent.click(collaborationTab);
    });

    const externalDomainsInput = screen.getByLabelText('External Domain Whitelist (comma-separated)');
    expect(externalDomainsInput).toBeDisabled();
  });

  it('disables approver roles input when approval is not required', async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockCollaborationSettings, approvalRequired: false })
      });

    render(<ContentSharingPolicyManager institutionId="inst-1" />);

    await waitFor(() => {
      const collaborationTab = screen.getByText('Collaboration Settings');
      fireEvent.click(collaborationTab);
    });

    const approverRolesInput = screen.getByLabelText('Approver Roles (comma-separated)');
    expect(approverRolesInput).toBeDisabled();
  });
});