import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { examAPI } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Clock, ChevronLeft, ChevronRight, AlertTriangle, Send } from "lucide-react";

// Types
interface Answer {
  questionId: string;
  selectedOptionIds: string[];
}

interface QuestionOption {
  id: number;
  option_text: string;
  option_order: number;
}

interface Question {
  id: string;
  question_text: string;
  options: QuestionOption[];
}

const ExamTake = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // Fetch session details
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["exam_session_full", sessionId],
    queryFn: () => examAPI.getSession(sessionId!),
    enabled: !!sessionId,
    refetchOnMount: true  // Always fetch fresh data when component mounts
  });

  // Fetch questions for the session
  const { data: questions = [] } = useQuery({
    queryKey: ["exam_questions", sessionId],
    queryFn: () => examAPI.getQuestions(sessionId!),
    enabled: !!sessionId,
  });

  // Create exam attempt
  const createAttemptMutation = useMutation({
    mutationFn: examAPI.createAttempt,
    onSuccess: (data) => {
      setExamStarted(true);
      setAttemptId(data.id?.toString() || sessionId!);
      setTimeLeft(session!.duration_minutes * 60);
      toast.success("Exam started! Good luck!");
    },
    onError: (error: unknown) => {
      const errorMsg = (error as any)?.response?.data?.error || (error as Error)?.message || "Failed to start exam";
      toast.error(errorMsg);
      // Refresh session to get latest status
      queryClient.invalidateQueries({ queryKey: ["exam_session_full", sessionId] });
      navigate("/exam");
    },
  });

  // Submit exam mutation
  const submitExamMutation = useMutation({
    mutationFn: ({ attemptId, answers }: { attemptId: string; answers: Answer[] }) =>
      examAPI.submitAttempt(attemptId, answers),
    onSuccess: (data) => {
      submittedRef.current = true;
      // Invalidate session queries to force refresh when user navigates back
      queryClient.invalidateQueries({ queryKey: ["session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["exam_session_full", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["result_session", sessionId] });
      navigate(`/exam/result/${sessionId}`, { 
        state: { score: data.score, correctAnswers: data.correctAnswers, totalQuestions: data.totalQuestions }
      });
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to submit exam");
      setSubmitting(false);
    },
  });

  const handleSubmitExam = useCallback(() => {
    if (submitting || submittedRef.current) return;

    setSubmitting(true);
    const formattedAnswers = questions.map((q: Question) => ({
      questionId: q.id,
      selectedOptionIds: answers[q.id] ? [answers[q.id]] : [],
    }));

    submitExamMutation.mutate({ 
      attemptId: attemptId || sessionId!, 
      answers: formattedAnswers 
    });
  }, [submitting, questions, answers, attemptId, sessionId, submitExamMutation]);

  const confirmAndSubmitExam = useCallback(() => {
    if (!window.confirm('Do you really want to submit this test?')) {
      return;
    }
    handleSubmitExam();
  }, [handleSubmitExam]);

  // Start exam
  useEffect(() => {
    if (!session || examStarted) return;
    
    // Check if session is already completed
    if (session.status === 'completed') {
      toast.error('You have already completed this exam. Please ask admin to schedule a new test.');
      navigate('/exam');
      return;
    }
    
    createAttemptMutation.mutate(sessionId!);
  }, [session, examStarted, sessionId, createAttemptMutation, navigate]);

  // Timer
  useEffect(() => {
    if (!examStarted || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [examStarted, timeLeft, handleSubmitExam]);

  // Tab switch detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && examStarted && !submittedRef.current) {
        toast.error("Tab switching detected! Exam will be auto-submitted.");
        handleSubmitExam();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [examStarted, handleSubmitExam]);

  const handleAnswerSelect = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!session || !examStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Starting exam...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentQ];
  const progress = ((currentQ + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-heading font-bold">{session.title}</h1>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              <span className={timeLeft < 300 ? "text-destructive font-bold" : ""}>
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>
          <div className="text-sm">
            Question {currentQ + 1} of {questions.length}
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="bg-border">
        <div className="container mx-auto px-4 py-2">
          <Progress value={progress} className="h-2" />
        </div>
      </div>

      {/* Question */}
      <div className="container mx-auto p-4 max-w-4xl">
        <Card className="mb-6">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-6">
              Question {currentQ + 1}: {currentQuestion.question_text}
            </h2>
            
            <div className="space-y-3">
              {currentQuestion.options?.map((option: QuestionOption) => (
                <div
                  key={option.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    answers[currentQuestion.id] === option.id.toString()
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => handleAnswerSelect(currentQuestion.id, option.id.toString())}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full border-2 ${
                        answers[currentQuestion.id] === option.id.toString()
                          ? "border-primary bg-primary"
                          : "border-border"
                      }`}
                    >
                      {answers[currentQuestion.id] === option.id.toString() && (
                        <div className="w-2 h-2 rounded-full bg-primary-foreground mx-auto mt-0.5"></div>
                      )}
                    </div>
                    <span>{option.option_text}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentQ((prev) => Math.max(0, prev - 1))}
            disabled={currentQ === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <div className="text-sm text-muted-foreground">
            {Object.keys(answers).length} of {questions.length} questions answered
          </div>

          {currentQ === questions.length - 1 ? (
            <Button onClick={confirmAndSubmitExam} disabled={submitting}>
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Exam
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={() => setCurrentQ((prev) => Math.min(questions.length - 1, prev + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>

        {timeLeft < 300 && (
          <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Less than 5 minutes remaining!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamTake;
