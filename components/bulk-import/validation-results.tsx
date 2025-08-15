'use client';

import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Info, 
  ChevronDown, 
  ChevronRight,
  Download,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ValidationResult } from '@/lib/types/bulk-import';

interface ValidationResultsProps {
  validationResult: ValidationResult;
  onRetry?: () => void;
  onProceed?: () => void;
  onDownloadErrorReport?: () => void;
  isProcessing?: boolean;
  showProceedButton?: boolean;
}

interface ValidationResultsProps {
  validationResult: ValidationResult;
  onRetry?: () => void;
  onProceed?: () => void;
  onDownloadErrorReport?: () => void;
  isProcessing?: boolean;
  showProceedButton?: boolean;
}

export function ValidationResults({
  validationResult,
  onRetry,
  onProceed,
  onDownloadErrorReport,
  isProcessing = false,
  showProceedButton = true
}: ValidationResultsProps) {
  const [showErrors, setShowErrors] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const { isValid, errors, warnings, suggestions, summary } = validationResult;

  const getStatusIcon = () => {
    if (errors.length > 0) {
      return <XCircle className="h-5 w-5 text-red-500" />;
    } else if (warnings.length > 0) {
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    } else {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
  };

  const getStatusMessage = () => {
    if (errors.length > 0) {
      return `Validation failed with ${errors.length} error${errors.length > 1 ? 's' : ''}`;
    } else if (warnings.length > 0) {
      return `Validation passed with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;
    } else {
      return 'Validation passed successfully';
    }
  };

  const getStatusColor = () => {
    if (errors.length > 0) return 'text-red-600';
    if (warnings.length > 0) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="space-y-6">
      {/* Validation Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon()}
            Validation Results
          </CardTitle>
          <CardDescription className={getStatusColor()}>
            {getStatusMessage()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Summary Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{summary.totalRecords}</div>
              <div className="text-sm text-gray-600">Total Records</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{summary.validRecords}</div>
              <div className="text-sm text-gray-600">Valid Records</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{errors.length}</div>
              <div className="text-sm text-gray-600">Errors</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{warnings.length}</div>
              <div className="text-sm text-gray-600">Warnings</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {onRetry && (
              <Button
                variant="outline"
                onClick={onRetry}
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Validation
              </Button>
            )}
            
            {onDownloadErrorReport && (errors.length > 0 || warnings.length > 0) && (
              <Button
                variant="outline"
                onClick={onDownloadErrorReport}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Report
              </Button>
            )}
            
            {showProceedButton && onProceed && isValid && (
              <Button
                onClick={onProceed}
                disabled={isProcessing}
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Proceed with Import
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Issues */}
      {(errors.length > 0 || warnings.length > 0 || suggestions.length > 0) && (
        <div className="space-y-4">
          {/* Errors Section */}
          {errors.length > 0 && (
            <Card>
              <Collapsible open={showErrors} onOpenChange={setShowErrors}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        Errors ({errors.length})
                        <Badge variant="destructive">{errors.length}</Badge>
                      </div>
                      {showErrors ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-3">
                        {errors.map((error, index) => (
                          <Alert key={index} variant="destructive">
                            <XCircle className="h-4 w-4" />
                            <AlertDescription>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  {error.row && <Badge variant="outline">Row {error.row}</Badge>}
                                  {error.fieldName && <Badge variant="outline">{error.fieldName}</Badge>}
                                  <Badge variant="destructive">{error.code}</Badge>
                                </div>
                                <p className="font-medium">{error.errorMessage}</p>
                                {error.fieldValue && (
                                  <p className="text-sm text-gray-600">
                                    Value: <code className="bg-gray-100 px-1 rounded">{String(error.fieldValue)}</code>
                                  </p>
                                )}
                                {error.suggestedFix && (
                                  <p className="text-sm text-blue-600">
                                    💡 Suggestion: {error.suggestedFix}
                                  </p>
                                )}
                              </div>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}

          {/* Warnings Section */}
          {warnings.length > 0 && (
            <Card>
              <Collapsible open={showWarnings} onOpenChange={setShowWarnings}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        Warnings ({warnings.length})
                        <Badge variant="secondary">{warnings.length}</Badge>
                      </div>
                      {showWarnings ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-3">
                        {warnings.map((warning, index) => (
                          <Alert key={index}>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  {warning.row && <Badge variant="outline">Row {warning.row}</Badge>}
                                  {warning.fieldName && <Badge variant="outline">{warning.fieldName}</Badge>}
                                  <Badge variant="secondary">{warning.code}</Badge>
                                </div>
                                <p className="font-medium">{warning.warningMessage}</p>
                                {warning.fieldValue && (
                                  <p className="text-sm text-gray-600">
                                    Value: <code className="bg-gray-100 px-1 rounded">{String(warning.fieldValue)}</code>
                                  </p>
                                )}
                              </div>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}

          {/* Suggestions Section */}
          {suggestions.length > 0 && (
            <Card>
              <Collapsible open={showSuggestions} onOpenChange={setShowSuggestions}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-blue-500" />
                        Suggestions ({suggestions.length})
                      </div>
                      {showSuggestions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-2">
                      {suggestions.map((suggestion, index) => (
                        <Alert key={index}>
                          <Info className="h-4 w-4" />
                          <AlertDescription>{suggestion}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </div>
      )}

      {/* Success Message */}
      {isValid && errors.length === 0 && warnings.length === 0 && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            All {summary.totalRecords} records passed validation successfully. Your data is ready to be imported.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}