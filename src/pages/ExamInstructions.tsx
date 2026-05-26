import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { examAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Anchor, AlertTriangle, Clock, Monitor, CheckCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ExamInstructions = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);

  const { data: session, isLoading } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => examAPI.getSession(sessionId!),
    enabled: !!sessionId,
    refetchOnMount: true
  });

  const { data: userResults = [] } = useQuery({
    queryKey: ["user_exam_results"],
    queryFn: examAPI.getUserExamResults,
  });

  const getExamStatus = () => {
    if (!session) return { canStart: false, message: '', reason: 'loading' };

    const examResult = userResults.find((r: any) => r.session_id === parseInt(sessionId!));
    const passedInSameSet = userResults.some((r: any) => r.question_set_id === session?.question_set_id && r.attempts.some((a: any) => a.passed));
    
    if (passedInSameSet) {
      return {
        canStart: false,
        message: 'You have already passed this exam. No further attempts are allowed.',
        reason: 'already_passed'
      };
    }

    if (!examResult) {
      const now = new Date();
      const startDate = new Date(session.start_date);
      const endDate = new Date(session.end_date);
      
      if (now < startDate) {
        return { 
          canStart: false, 
          message: `This exam will be available from ${startDate.toLocaleString()}`,
          reason: 'not_started'
        };
      }
      if (now > endDate) {
        return { 
          canStart: false, 
          message: `This exam expired on ${endDate.toLocaleString()}`,
          reason: 'expired'
        };
      }
      return { canStart: true, message: '', reason: 'available' };
    }

    const attempts = examResult.attempts || [];
    const passedAttempt = attempts.find((a: any) => a.passed === true);
    const failedAttempts = attempts.filter((a: any) => !a.passed && a.status === 'submitted');

    if (passedAttempt) {
      return { 
        canStart: false, 
        message: 'You have already passed this exam.',
        reason: 'already_passed'
      };
    }

    if (failedAttempts.length >= 3) {
      return { 
        canStart: false, 
        message: "You don't have another attempt left. Please contact with admin.",
        reason: 'max_attempts_reached'
      };
    }

    const lastFailedAttempt = failedAttempts[failedAttempts.length - 1];
    if (lastFailedAttempt && lastFailedAttempt.next_attempt_available) {
      const nextDate = new Date(lastFailedAttempt.next_attempt_available);
      if (new Date() < nextDate) {
        return { 
          canStart: false, 
          message: `You must wait 48 hours before attempting this exam again. Next attempt available: ${nextDate.toLocaleString()}`,
          reason: 'cooldown'
        };
      }
    }

    return { canStart: true, message: '', reason: 'available' };
  };

  const examStatus = getExamStatus();

  const startExam = async () => {
    if (!examStatus.canStart) {
      toast.error(examStatus.message);
      return;
    }

    setIsStarting(true);
    try {
      await examAPI.createAttempt(sessionId!, null);
      navigate(`/exam/take/${sessionId}`);
    } catch (error: any) {
      const message = error.response?.data?.message || error.response?.data?.error || 'Failed to start exam';
      toast.error(message);
    } finally {
      setIsStarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-foreground"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl border-0 shadow-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Anchor className="h-12 w-12 text-accent" />
          </div>
          <CardTitle className="font-heading text-2xl">Exam Instructions</CardTitle>
          <p className="text-muted-foreground">{session?.title}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Alert */}
          {!examStatus.canStart && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive font-medium">{examStatus.message}</p>
              </div>
            </div>
          )}

          {/* Exam Details */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold mb-2">Exam Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span>Duration: {session?.duration_minutes || 60} minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                <span>Computer Based Test</span>
              </div>
            </div>
          </div>

          {/* Important Instructions */}
          <div className="space-y-4">
            <h3 className="font-semibold">Important Instructions</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <span>Read each question carefully before selecting your answer</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <span>You can navigate between questions using Previous/Next buttons</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <span>Make sure to answer all questions before submitting</span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                <span>The exam will be automatically submitted when time expires</span>
              </div>
            </div>
          </div>

          {/* Warning Section */}
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <h4 className="font-semibold text-destructive">Important Warning</h4>
                <p className="text-sm text-destructive">
                  Switching tabs or windows during the exam will result in automatic submission. 
                  Please ensure you remain on this page throughout the exam.
                </p>
              </div>
            </div>
          </div>

          {/* Technical Requirements */}
          <div className="space-y-3">
            <h3 className="font-semibold">Technical Requirements</h3>
            <div className="text-sm space-y-2 text-muted-foreground">
              <p>• Stable internet connection throughout the exam</p>
              <p>• Modern web browser (Chrome, Firefox, Safari, Edge)</p>
              <p>• No popup blockers enabled</p>
              <p>• Ensure your screen resolution is at least 1024x768</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => navigate("/exam")} 
              className="flex-1"
            >
              Back to Portal
            </Button>
            <Button 
              onClick={startExam} 
              className="flex-1"
              disabled={!examStatus.canStart || isStarting}
            >
              {isStarting ? 'Starting...' : 'Start Exam'}
            </Button>
          </div>

          <div className="text-center text-xs text-muted-foreground pt-4">
            By clicking "Start Exam", you agree to abide by these instructions and terms.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExamInstructions;
