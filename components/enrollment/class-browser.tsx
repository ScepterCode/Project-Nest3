"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { ClassDiscoveryService } from '@/lib/services/class-discovery';
import { 
  ClassSearchCriteria, 
  ClassSearchResult, 
  ClassWithEnrollment,
  EnrollmentType 
} from '@/lib/types/enrollment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Search, 
  Filter, 
  Users, 
  Clock, 
  MapPin, 
  BookOpen,
  AlertCircle,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClassBrowserProps {
  studentId?: string;
  onClassSelect?: (classData: ClassWithEnrollment) => void;
  showEnrollmentActions?: boolean;
}

export function ClassBrowser({ 
  studentId, 
  onClassSelect, 
  showEnrollmentActions = true 
}: ClassBrowserProps) {
  const [searchCriteria, setSearchCriteria] = useState<ClassSearchCriteria>({
    query: '',
    limit: 20,
    offset: 0,
    sortBy: 'name',
    sortOrder: 'asc'
  });
  
  const [searchResults, setSearchResults] = useState<ClassSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const debouncedQuery = useDebounce(searchCriteria.query, 300);
  const classDiscoveryService = new ClassDiscoveryService();

  // Perform search when criteria change
  const performSearch = useCallback(async (criteria: ClassSearchCriteria) => {
    setLoading(true);
    setError(null);
    
    try {
      const results = await classDiscoveryService.searchClasses(criteria);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search classes');
      setSearchResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Search when debounced query changes
  useEffect(() => {
    const updatedCriteria = { ...searchCriteria, query: debouncedQuery, offset: 0 };
    setSearchCriteria(updatedCriteria);
    performSearch(updatedCriteria);
  }, [debouncedQuery, performSearch]);

  // Handle search input change
  const handleSearchChange = (value: string) => {
    setSearchCriteria(prev => ({ ...prev, query: value }));
  };

  // Handle filter changes
  const handleFilterChange = (key: keyof ClassSearchCriteria, value: any) => {
    const updatedCriteria = { ...searchCriteria, [key]: value, offset: 0 };
    setSearchCriteria(updatedCriteria);
    performSearch(updatedCriteria);
  };

  // Handle pagination
  const handleLoadMore = () => {
    if (!searchResults || !searchResults.hasMore) return;
    
    const updatedCriteria = { 
      ...searchCriteria, 
      offset: (searchCriteria.offset || 0) + (searchCriteria.limit || 20) 
    };
    setSearchCriteria(updatedCriteria);
    performSearch(updatedCriteria);
  };

  // Handle sorting
  const handleSortChange = (sortBy: string) => {
    const updatedCriteria = { 
      ...searchCriteria, 
      sortBy: sortBy as ClassSearchCriteria['sortBy'],
      offset: 0 
    };
    setSearchCriteria(updatedCriteria);
    performSearch(updatedCriteria);
  };

  return (
    <div className="space-y-6">
      {/* Search Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search classes by name, code, or description..."
              value={searchCriteria.query}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Filter Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2"
          >
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </Button>
          
          {/* Sort Dropdown */}
          <Select value={searchCriteria.sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="enrollment">Enrollment</SelectItem>
              <SelectItem value="availability">Availability</SelectItem>
              <SelectItem value="created_at">Date Added</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Search Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Department Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Department</label>
                  <Select 
                    value={searchCriteria.departmentId || ''} 
                    onValueChange={(value) => handleFilterChange('departmentId', value || undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Departments</SelectItem>
                      {searchResults?.filters.departments.map(dept => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name} ({dept.count})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Enrollment Type Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Enrollment Type</label>
                  <Select 
                    value={searchCriteria.enrollmentType || ''} 
                    onValueChange={(value) => handleFilterChange('enrollmentType', value || undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Types</SelectItem>
                      <SelectItem value={EnrollmentType.OPEN}>Open Enrollment</SelectItem>
                      <SelectItem value={EnrollmentType.RESTRICTED}>Restricted</SelectItem>
                      <SelectItem value={EnrollmentType.INVITATION_ONLY}>Invitation Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Credits Filter */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Credits</label>
                  <Select 
                    value={searchCriteria.credits?.toString() || ''} 
                    onValueChange={(value) => handleFilterChange('credits', value ? parseInt(value) : undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any Credits" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any Credits</SelectItem>
                      <SelectItem value="1">1 Credit</SelectItem>
                      <SelectItem value="2">2 Credits</SelectItem>
                      <SelectItem value="3">3 Credits</SelectItem>
                      <SelectItem value="4">4 Credits</SelectItem>
                      <SelectItem value="5">5+ Credits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Availability Filters */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Availability</label>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="available-spots"
                      checked={searchCriteria.hasAvailableSpots || false}
                      onCheckedChange={(checked) => handleFilterChange('hasAvailableSpots', checked)}
                    />
                    <label htmlFor="available-spots" className="text-sm">Has Available Spots</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="waitlist-spots"
                      checked={searchCriteria.hasWaitlistSpots || false}
                      onCheckedChange={(checked) => handleFilterChange('hasWaitlistSpots', checked)}
                    />
                    <label htmlFor="waitlist-spots" className="text-sm">Waitlist Available</label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Results */}
      <div className="space-y-4">
        {/* Results Header */}
        {searchResults && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {searchResults.total} classes found
              {searchCriteria.query && ` for "${searchCriteria.query}"`}
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Searching classes...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Class Results */}
        {searchResults && searchResults.classes.length > 0 && (
          <div className="grid gap-4">
            {searchResults.classes.map((classData) => (
              <ClassCard
                key={classData.id}
                classData={classData}
                studentId={studentId}
                onSelect={() => onClassSelect?.(classData)}
                showEnrollmentActions={showEnrollmentActions}
              />
            ))}
          </div>
        )}

        {/* No Results */}
        {searchResults && searchResults.classes.length === 0 && !loading && (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No classes found</h3>
              <p className="text-gray-600 mb-4">
                Try adjusting your search criteria or filters to find more classes.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchCriteria({ query: '', limit: 20, offset: 0, sortBy: 'name', sortOrder: 'asc' });
                  performSearch({ query: '', limit: 20, offset: 0, sortBy: 'name', sortOrder: 'asc' });
                }}
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Load More */}
        {searchResults && searchResults.hasMore && (
          <div className="text-center">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={loading}
              className="flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading...</span>
                </>
              ) : (
                <span>Load More Classes</span>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Individual class card component
interface ClassCardProps {
  classData: ClassWithEnrollment;
  studentId?: string;
  onSelect?: () => void;
  showEnrollmentActions?: boolean;
}

function ClassCard({ classData, studentId, onSelect, showEnrollmentActions }: ClassCardProps) {
  const getEnrollmentStatusBadge = () => {
    if (!classData.isEnrollmentOpen) {
      return <Badge variant="secondary">Enrollment Closed</Badge>;
    }
    
    if (classData.availableSpots > 0) {
      return <Badge variant="default" className="bg-green-500">Available ({classData.availableSpots} spots)</Badge>;
    }
    
    if (classData.isWaitlistAvailable) {
      return <Badge variant="outline">Waitlist Available</Badge>;
    }
    
    return <Badge variant="destructive">Full</Badge>;
  };

  const getEnrollmentTypeBadge = () => {
    switch (classData.enrollmentType) {
      case EnrollmentType.OPEN:
        return <Badge variant="outline" className="text-green-600 border-green-600">Open</Badge>;
      case EnrollmentType.RESTRICTED:
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600">Restricted</Badge>;
      case EnrollmentType.INVITATION_ONLY:
        return <Badge variant="outline" className="text-red-600 border-red-600">Invitation Only</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onSelect}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <CardTitle className="text-lg">{classData.name}</CardTitle>
              <Badge variant="secondary">{classData.code}</Badge>
              {getEnrollmentTypeBadge()}
            </div>
            <CardDescription className="text-sm">
              {classData.description}
            </CardDescription>
          </div>
          <div className="text-right">
            {getEnrollmentStatusBadge()}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Class Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-gray-400" />
            <span>{classData.teacherName}</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <BookOpen className="h-4 w-4 text-gray-400" />
            <span>{classData.credits} Credits</span>
          </div>
          
          {classData.schedule && (
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <span>{classData.schedule}</span>
            </div>
          )}
          
          {classData.location && (
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <span>{classData.location}</span>
            </div>
          )}
        </div>

        {/* Enrollment Stats */}
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            {classData.currentEnrollment}/{classData.capacity} enrolled
            {classData.waitlistCount > 0 && ` • ${classData.waitlistCount} waitlisted`}
          </span>
          
          {classData.enrollmentStatistics && (
            <span>
              {classData.enrollmentStatistics.capacityUtilization.toFixed(0)}% full
            </span>
          )}
        </div>

        {/* Prerequisites/Restrictions Warning */}
        {(classData.class_prerequisites?.length > 0 || classData.enrollment_restrictions?.length > 0) && (
          <div className="flex items-center space-x-2 text-sm text-yellow-600">
            <AlertCircle className="h-4 w-4" />
            <span>
              Has {classData.class_prerequisites?.length > 0 ? 'prerequisites' : ''}
              {classData.class_prerequisites?.length > 0 && classData.enrollment_restrictions?.length > 0 ? ' and ' : ''}
              {classData.enrollment_restrictions?.length > 0 ? 'restrictions' : ''}
            </span>
          </div>
        )}

        {/* Enrollment Actions */}
        {showEnrollmentActions && studentId && (
          <div className="flex items-center justify-between pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                // Handle view details
              }}
            >
              View Details
            </Button>
            
            <Button
              size="sm"
              disabled={!classData.isEnrollmentOpen}
              onClick={(e) => {
                e.stopPropagation();
                // Handle enrollment request
              }}
              className={cn(
                classData.availableSpots > 0 
                  ? "bg-green-600 hover:bg-green-700" 
                  : classData.isWaitlistAvailable 
                    ? "bg-yellow-600 hover:bg-yellow-700"
                    : ""
              )}
            >
              {classData.availableSpots > 0 
                ? 'Enroll Now' 
                : classData.isWaitlistAvailable 
                  ? 'Join Waitlist'
                  : 'Not Available'
              }
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}