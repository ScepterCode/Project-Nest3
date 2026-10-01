'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { SubmissionFileButton } from '@/components/submission-file-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Save,
  Send,
  Clock,
  Star,
  FileText,
  User,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

import { toast } from '@/lib/toast';
interface PeerReview {
  id: string;
  status: string;
  overall_rating: number;
  feedback: any;
  time_spent: number;
  peer_review_assignment: {
    id: string;
    title: string;
    instructions: string;
    review_type: string;
    settings: any;
    end_date: string | null;
  };
  submission: {
    id: string;
    assignment_title: string;
    content: string | null;
    file_url?: string | null;
    link_url?: string | null;
  };
  // null when the review is blind (author hidden from the reviewer)
  author_name: string | null;
  submitted_at: string | null;
}

interface ReviewFeedback {
  overall_comments: string;
  strengths: string[];
  improvements: string[];
  specific_feedback: { [key: string]: string };
}

export default function StudentPeerReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [peerReview, setPeerReview] = useState<PeerReview | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<ReviewFeedback>({
    overall_comments: '',
    strengths: [],
    improvements: [],
    specific_feedback: {},
  });
  const [newStrength, setNewStrength] = useState('');
  const [newImprovement, setNewImprovement] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(Date.now());

  useEffect(() => {
    if (user && params.reviewId) {
      fetchPeerReview();
    }
  }, [user, params.reviewId]);

  const fetchPeerReview = async () => {
    try {
      // Only the assigned reviewer gets this, and the author is hidden for
      // blind reviews (students can't read peer_reviews directly).
      const { data, error } = await supabase.rpc('get_peer_review', {
        p_review_id: params.reviewId,
      });

      if (error) throw error;

      setPeerReview(data as PeerReview);

      // Load existing feedback if any
      if (data.feedback) {
        setFeedback({
          overall_comments: data.feedback.overall_comments || '',
          strengths: data.feedback.strengths || [],
          improvements: data.feedback.improvements || [],
          specific_feedback: data.feedback.specific_feedback || {},
        });
      }

      if (data.overall_rating) {
        setRating(data.overall_rating);
      }
    } catch (error) {
      console.error('Error fetching peer review:', error);
      router.push('/dashboard/student/peer-reviews');
    } finally {
      setLoading(false);
    }
  };

  const addStrength = () => {
    if (newStrength.trim()) {
      setFeedback(prev => ({
        ...prev,
        strengths: [...prev.strengths, newStrength.trim()],
      }));
      setNewStrength('');
    }
  };

  const removeStrength = (index: number) => {
    setFeedback(prev => ({
      ...prev,
      strengths: prev.strengths.filter((_, i) => i !== index),
    }));
  };

  const addImprovement = () => {
    if (newImprovement.trim()) {
      setFeedback(prev => ({
        ...prev,
        improvements: [...prev.improvements, newImprovement.trim()],
      }));
      setNewImprovement('');
    }
  };

  const removeImprovement = (index: number) => {
    setFeedback(prev => ({
      ...prev,
      improvements: prev.improvements.filter((_, i) => i !== index),
    }));
  };

  // Saves through save_peer_review(), which enforces the deadline, the rating
  // range and (on submit) required fields. Time is sent as minutes since the
  // last save, so repeated saves don't double-count.
  const saveReview = async (submit: boolean) => {
    if (!peerReview) return;
    const now = Date.now();
    const { error } = await supabase.rpc('save_peer_review', {
      p_review_id: peerReview.id,
      p_overall_rating: rating || null,
      p_feedback: feedback,
      p_minutes: Math.floor((now - lastSavedAt) / 1000 / 60),
      p_submit: submit,
    });
    if (error) throw error;
    setLastSavedAt(now);
  };

  const saveDraft = async () => {
    if (!peerReview || !user) return;

    setSaving(true);
    try {
      await saveReview(false);

      toast.success('Draft saved successfully!');
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast.error('Failed to save draft: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async () => {
    if (!peerReview || !user) return;

    // Validation
    if (peerReview.peer_review_assignment.settings?.require_rating && !rating) {
      toast.error('Please provide a rating before submitting.');
      return;
    }

    if (!feedback.overall_comments.trim()) {
      toast.error('Please provide overall comments before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      // Also logs the 'review_submitted' activity on the server
      await saveReview(true);

      router.push('/dashboard/student/peer-reviews');
    } catch (error: any) {
      console.error('Error submitting review:', error);
      toast.error('Failed to submit review: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!peerReview) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-4">Review Not Found</h2>
            <p className="text-gray-600 mb-4">
              The peer review you&apos;re looking for doesn&apos;t exist or you
              don&apos;t have permission to access it.
            </p>
            <Link href="/dashboard/student/peer-reviews">
              <Button>Back to Peer Reviews</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isCompleted = peerReview.status === 'completed';
  const authorName = peerReview.author_name || 'Anonymous Author';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard/student/peer-reviews">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Reviews
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">
                {peerReview.peer_review_assignment.title}
              </h1>
              <p className="text-gray-600">
                Reviewing: {peerReview.submission.assignment_title}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={isCompleted ? 'default' : 'secondary'}>
              {isCompleted ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Completed
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3 mr-1" />
                  In Progress
                </>
              )}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submission Content */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>Submission</span>
                </CardTitle>
                <CardDescription>
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4" />
                    <span>By {authorName}</span>
                  </div>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">
                      {peerReview.submission.assignment_title}
                    </h3>
                    <div className="prose prose-sm max-w-none">
                      <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                        {peerReview.submission.content ||
                          (peerReview.submission.link_url ||
                          peerReview.submission.file_url
                            ? ''
                            : 'No content available')}
                      </div>
                    </div>
                  </div>

                  {peerReview.submission.link_url &&
                    /^https?:\/\//i.test(peerReview.submission.link_url) && (
                      <div>
                        <Label className="text-sm font-medium">
                          Submitted Link
                        </Label>
                        <p className="mt-1 text-sm">
                          <a
                            href={peerReview.submission.link_url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="text-blue-600 underline break-all"
                          >
                            {peerReview.submission.link_url}
                          </a>
                        </p>
                      </div>
                    )}

                  {peerReview.submission.file_url && (
                    <div>
                      <Label className="text-sm font-medium">
                        Attached File
                      </Label>
                      <div className="mt-1">
                        <SubmissionFileButton
                          fileUrl={peerReview.submission.file_url}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          View Attachment
                        </SubmissionFileButton>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Review Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {peerReview.peer_review_assignment.instructions}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Review Form */}
          <div className="space-y-6">
            {/* Rating */}
            {peerReview.peer_review_assignment.settings?.require_rating && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Star className="h-5 w-5" />
                    <span>Overall Rating</span>
                  </CardTitle>
                  <CardDescription>
                    Rate this submission from 1 to{' '}
                    {peerReview.peer_review_assignment.settings?.rating_scale ||
                      5}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={rating.toString()}
                    onValueChange={value => setRating(parseInt(value))}
                    disabled={isCompleted}
                  >
                    <div className="flex space-x-4">
                      {Array.from(
                        {
                          length:
                            peerReview.peer_review_assignment.settings
                              ?.rating_scale || 5,
                        },
                        (_, i) => i + 1
                      ).map(value => (
                        <div
                          key={value}
                          className="flex items-center space-x-2"
                        >
                          <RadioGroupItem
                            value={value.toString()}
                            id={`rating-${value}`}
                          />
                          <Label
                            htmlFor={`rating-${value}`}
                            className="cursor-pointer"
                          >
                            {value}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>
            )}

            {/* Overall Comments */}
            <Card>
              <CardHeader>
                <CardTitle>Overall Comments</CardTitle>
                <CardDescription>
                  Provide constructive feedback on the submission
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={feedback.overall_comments}
                  onChange={e =>
                    setFeedback(prev => ({
                      ...prev,
                      overall_comments: e.target.value,
                    }))
                  }
                  placeholder="Write your overall feedback here..."
                  rows={6}
                  disabled={isCompleted}
                />
              </CardContent>
            </Card>

            {/* Strengths */}
            <Card>
              <CardHeader>
                <CardTitle>Strengths</CardTitle>
                <CardDescription>What did the author do well?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {feedback.strengths.map((strength, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded"
                    >
                      <span className="text-sm">{strength}</span>
                      {!isCompleted && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStrength(index)}
                          className="h-6 w-6 p-0"
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {!isCompleted && (
                  <div className="flex space-x-2">
                    <Input
                      value={newStrength}
                      onChange={e => setNewStrength(e.target.value)}
                      placeholder="Add a strength..."
                      onKeyPress={e => e.key === 'Enter' && addStrength()}
                    />
                    <Button onClick={addStrength} size="sm">
                      Add
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Areas for Improvement */}
            <Card>
              <CardHeader>
                <CardTitle>Areas for Improvement</CardTitle>
                <CardDescription>What could be improved?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {feedback.improvements.map((improvement, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-900/20 rounded"
                    >
                      <span className="text-sm">{improvement}</span>
                      {!isCompleted && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeImprovement(index)}
                          className="h-6 w-6 p-0"
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {!isCompleted && (
                  <div className="flex space-x-2">
                    <Input
                      value={newImprovement}
                      onChange={e => setNewImprovement(e.target.value)}
                      placeholder="Add an improvement suggestion..."
                      onKeyPress={e => e.key === 'Enter' && addImprovement()}
                    />
                    <Button onClick={addImprovement} size="sm">
                      Add
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            {!isCompleted && (
              <div className="flex justify-end space-x-4">
                <Button variant="outline" onClick={saveDraft} disabled={saving}>
                  {saving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Draft
                </Button>
                <Button
                  onClick={submitReview}
                  disabled={submitting || !feedback.overall_comments.trim()}
                >
                  {submitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Submit Review
                </Button>
              </div>
            )}

            {isCompleted && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2 text-green-600">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Review Completed</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    You submitted this review on{' '}
                    {peerReview.submitted_at
                      ? new Date(peerReview.submitted_at).toLocaleDateString()
                      : 'Unknown date'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
