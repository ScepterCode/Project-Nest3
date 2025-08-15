"use client";

import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, FileText, Link, Download, Save, Users, Clock, CheckCircle, Star } from 'lucide-react';
import { RubricSelectorModal } from '@/components/rubric-selector-modal';

interface Assignment {
    id: string;
    title: string;
    description: string;
    due_date: string;
    points_possible: number;
    class_name: string;
}

interface Submission {
    id: string;
    student_id: string;
    student_name: string;
    student_email: string;
    content?: string;
    file_url?: string;
    link_url?: string;
    submitted_at: string;
    status: 'submitted' | 'graded';
    grade?: number;
    feedback?: string;
}

interface SubmissionStats {
    total_students: number;
    submitted_count: number;
    graded_count: number;
    pending_count: number;
}

export default function GradeSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const resolvedParams = use(params);

    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [stats, setStats] = useState<SubmissionStats | null>(null);
    const [loadingData, setLoadingData] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [gradingPanelOpen, setGradingPanelOpen] = useState(false);

    // Grading form state
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');
    const [saving, setSaving] = useState(false);
    
    // Grading mode state
    const [gradingMode, setGradingModeType] = useState<'simple' | 'rubric'>('simple');
    const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
    const [assignmentRubric, setAssignmentRubric] = useState<any>(null);
    const [removingRubric, setRemovingRubric] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push('/auth/login');
        }
    }, [user, loading, router]);

    useEffect(() => {
        if (user && resolvedParams?.id) {
            loadData();
        }
    }, [user, resolvedParams?.id]);

    const loadData = async () => {
        try {
            setLoadingData(true);
            setError(null);
            
            if (!resolvedParams?.id || !user?.id) {
                console.error('Missing required parameters:', { 
                    assignmentId: resolvedParams?.id, 
                    userId: user?.id 
                });
                setError('Missing required parameters');
                return;
            }

            console.log('Loading grading data for assignment:', resolvedParams.id);
            const supabase = createClient();

            // Load assignment details (including rubric field)
            const { data: assignmentData, error: assignmentError } = await supabase
                .from('assignments')
                .select('id, title, description, due_date, points, class_id, teacher_id, rubric')
                .eq('id', resolvedParams.id)
                .eq('teacher_id', user.id)
                .single();

            if (assignmentError) {
                console.error('Assignment query error:', assignmentError);
                setError('Assignment not found or access denied');
                return;
            }

            console.log('Assignment loaded:', assignmentData.title);

            // Get class name separately
            const { data: classData, error: classError } = await supabase
                .from('classes')
                .select('id, name')
                .eq('id', assignmentData.class_id)
                .single();
                
            if (classError) {
                console.error('Class query error:', classError);
            }
            
            console.log('Class loaded:', classData?.name || 'Unknown Class');

            setAssignment({
                id: assignmentData.id,
                title: assignmentData.title,
                description: assignmentData.description,
                due_date: assignmentData.due_date,
                points_possible: assignmentData.points || 100,
                class_name: classData?.name || 'Unknown Class'
            });
            
            // Check if assignment has a rubric
            console.log('Assignment rubric field:', assignmentData.rubric);
            console.log('Rubric type:', typeof assignmentData.rubric);
            
            if (assignmentData.rubric && typeof assignmentData.rubric === 'object') {
                setAssignmentRubric(assignmentData.rubric);
                console.log('✅ Assignment has rubric:', assignmentData.rubric.name);
                console.log('Rubric criteria count:', assignmentData.rubric.criteria?.length || 0);
            } else {
                console.log('❌ Assignment has no rubric - using simple grading only');
                setAssignmentRubric(null);
            }

            // Load submissions with student details (manual join)
            const { data: submissionsData, error: submissionsError } = await supabase
                .from('submissions')
                .select('id, student_id, content, file_url, link_url, submitted_at, status, grade, feedback')
                .eq('assignment_id', resolvedParams.id)
                .order('submitted_at', { ascending: false });

            if (submissionsError) {
                console.error('Error loading submissions:', submissionsError);
                setSubmissions([]);
            } else {
                console.log(`Found ${submissionsData?.length || 0} submissions`);
                
                if (submissionsData && submissionsData.length > 0) {
                // Get student details manually from users table
                const studentIds = submissionsData.map(s => s.student_id);
                const { data: studentsData, error: studentsError } = await supabase
                    .from('users')
                    .select('id, first_name, last_name, email')
                    .in('id', studentIds);
                    
                if (studentsError) {
                    console.error('Students query error:', studentsError);
                }
                
                console.log(`Found ${studentsData?.length || 0} students`);

                const submissionsWithStudents = submissionsData.map(submission => {
                    const student = studentsData?.find(s => s.id === submission.student_id);
                    return {
                        ...submission,
                        student_name: student
                            ? `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.email
                            : 'Unknown Student',
                        student_email: student?.email || 'unknown@email.com'
                    };
                });

                setSubmissions(submissionsWithStudents);
                console.log('Submissions with students loaded successfully');
                } else {
                    setSubmissions([]);
                }
            }

            // Calculate stats
            const { data: enrollments, error: enrollmentsError } = await supabase
                .from('enrollments')
                .select('student_id')
                .eq('class_id', assignmentData.class_id);
                
            if (enrollmentsError) {
                console.error('Enrollments query error:', enrollmentsError);
            }

            const totalStudents = enrollments?.length || 0;
            const submittedCount = submissionsData?.length || 0;
            const gradedCount = submissionsData?.filter(s => s.status === 'graded').length || 0;

            console.log('Stats calculated:', { totalStudents, submittedCount, gradedCount });

            setStats({
                total_students: totalStudents,
                submitted_count: submittedCount,
                graded_count: gradedCount,
                pending_count: totalStudents - submittedCount
            });
            
            console.log('Grading page data loaded successfully');

        } catch (error) {
            console.error('Error loading data:', error);
            setError('Failed to load assignment and submissions');
        } finally {
            setLoadingData(false);
        }
    };

    // Calculate total grade from rubric scores
    const calculateRubricGrade = () => {
        if (!assignmentRubric || !assignmentRubric.criteria || !Array.isArray(assignmentRubric.criteria)) return 0;
        
        let totalWeightedScore = 0;
        let totalWeight = 0;
        
        assignmentRubric.criteria.forEach((criterion: any) => {
            const score = rubricScores[criterion.id] || 0;
            const weight = criterion.weight || 25; // Default weight as percentage
            
            // Calculate weighted score: (score * weight) / 100
            totalWeightedScore += (score * weight / 100);
            totalWeight += weight;
        });
        
        // The totalWeightedScore is already the final grade out of the maximum possible
        // Since the rubric levels are designed to give the actual points
        return Math.round(totalWeightedScore);
    };

    // Handle rubric removal from assignment
    const handleRemoveRubric = async () => {
        if (!assignment || !assignmentRubric || removingRubric) return;
        
        const confirmDelete = window.confirm(
            `Are you sure you want to remove the rubric "${assignmentRubric.name}" from this assignment?\n\n` +
            'This will:\n' +
            '• Remove the rubric from the assignment\n' +
            '• Switch all future grading to simple mode\n' +
            '• Keep existing rubric-based grades intact\n\n' +
            'This action cannot be undone.'
        );
        
        if (!confirmDelete) return;
        
        setRemovingRubric(true);
        
        try {
            const supabase = createClient();
            
            console.log('Removing rubric from assignment:', assignment.id);
            
            // Remove rubric from assignment by setting rubric field to null
            const { error } = await supabase
                .from('assignments')
                .update({ rubric: null })
                .eq('id', assignment.id)
                .eq('teacher_id', user?.id);
                
            if (error) {
                console.error('Error removing rubric:', error);
                alert('Error removing rubric: ' + error.message);
                return;
            }
            
            console.log('✅ Rubric removed from database');
            
            // Update local state
            setAssignmentRubric(null);
            setGradingModeType('simple');
            setRubricScores({});
            
            alert('Rubric removed successfully! All future grading will use simple mode.');
            
        } catch (error) {
            console.error('Error removing rubric:', error);
            alert('Error removing rubric');
        } finally {
            setRemovingRubric(false);
        }
    };

    const handleGradeSubmission = async () => {
        if (!selectedSubmission) return;

        setSaving(true);
        try {
            const supabase = createClient();
            let finalGrade: number;
            let rubricData: any = null;

            if (gradingMode === 'rubric' && assignmentRubric) {
                // Calculate grade from rubric
                finalGrade = calculateRubricGrade();
                rubricData = {
                    scores: rubricScores,
                    rubric_name: assignmentRubric.name,
                    graded_with_rubric: true
                };
                
                // Validate rubric scores
                const hasAllScores = assignmentRubric.criteria && Array.isArray(assignmentRubric.criteria) 
                    ? assignmentRubric.criteria.every((criterion: any) => 
                        rubricScores[criterion.id] !== undefined && rubricScores[criterion.id] > 0
                    )
                    : false;
                
                if (!hasAllScores) {
                    alert('Please provide scores for all rubric criteria');
                    setSaving(false);
                    return;
                }
            } else {
                // Simple grading mode
                finalGrade = parseInt(grade);
                
                if (isNaN(finalGrade) || finalGrade < 0 || finalGrade > (assignment?.points_possible || 100)) {
                    alert(`Please enter a valid grade between 0 and ${assignment?.points_possible || 100}`);
                    setSaving(false);
                    return;
                }
            }

            // Prepare update data
            const updateData: any = {
                grade: finalGrade,
                feedback: feedback.trim(),
                status: 'graded',
                graded_at: new Date().toISOString(),
                graded_by: user?.id
            };

            // Add rubric data if using rubric grading
            if (rubricData) {
                updateData.rubric_scores = rubricData;
            }

            const { error } = await supabase
                .from('submissions')
                .update(updateData)
                .eq('id', selectedSubmission.id);

            if (error) {
                console.error('Error saving grade:', error);
                alert('Error saving grade: ' + error.message);
                return;
            }

            // Update local state
            setSubmissions(prev => prev.map(sub =>
                sub.id === selectedSubmission.id
                    ? { ...sub, grade: finalGrade, feedback: feedback.trim(), status: 'graded' as const }
                    : sub
            ));

            // Update stats
            if (stats && selectedSubmission.status !== 'graded') {
                setStats(prev => prev ? {
                    ...prev,
                    graded_count: prev.graded_count + 1
                } : null);
            }

            // Reset form
            setGrade('');
            setFeedback('');
            setRubricScores({});
            setGradingPanelOpen(false);
            setSelectedSubmission(null);

            alert(`Grade saved successfully! Final grade: ${finalGrade}/${assignment?.points_possible || 100}`);

        } catch (error) {
            console.error('Error saving grade:', error);
            alert('Error saving grade');
        } finally {
            setSaving(false);
        }
    };

    const startGrading = (submission: Submission) => {
        setSelectedSubmission(submission);
        setGrade(submission.grade?.toString() || '');
        setFeedback(submission.feedback || '');
        setGradingPanelOpen(true);
        
        // Initialize rubric scores if rubric exists
        if (assignmentRubric && assignmentRubric.criteria && Array.isArray(assignmentRubric.criteria)) {
            const initialScores: Record<string, number> = {};
            assignmentRubric.criteria.forEach((criterion: any) => {
                initialScores[criterion.id] = 0;
            });
            setRubricScores(initialScores);
        }
    };

    if (loading || loadingData) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center">Loading assignment and submissions...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center text-red-600">{error}</div>
            </div>
        );
    }

    if (!assignment) {
        return (
            <div className="container mx-auto p-6">
                <div className="text-center">Assignment not found</div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6">
            {/* Header */}
            <div className="mb-6">
                <Button
                    variant="ghost"
                    onClick={() => router.push('/dashboard/teacher/assignments')}
                    className="mb-4"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Assignments
                </Button>

                <h1 className="text-3xl font-bold mb-2">Grade Submissions: {assignment.title}</h1>
                <p className="text-gray-600">{assignment.class_name}</p>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <Users className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                                <div className="text-2xl font-bold">{stats.total_students}</div>
                                <div className="text-sm text-gray-500">Total Students</div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <FileText className="h-8 w-8 mx-auto mb-2 text-green-500" />
                                <div className="text-2xl font-bold">{stats.submitted_count}</div>
                                <div className="text-sm text-gray-500">Submitted</div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-purple-500" />
                                <div className="text-2xl font-bold">{stats.graded_count}</div>
                                <div className="text-sm text-gray-500">Graded</div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <Clock className="h-8 w-8 mx-auto mb-2 text-orange-500" />
                                <div className="text-2xl font-bold">{stats.pending_count}</div>
                                <div className="text-sm text-gray-500">Pending</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Submissions List */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Submissions ({submissions.length})</CardTitle>
                            <CardDescription>
                                Click on a submission to grade it
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {submissions.length === 0 ? (
                                <div className="text-center py-8">
                                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                                    <p className="text-gray-500">No submissions yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {submissions.map((submission) => (
                                        <div
                                            key={submission.id}
                                            className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedSubmission?.id === submission.id
                                                ? 'border-blue-500 bg-blue-50'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                            onClick={() => startGrading(submission)}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h4 className="font-medium">{submission.student_name}</h4>
                                                    <p className="text-sm text-gray-500">{submission.student_email}</p>
                                                </div>
                                                <div className="text-right">
                                                    <Badge variant={submission.status === 'graded' ? 'default' : 'secondary'}>
                                                        {submission.status === 'graded'
                                                            ? `${submission.grade}/${assignment.points_possible}`
                                                            : 'Ungraded'
                                                        }
                                                    </Badge>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {new Date(submission.submitted_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Preview of submission content */}
                                            <div className="text-sm text-gray-600">
                                                {submission.content && (
                                                    <p className="truncate">📝 {submission.content.substring(0, 100)}...</p>
                                                )}
                                                {submission.file_url && (
                                                    <p>📎 File attachment</p>
                                                )}
                                                {submission.link_url && (
                                                    <p>🔗 Link submission</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Grading Panel */}
                <div>
                    {selectedSubmission ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Grade Submission</CardTitle>
                                <CardDescription>
                                    {selectedSubmission.student_name}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="content" className="w-full">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="content">Content</TabsTrigger>
                                        <TabsTrigger value="grade">Grade</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="content" className="space-y-4">
                                        {selectedSubmission.content && (
                                            <div>
                                                <Label>Text Submission</Label>
                                                <div className="bg-gray-50 p-3 rounded border max-h-40 overflow-y-auto">
                                                    <p className="text-sm whitespace-pre-wrap">{selectedSubmission.content}</p>
                                                </div>
                                            </div>
                                        )}

                                        {selectedSubmission.file_url && (
                                            <div>
                                                <Label>File Submission</Label>
                                                <Button variant="outline" size="sm" asChild className="w-full">
                                                    <a href={selectedSubmission.file_url} target="_blank" rel="noopener noreferrer">
                                                        <Download className="h-4 w-4 mr-2" />
                                                        Download File
                                                    </a>
                                                </Button>
                                            </div>
                                        )}

                                        {selectedSubmission.link_url && (
                                            <div>
                                                <Label>Link Submission</Label>
                                                <Button variant="outline" size="sm" asChild className="w-full">
                                                    <a href={selectedSubmission.link_url} target="_blank" rel="noopener noreferrer">
                                                        <Link className="h-4 w-4 mr-2" />
                                                        Open Link
                                                    </a>
                                                </Button>
                                            </div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="grade" className="space-y-4">
                                        {/* Grading Mode Toggle */}
                                        {assignmentRubric && (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <Label>Grading Method</Label>
                                                        <div className="text-xs text-gray-500 mb-2">
                                                            Rubric: {assignmentRubric.name} ({assignmentRubric.criteria?.length || 0} criteria)
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        onClick={handleRemoveRubric}
                                                        disabled={removingRubric}
                                                    >
                                                        {removingRubric ? 'Removing...' : 'Remove Rubric'}
                                                    </Button>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant={gradingMode === 'simple' ? 'default' : 'outline'}
                                                        size="sm"
                                                        onClick={() => setGradingModeType('simple')}
                                                    >
                                                        Simple Grade
                                                    </Button>
                                                    <Button
                                                        variant={gradingMode === 'rubric' ? 'default' : 'outline'}
                                                        size="sm"
                                                        onClick={() => setGradingModeType('rubric')}
                                                    >
                                                        Use Rubric
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* No Rubric - Option to Add */}
                                        {!assignmentRubric && (
                                            <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center">
                                                <div className="text-sm text-gray-600 mb-2">
                                                    This assignment uses simple grading only
                                                </div>
                                                <div className="text-xs text-gray-500 mb-3">
                                                    Add a rubric for structured, consistent grading with detailed criteria
                                                </div>
                                                <RubricSelectorModal
                                                    assignmentId={assignment.id}
                                                    onRubricSelected={(rubric) => {
                                                        setAssignmentRubric(rubric);
                                                        setGradingModeType('rubric');
                                                    }}
                                                />
                                            </div>
                                        )}


                                        {/* Simple Grading Mode */}
                                        {gradingMode === 'simple' && (
                                            <div>
                                                <Label htmlFor="grade">Grade (0-{assignment.points_possible})</Label>
                                                <Input
                                                    id="grade"
                                                    type="number"
                                                    min="0"
                                                    max={assignment.points_possible}
                                                    value={grade}
                                                    onChange={(e) => setGrade(e.target.value)}
                                                    placeholder="Enter grade"
                                                />
                                            </div>
                                        )}

                                        {/* Rubric Grading Mode */}
                                        {gradingMode === 'rubric' && assignmentRubric && assignmentRubric.criteria && (
                                            <div className="space-y-4">
                                                <div className="text-sm font-medium">
                                                    Rubric: {assignmentRubric.name}
                                                </div>
                                                
                                                {assignmentRubric.criteria.map((criterion: any) => (
                                                    <div key={criterion.id} className="border rounded-lg p-3 space-y-2">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <div className="font-medium">{criterion.name}</div>
                                                                <div className="text-sm text-gray-600">{criterion.description}</div>
                                                                <div className="text-xs text-gray-500">Weight: {criterion.weight}%</div>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {criterion.levels && Array.isArray(criterion.levels) && criterion.levels.map((level: any, index: number) => (
                                                                <Button
                                                                    key={index}
                                                                    variant={rubricScores[criterion.id] === level.points ? 'default' : 'outline'}
                                                                    size="sm"
                                                                    className="text-left justify-start h-auto p-2"
                                                                    onClick={() => setRubricScores(prev => ({
                                                                        ...prev,
                                                                        [criterion.id]: level.points
                                                                    }))}
                                                                >
                                                                    <div>
                                                                        <div className="font-medium">{level.name}</div>
                                                                        <div className="text-xs opacity-75">{level.points} pts</div>
                                                                        <div className="text-xs opacity-75">{level.description}</div>
                                                                    </div>
                                                                </Button>
                                                            ))}
                                                            {(!criterion.levels || !Array.isArray(criterion.levels)) && (
                                                                <div className="text-sm text-gray-500">No performance levels defined</div>
                                                            )}
                                                        </div>
                                                        
                                                        <div className="text-sm">
                                                            Selected: {rubricScores[criterion.id] || 0} points
                                                        </div>
                                                    </div>
                                                ))}
                                                
                                                <div className="bg-blue-50 p-3 rounded-lg">
                                                    <div className="font-medium">Calculated Grade: {calculateRubricGrade()}/{assignment.points_possible}</div>
                                                    <div className="text-sm text-gray-600">
                                                        {Math.round((calculateRubricGrade() / (assignment.points_possible || 100)) * 100)}%
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Feedback Section */}
                                        <div>
                                            <Label htmlFor="feedback">Feedback</Label>
                                            <Textarea
                                                id="feedback"
                                                value={feedback}
                                                onChange={(e) => setFeedback(e.target.value)}
                                                placeholder="Provide feedback to the student..."
                                                rows={4}
                                            />
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex gap-2">
                                            <Button
                                                onClick={handleGradeSubmission}
                                                disabled={saving}
                                                className="flex-1"
                                            >
                                                <Save className="h-4 w-4 mr-2" />
                                                {saving ? 'Saving...' : 'Save Grade'}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setSelectedSubmission(null);
                                                    setGradingPanelOpen(false);
                                                    setGrade('');
                                                    setFeedback('');
                                                    setRubricScores({});
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="pt-6 text-center">
                                <Star className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                                <p className="text-gray-500">Select a submission to start grading</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}