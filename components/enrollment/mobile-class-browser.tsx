"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useMobileDetection } from '@/lib/hooks/useMobileDetection';
import { useOfflineStorage } from '@/lib/hooks/useOfflineStorage';
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
import { 
  Search, 
  Filter, 
  Users, 
  Clock, 
  MapPin, 
  BookOpen,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  SlidersHorizontal,
  WifiOff,
  Wifi
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileClassBrowserProps {
  studentId?: string;
  onClassSelect?: (classData: ClassWithEnrollment) => void;
  showEnrollmentActions?: boolean;
}

export function MobileClassBrowser({ 
  studentId, 
  onClassSelect, 
  showEnrollmentActions = true 
}: MobileClassBrowserProps) {
  const { isMobile, screenSize } = useMobileDetection();
  const { 
    isOnline, 
    cacheClasses, 
    getCachedClasses, 
    cacheSearchResults, 
    getCachedSearchResults 
  } = useOfflineStorage();
  
  const [searchCriteria, setSearchCriteria] = useState<ClassSearchCriteria>({
    query: '',
    limit: 10, // Smaller limit for mobile
    offset: 0,
    sortBy: 'name',
    sortOrder: 'asc'
  });
  
  const [searchResults, setSearchResults] = useState<ClassSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const debouncedQuery = useDebounce(searchCriteria.query, 300);
  const classDiscoveryService = new ClassDiscoveryService();

  // Filter cached classes locally when offline
  const filterCachedClasses = (classes: ClassWithEnrollment[], criteria: ClassSearchCriteria): ClassSearchResult => {
    let filteredClasses = [...classes];

    // Apply text search
    if (criteria.query) {
      const query = criteria.query.toLowerCase();
      filteredClasses = filteredClasses.filter(cls => 
        cls.name.toLowerCase().includes(query) ||
        cls.code.toLowerCase().includes(query) ||
        cls.description?.toLowerCase().includes(query) ||
        cls.teacherName.toLowerCase().includes(query)
      );
    }

    // Apply department filter
    if (criteria.departmentId) {
      filteredClasses = filteredClasses.filter(cls => cls.departmentId === criteria.departmentId);
    }

    // Apply enrollment type filter
    if (criteria.enrollmentType) {
      filteredClasses = filteredClasses.filter(cls => cls.enrollmentType === criteria.enrollmentType);
    }

    // Apply availability filters
    if (criteria.hasAvailableSpots) {
      filteredClasses = filteredClasses.filter(cls => cls.availableSpots > 0);
    }

    if (criteria.hasWaitlistSpots) {
      filteredClasses = filteredClasses.filter(cls => cls.isWaitlistAvailable);
    }

    // Apply sorting
    filteredClasses.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (criteria.sortBy) {
        case 'enrollment':
          aValue = a.currentEnrollment;
          bValue = b.currentEnrollment;
          break;
        case 'availability':
          aValue = a.availableSpots;
          bValue = b.availableSpots;
          break;
        case 'name':
        default:
          aValue = a.name;
          bValue = b.name;
          break;
      }

      if (criteria.sortOrder === 'desc') {
        return aValue < bValue ? 1 : -1;
      }
      return aValue > bValue ? 1 : -1;
    });

    // Apply pagination
    const offset = criteria.offset || 0;
    const limit = criteria.limit || 10;
    const paginatedClasses = filteredClasses.slice(offset, offset + limit);

    return {
      classes: paginatedClasses,
      total: filteredClasses.length,
      hasMore: (offset + limit) < filteredClasses.length,
      filters: {
        departments: [], // Would need to be calculated from cached data
        instructors: [],
        enrollmentTypes: []
      }
    };
  };

  // Perform search when criteria change
  const performSearch = useCallback(async (criteria: ClassSearchCriteria) => {
    setLoading(true);
    setError(null);
    setIsOfflineMode(false);
    
    try {
      let results: ClassSearchResult | null = null;
      
      if (isOnline) {
        // Try online search first
        try {
          results = await classDiscoveryService.searchClasses(criteria);
          
          // Cache the results for offline use
          if (results && results.classes.length > 0) {
            await cacheClasses(results.classes);
            await cacheSearchResults(criteria, results);
          }
        } catch (onlineError) {
          console.warn('Online search failed, falling back to cache:', onlineError);
          // Fall back to cached results
          results = await getCachedSearchResults(criteria);
          if (!results) {
            // If no cached search results, try to get all cached classes and filter locally
            const cachedClasses = await getCachedClasses();
            if (cachedClasses.length > 0) {
              results = filterCachedClasses(cachedClasses, criteria);
              setIsOfflineMode(true);
            }
          } else {
            setIsOfflineMode(true);
          }
        }
      } else {
        // Offline mode - use cached data
        results = await getCachedSearchResults(criteria);
        if (!results) {
          const cachedClasses = await getCachedClasses();
          if (cachedClasses.length > 0) {
            results = filterCachedClasses(cachedClasses, criteria);
          }
        }
        setIsOfflineMode(true);
      }
      
      if (results) {
        setSearchResults(results);
      } else {
        throw new Error(isOnline ? 'No classes found' : 'No cached data available. Please connect to the internet to browse classes.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search classes');
      setSearchResults(null);
    } finally {
      setLoading(false);
    }
  }, [isOnline, cacheClasses, getCachedClasses, cacheSearchResults, getCachedSearchResults]);

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
      offset: (searchCriteria.offset || 0) + (searchCriteria.limit || 10) 
    };
    setSearchCriteria(updatedCriteria);
    performSearch(updatedCriteria);
  };

  // Clear all filters
  const clearFilters = () => {
    const clearedCriteria = {
      query: searchCriteria.query,
      limit: 10,
      offset: 0,
      sortBy: 'name' as const,
      sortOrder: 'asc' as const
    };
    setSearchCriteria(clearedCriteria);
    performSearch(clearedCriteria);
    setShowFilters(false);
  };

  return (
    <div className="space-y-4 pb-20"> {/* Extra padding for mobile navigation */}
      {/* Mobile-optimized Search Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10 pb-4">
        <div className="space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search classes..."
              value={searchCriteria.query}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 pr-4 h-12 text-base" // Larger touch target
            />
          </div>
          
          {/* Mobile Filter and Sort Bar */}
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 flex-1"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            
            <Select value={searchCriteria.sortBy} onValueChange={(value) => handleFilterChange('sortBy', value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="enrollment">Enrollment</SelectItem>
                <SelectItem value="availability">Available</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results Count and Offline Indicator */}
          <div className="flex items-center justify-between">
            {searchResults && (
              <div className="text-sm text-gray-600">
                {searchResults.total} classes found
              </div>
            )}
            
            {/* Online/Offline Status */}
            <div className="flex items-center space-x-1">
              {isOnline ? (
                <div className="flex items-center space-x-1 text-green-600">
                  <Wifi className="h-3 w-3" />
                  <span className="text-xs">Online</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-orange-600">
                  <WifiOff className="h-3 w-3" />
                  <span className="text-xs">Offline</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Offline Mode Warning */}
          {isOfflineMode && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-center space-x-2 text-orange-700">
                <WifiOff className="h-4 w-4" />
                <span className="text-sm font-medium">Browsing cached classes</span>
              </div>
              <p className="text-xs text-orange-600 mt-1">
                Some information may be outdated. Connect to the internet for the latest updates.
              </p>
            </div>
          )}
        </div>

        {/* Mobile Filters Panel */}
        {showFilters && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Filters</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowFilters(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {/* Department Filter */}
              <div>
                <label className="text-sm font-medium mb-1 block">Department</label>
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
                <label className="text-sm font-medium mb-1 block">Enrollment Type</label>
                <Select 
                  value={searchCriteria.enrollmentType || ''} 
                  onValueChange={(value) => handleFilterChange('enrollmentType', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Types</SelectItem>
                    <SelectItem value={EnrollmentType.OPEN}>Open</SelectItem>
                    <SelectItem value={EnrollmentType.RESTRICTED}>Restricted</SelectItem>
                    <SelectItem value={EnrollmentType.INVITATION_ONLY}>Invitation Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Availability Toggles */}
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={searchCriteria.hasAvailableSpots || false}
                    onChange={(e) => handleFilterChange('hasAvailableSpots', e.target.checked)}
                    className="rounded"
                  />
                  <span>Available spots</span>
                </label>
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={searchCriteria.hasWaitlistSpots || false}
                    onChange={(e) => handleFilterChange('hasWaitlistSpots', e.target.checked)}
                    className="rounded"
                  />
                  <span>Waitlist open</span>
                </label>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <Button variant="outline" size="sm" onClick={clearFilters} className="flex-1">
                Clear All
              </Button>
              <Button size="sm" onClick={() => setShowFilters(false)} className="flex-1">
                Apply Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Searching...</span>
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

      {/* Mobile Class Results */}
      {searchResults && searchResults.classes.length > 0 && (
        <div className="space-y-3">
          {searchResults.classes.map((classData) => (
            <MobileClassCard
              key={classData.id}
              classData={classData}
              studentId={studentId}
              onSelect={() => onClassSelect?.(classData)}
              showEnrollmentActions={showEnrollmentActions}
              isExpanded={expandedCard === classData.id}
              onToggleExpand={() => setExpandedCard(
                expandedCard === classData.id ? null : classData.id
              )}
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
              Try adjusting your search or filters.
            </p>
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Load More */}
      {searchResults && searchResults.hasMore && (
        <div className="text-center pt-4">
          <Button
            variant="outline"
            onClick={handleLoadMore}
            disabled={loading}
            className="w-full h-12"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              'Load More Classes'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// Mobile-optimized class card component
interface MobileClassCardProps {
  classData: ClassWithEnrollment;
  studentId?: string;
  onSelect?: () => void;
  showEnrollmentActions?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

function MobileClassCard({ 
  classData, 
  studentId, 
  onSelect, 
  showEnrollmentActions,
  isExpanded,
  onToggleExpand
}: MobileClassCardProps) {
  const getEnrollmentStatusBadge = () => {
    if (!classData.isEnrollmentOpen) {
      return <Badge variant="secondary" className="text-xs">Closed</Badge>;
    }
    
    if (classData.availableSpots > 0) {
      return <Badge variant="default" className="bg-green-500 text-xs">
        {classData.availableSpots} spots
      </Badge>;
    }
    
    if (classData.isWaitlistAvailable) {
      return <Badge variant="outline" className="text-xs">Waitlist</Badge>;
    }
    
    return <Badge variant="destructive" className="text-xs">Full</Badge>;
  };

  const getEnrollmentTypeBadge = () => {
    switch (classData.enrollmentType) {
      case EnrollmentType.OPEN:
        return <Badge variant="outline" className="text-green-600 border-green-600 text-xs">Open</Badge>;
      case EnrollmentType.RESTRICTED:
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-xs">Restricted</Badge>;
      case EnrollmentType.INVITATION_ONLY:
        return <Badge variant="outline" className="text-red-600 border-red-600 text-xs">Invite Only</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <CardTitle className="text-base truncate">{classData.name}</CardTitle>
              <Badge variant="secondary" className="text-xs shrink-0">{classData.code}</Badge>
            </div>
            <div className="flex items-center space-x-2 mb-2">
              {getEnrollmentTypeBadge()}
              {getEnrollmentStatusBadge()}
            </div>
            <CardDescription className="text-sm line-clamp-2">
              {classData.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Essential Info - Always Visible */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center space-x-2">
            <Users className="h-3 w-3 text-gray-400 shrink-0" />
            <span className="truncate">{classData.teacherName}</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <BookOpen className="h-3 w-3 text-gray-400 shrink-0" />
            <span>{classData.credits} Credits</span>
          </div>
        </div>

        {/* Enrollment Stats */}
        <div className="text-sm text-gray-600">
          {classData.currentEnrollment}/{classData.capacity} enrolled
          {classData.waitlistCount > 0 && ` • ${classData.waitlistCount} waitlisted`}
        </div>

        {/* Expandable Details */}
        {isExpanded && (
          <div className="space-y-3 pt-2 border-t">
            {(classData.schedule || classData.location) && (
              <div className="grid grid-cols-1 gap-2 text-sm">
                {classData.schedule && (
                  <div className="flex items-center space-x-2">
                    <Clock className="h-3 w-3 text-gray-400 shrink-0" />
                    <span>{classData.schedule}</span>
                  </div>
                )}
                
                {classData.location && (
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-3 w-3 text-gray-400 shrink-0" />
                    <span>{classData.location}</span>
                  </div>
                )}
              </div>
            )}

            {/* Prerequisites/Restrictions Warning */}
            {(classData.class_prerequisites?.length > 0 || classData.enrollment_restrictions?.length > 0) && (
              <div className="flex items-start space-x-2 text-sm text-yellow-600 bg-yellow-50 p-2 rounded">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Requirements Apply</p>
                  <p className="text-xs">
                    {classData.class_prerequisites?.length > 0 && 'Prerequisites required'}
                    {classData.class_prerequisites?.length > 0 && classData.enrollment_restrictions?.length > 0 && ' • '}
                    {classData.enrollment_restrictions?.length > 0 && 'Enrollment restrictions'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand?.();
            }}
            className="text-xs"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Details
              </>
            )}
          </Button>
          
          {showEnrollmentActions && studentId && (
            <Button
              size="sm"
              disabled={!classData.isEnrollmentOpen}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.();
              }}
              className={cn(
                "text-xs px-3",
                classData.availableSpots > 0 
                  ? "bg-green-600 hover:bg-green-700" 
                  : classData.isWaitlistAvailable 
                    ? "bg-yellow-600 hover:bg-yellow-700"
                    : ""
              )}
            >
              {classData.availableSpots > 0 
                ? 'Enroll' 
                : classData.isWaitlistAvailable 
                  ? 'Waitlist'
                  : 'Full'
              }
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}