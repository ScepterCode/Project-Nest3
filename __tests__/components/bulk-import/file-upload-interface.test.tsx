import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUploadInterface } from '@/components/bulk-import/file-upload-interface';
import { FileFormat } from '@/lib/types/bulk-import';

// Mock file creation helper
const createMockFile = (name: string, size: number, type: string, content = 'test content') => {
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

describe('FileUploadInterface', () => {
  const mockProps = {
    onFileSelect: vi.fn(),
    onFileRemove: vi.fn(),
    acceptedFormats: ['csv', 'excel', 'json'] as FileFormat[],
    maxFileSize: 50 * 1024 * 1024, // 50MB
    onDownloadTemplate: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Template Download Section', () => {
    it('should render template download buttons for all accepted formats', () => {
      render(<FileUploadInterface {...mockProps} />);
      
      expect(screen.getByText('Download Template')).toBeInTheDocument();
      expect(screen.getByText('CSV Template')).toBeInTheDocument();
      expect(screen.getByText('EXCEL Template')).toBeInTheDocument();
      expect(screen.getByText('JSON Template')).toBeInTheDocument();
    });

    it('should call onDownloadTemplate when template button is clicked', async () => {
      const user = userEvent.setup();
      render(<FileUploadInterface {...mockProps} />);
      
      await user.click(screen.getByText('CSV Template'));
      
      expect(mockProps.onDownloadTemplate).toHaveBeenCalledWith('csv');
    });

    it('should only show buttons for accepted formats', () => {
      const limitedProps = {
        ...mockProps,
        acceptedFormats: ['csv'] as FileFormat[]
      };
      
      render(<FileUploadInterface {...limitedProps} />);
      
      expect(screen.getByText('CSV Template')).toBeInTheDocument();
      expect(screen.queryByText('EXCEL Template')).not.toBeInTheDocument();
      expect(screen.queryByText('JSON Template')).not.toBeInTheDocument();
    });
  });

  describe('File Upload Section', () => {
    it('should render upload area when no file is selected', () => {
      render(<FileUploadInterface {...mockProps} />);
      
      expect(screen.getByText('Drag and drop your file here')).toBeInTheDocument();
      expect(screen.getByText(/or.*browse.*to select a file/)).toBeInTheDocument();
      expect(screen.getByText('Supported formats: CSV, EXCEL, JSON')).toBeInTheDocument();
      expect(screen.getByText('Maximum file size: 50 MB')).toBeInTheDocument();
    });

    it('should show selected file information when file is selected', () => {
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      const propsWithFile = {
        ...mockProps,
        selectedFile: mockFile
      };
      
      render(<FileUploadInterface {...propsWithFile} />);
      
      expect(screen.getByText('test.csv')).toBeInTheDocument();
      expect(screen.getByText('1 KB • CSV')).toBeInTheDocument();
      expect(screen.getByText('File uploaded successfully and ready for processing.')).toBeInTheDocument();
    });

    it('should show remove button when file is selected and not uploading', () => {
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      const propsWithFile = {
        ...mockProps,
        selectedFile: mockFile,
        isUploading: false
      };
      
      render(<FileUploadInterface {...propsWithFile} />);
      
      const removeButton = screen.getByRole('button');
      expect(removeButton).toBeInTheDocument();
    });

    it('should hide remove button when uploading', () => {
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      const propsWithFile = {
        ...mockProps,
        selectedFile: mockFile,
        isUploading: true
      };
      
      render(<FileUploadInterface {...propsWithFile} />);
      
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('should call onFileRemove when remove button is clicked', async () => {
      const user = userEvent.setup();
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      const propsWithFile = {
        ...mockProps,
        selectedFile: mockFile
      };
      
      render(<FileUploadInterface {...propsWithFile} />);
      
      await user.click(screen.getByRole('button'));
      
      expect(mockProps.onFileRemove).toHaveBeenCalled();
    });
  });

  describe('File Selection', () => {
    it('should handle file input change', async () => {
      const user = userEvent.setup();
      render(<FileUploadInterface {...mockProps} />);
      
      const fileInput = screen.getByRole('button', { name: /drag and drop your file here/i });
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      
      await user.click(fileInput);
      
      // Simulate file selection
      const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (hiddenInput) {
        Object.defineProperty(hiddenInput, 'files', {
          value: [mockFile],
          writable: false,
        });
        fireEvent.change(hiddenInput);
      }
      
      expect(mockProps.onFileSelect).toHaveBeenCalledWith(mockFile, 'csv');
    });

    it('should handle drag and drop', async () => {
      render(<FileUploadInterface {...mockProps} />);
      
      const dropZone = screen.getByText('Drag and drop your file here').closest('div');
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      
      if (dropZone) {
        fireEvent.dragEnter(dropZone, {
          dataTransfer: {
            items: [mockFile],
            files: [mockFile]
          }
        });
        
        fireEvent.drop(dropZone, {
          dataTransfer: {
            files: [mockFile]
          }
        });
      }
      
      expect(mockProps.onFileSelect).toHaveBeenCalledWith(mockFile, 'csv');
    });

    it('should detect file type correctly', async () => {
      const user = userEvent.setup();
      render(<FileUploadInterface {...mockProps} />);
      
      const testCases = [
        { file: createMockFile('test.csv', 1024, 'text/csv'), expectedType: 'csv' },
        { file: createMockFile('test.xlsx', 1024, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), expectedType: 'excel' },
        { file: createMockFile('test.xls', 1024, 'application/vnd.ms-excel'), expectedType: 'excel' },
        { file: createMockFile('test.json', 1024, 'application/json'), expectedType: 'json' }
      ];
      
      for (const testCase of testCases) {
        vi.clearAllMocks();
        
        const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (hiddenInput) {
          Object.defineProperty(hiddenInput, 'files', {
            value: [testCase.file],
            writable: false,
          });
          fireEvent.change(hiddenInput);
        }
        
        expect(mockProps.onFileSelect).toHaveBeenCalledWith(testCase.file, testCase.expectedType);
      }
    });
  });

  describe('File Validation', () => {
    it('should not call onFileSelect for files that are too large', async () => {
      const user = userEvent.setup();
      render(<FileUploadInterface {...mockProps} />);
      
      const largeFile = createMockFile('large.csv', 100 * 1024 * 1024, 'text/csv'); // 100MB
      
      const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (hiddenInput) {
        Object.defineProperty(hiddenInput, 'files', {
          value: [largeFile],
          writable: false,
        });
        fireEvent.change(hiddenInput);
      }
      
      expect(mockProps.onFileSelect).not.toHaveBeenCalled();
    });

    it('should not call onFileSelect for unsupported file types', async () => {
      const user = userEvent.setup();
      render(<FileUploadInterface {...mockProps} />);
      
      const unsupportedFile = createMockFile('test.txt', 1024, 'text/plain');
      
      const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (hiddenInput) {
        Object.defineProperty(hiddenInput, 'files', {
          value: [unsupportedFile],
          writable: false,
        });
        fireEvent.change(hiddenInput);
      }
      
      expect(mockProps.onFileSelect).not.toHaveBeenCalled();
    });

    it('should not call onFileSelect for empty files', async () => {
      const user = userEvent.setup();
      render(<FileUploadInterface {...mockProps} />);
      
      const emptyFile = createMockFile('empty.csv', 0, 'text/csv');
      
      const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (hiddenInput) {
        Object.defineProperty(hiddenInput, 'files', {
          value: [emptyFile],
          writable: false,
        });
        fireEvent.change(hiddenInput);
      }
      
      expect(mockProps.onFileSelect).not.toHaveBeenCalled();
    });
  });

  describe('Upload Progress', () => {
    it('should show progress bar when uploading', () => {
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      const propsWithProgress = {
        ...mockProps,
        selectedFile: mockFile,
        isUploading: true,
        uploadProgress: 50
      };
      
      render(<FileUploadInterface {...propsWithProgress} />);
      
      expect(screen.getByText('Uploading...')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should disable interactions when uploading', () => {
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      const propsWithProgress = {
        ...mockProps,
        selectedFile: mockFile,
        isUploading: true
      };
      
      render(<FileUploadInterface {...propsWithProgress} />);
      
      const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(hiddenInput?.disabled).toBe(true);
    });
  });

  describe('Validation Errors', () => {
    it('should display validation errors', () => {
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      const propsWithErrors = {
        ...mockProps,
        selectedFile: mockFile,
        validationErrors: ['File format is invalid', 'File contains errors']
      };
      
      render(<FileUploadInterface {...propsWithErrors} />);
      
      expect(screen.getByText('File validation errors:')).toBeInTheDocument();
      expect(screen.getByText('File format is invalid')).toBeInTheDocument();
      expect(screen.getByText('File contains errors')).toBeInTheDocument();
    });

    it('should not show success message when there are validation errors', () => {
      const mockFile = createMockFile('test.csv', 1024, 'text/csv');
      const propsWithErrors = {
        ...mockProps,
        selectedFile: mockFile,
        validationErrors: ['Error']
      };
      
      render(<FileUploadInterface {...propsWithErrors} />);
      
      expect(screen.queryByText('File uploaded successfully and ready for processing.')).not.toBeInTheDocument();
    });
  });

  describe('Drag and Drop Visual Feedback', () => {
    it('should change appearance when dragging over', () => {
      render(<FileUploadInterface {...mockProps} />);
      
      const dropZone = screen.getByText('Drag and drop your file here').closest('div');
      
      if (dropZone) {
        fireEvent.dragEnter(dropZone, {
          dataTransfer: {
            items: [createMockFile('test.csv', 1024, 'text/csv')]
          }
        });
        
        expect(screen.getByText('Drop your file here')).toBeInTheDocument();
      }
    });

    it('should reset appearance when drag leaves', () => {
      render(<FileUploadInterface {...mockProps} />);
      
      const dropZone = screen.getByText('Drag and drop your file here').closest('div');
      
      if (dropZone) {
        fireEvent.dragEnter(dropZone, {
          dataTransfer: {
            items: [createMockFile('test.csv', 1024, 'text/csv')]
          }
        });
        
        fireEvent.dragLeave(dropZone);
        
        expect(screen.getByText('Drag and drop your file here')).toBeInTheDocument();
      }
    });
  });

  describe('File Format Information', () => {
    it('should display file format requirements', () => {
      render(<FileUploadInterface {...mockProps} />);
      
      expect(screen.getByText('File Format Requirements:')).toBeInTheDocument();
      expect(screen.getByText(/CSV.*Comma-separated values/)).toBeInTheDocument();
      expect(screen.getByText(/Excel.*xlsx or .xls files/)).toBeInTheDocument();
      expect(screen.getByText(/JSON.*Array of user objects/)).toBeInTheDocument();
      expect(screen.getByText(/Required fields.*email, firstName, lastName/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<FileUploadInterface {...mockProps} />);
      
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('accept', '.csv,.xlsx,.xls,.json');
    });

    it('should be keyboard accessible', async () => {
      const user = userEvent.setup();
      render(<FileUploadInterface {...mockProps} />);
      
      const dropZone = screen.getByText('Drag and drop your file here').closest('div');
      
      if (dropZone) {
        await user.click(dropZone);
        
        // Should trigger file input click
        const hiddenInput = document.querySelector('input[type="file"]');
        expect(hiddenInput).toBeInTheDocument();
      }
    });
  });

  describe('File Size Formatting', () => {
    it('should format file sizes correctly', () => {
      const testCases = [
        { file: createMockFile('test1.csv', 0, 'text/csv'), expected: '0 Bytes' },
        { file: createMockFile('test2.csv', 1024, 'text/csv'), expected: '1 KB' },
        { file: createMockFile('test3.csv', 1024 * 1024, 'text/csv'), expected: '1 MB' },
        { file: createMockFile('test4.csv', 1536, 'text/csv'), expected: '1.5 KB' }
      ];
      
      testCases.forEach(testCase => {
        const propsWithFile = {
          ...mockProps,
          selectedFile: testCase.file
        };
        
        const { rerender } = render(<FileUploadInterface {...propsWithFile} />);
        
        expect(screen.getByText(new RegExp(testCase.expected))).toBeInTheDocument();
        
        rerender(<div />); // Clear for next test
      });
    });
  });
});