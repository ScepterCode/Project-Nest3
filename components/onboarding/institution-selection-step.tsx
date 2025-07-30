"use client";

import React, { useState, useEffect } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useInstitutionSearch } from '@/lib/hooks/useOnboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InstitutionSearchResult } from '@/lib/types/onboarding';
import { 
  Search, 
  Building, 
  Users, 
  ChevronRight,
  Check,
  Plus,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function InstitutionSelectionStep() {
  const { onboardingData, updateOnboardingData, nextStep } = useOnboarding();
  const { 
    institutions, 
    loading, 
    error, 
    searchInstitutions, 
    selectInstitution,
    clearSearch 
  } = useInstitutionSearch();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState<InstitutionSearchResult | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load selected institution if already chosen
  useEffect(() => {
    if (onboardingData.institutionId && !selectedInstitution) {
      // In a real app, you'd fetch the institution details here
      // For now, we'll just show that one is selected
    }
  }, [onboardingData.institutionId, selectedInstitution]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length >= 2) {
      await searchInstitutions(query);
    } else {
      clearSearch();
    }
  };

  const handleInstitutionSelect = async (institution: InstitutionSearchResult) => {
    setSelectedInstitution(institution);
    const success = await selectInstitution(institution);
    if (!success) {
      setSelectedInstitution(null);
    }
  };

  const handleContinue = async () => {
    if (selectedInstitution) {
      await nextStep();
    }
  };

  const handleRequestInstitution = async () => {
    setSubmitting(true);
    try {
      // In a real app, this would submit a request to add the institution
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
      // For demo purposes, we'll just show success
      setShowRequestForm(false);
      setSearchQuery('');
      
      // You could show a success message here
    } catch (error) {
      console.error('Failed to request institution:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Search Input */}
      <div className="space-y-2">
        <label 
          htmlFor="institution-search"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Search for your institution
        </label>
        <div className="relative">
          <Search 
            className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" 
            aria-hidden="true"
          />
          <Input
            id="institution-search"
            type="text"
            placeholder="Type your school, university, or organization name..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 min-h-[44px]" // Ensure touch-friendly height
            aria-describedby="search-help"
            autoComplete="organization"
          />
        </div>
        <p id="search-help" className="text-xs text-gray-500">
          Start typing to search for your institution
        </p>
      </div>

      {/* Search Results */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm text-gray-600">Searching...</span>
        </div>
      )}

      {institutions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Search Results
          </h3>
          <div className="space-y-2">
            {institutions.map((institution) => (
              <Card
                key={institution.id}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2",
                  "touch-manipulation active:scale-[0.98]", // Touch optimizations
                  selectedInstitution?.id === institution.id
                    ? "ring-2 ring-blue-500 border-blue-200 bg-blue-50 dark:bg-blue-950"
                    : "hover:border-gray-300"
                )}
                role="button"
                tabIndex={0}
                onClick={() => handleInstitutionSelect(institution)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleInstitutionSelect(institution);
                  }
                }}
                aria-pressed={selectedInstitution?.id === institution.id}
                aria-label={`Select ${institution.name} institution`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                        <Building className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {institution.name}
                        </h4>
                        <div className="flex items-center space-x-4 mt-1">
                          {institution.domain && (
                            <Badge variant="outline" className="text-xs">
                              {institution.domain}
                            </Badge>
                          )}
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Users className="h-3 w-3" />
                            <span>{institution.userCount} users</span>
                          </div>
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Building className="h-3 w-3" />
                            <span>{institution.departmentCount} departments</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {selectedInstitution?.id === institution.id && (
                      <div className="flex items-center justify-center w-6 h-6 bg-blue-500 rounded-full">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* No Results / Request Institution */}
      {searchQuery.length >= 2 && !loading && institutions.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <Building className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">
              Institution not found
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Can't find "{searchQuery}"? You can request to add it to our database.
            </p>
            <Button
              variant="outline"
              onClick={() => setShowRequestForm(true)}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Request Institution</span>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Request Institution Form */}
      {showRequestForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request New Institution</CardTitle>
            <CardDescription>
              We'll review your request and add the institution to our database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Institution Name
              </label>
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Full institution name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Website or Domain (optional)
              </label>
              <Input
                type="text"
                placeholder="example.edu"
              />
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={handleRequestInstitution}
                disabled={submitting}
                className="flex items-center space-x-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Submit Request</span>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRequestForm(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Institution Display */}
      {selectedInstitution && (
        <Card className="bg-green-50 dark:bg-green-950 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-8 h-8 bg-green-500 rounded-full">
                <Check className="h-4 w-4 text-white" />
              </div>
              <div>
                <h4 className="font-medium text-green-900 dark:text-green-100">
                  Selected: {selectedInstitution.name}
                </h4>
                <p className="text-sm text-green-700 dark:text-green-300">
                  Great! We'll connect you with this institution.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Continue Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleContinue}
          disabled={!selectedInstitution}
          className="flex items-center space-x-2"
        >
          <span>Continue</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}