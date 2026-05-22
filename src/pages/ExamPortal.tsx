import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { examAPI } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Anchor, Clock, AlertTriangle, BookOpen, LogOut, CheckCircle, XCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

interface ExamSession {
  id: number;
  title: string;
  description: string;
  duration_minutes: number;
  start_date: string;
  end_date: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'expired';
}

interface ExamAttempt {
  attempt_number: number;
  status: string;
  submitted_at?: string;
  passed: boolean;
  percentage_score?: number;
  correct_answers?: number;
  total_questions?: number;
  next_attempt_available?: string;
}

interface ExamResult {
  session_id: number;
  question_set_id: number | null;
  session_status: string;
  title: string;
  set_name: string;
  attempts: ExamAttempt[];
}

const ExamPortal = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [availableExams, setAvailableExams] = useState<ExamSession[]>([]);
  const [examWithCooldown, setExamWithCooldown] = useState<number | null>(null);
  const [downloadingAttempt, setDownloadingAttempt] = useState<string | null>(null);

  // Fetch available exam sessions
  const { data: examSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["exam_sessions"],
    queryFn: async () => {
      const sessions = await examAPI.getSessions();
      return sessions;
    },
    enabled: !!user,
  });

  // Fetch user exam results
  const { data: userResults = [] } = useQuery({
    queryKey: ["user_exam_results"],
    queryFn: examAPI.getUserExamResults,
    enabled: !!user,
  });

  useEffect(() => {
    // Process exams to show/hide based on results
    const processed: ExamSession[] = [];
    const cooldownMap: { [key: number]: boolean } = {};

    const passedSets = new Set<number>();
    for (const result of userResults) {
      if (result.attempts.some((a: ExamAttempt) => a.passed)) {
        if (result.question_set_id) {
          passedSets.add(result.question_set_id);
        }
      }
    }

    for (const session of examSessions) {
      if (passedSets.has(session.question_set_id)) {
        continue;
      }

      const result = userResults.find((r: ExamResult) => r.session_id === session.id);
      
      if (!result) {
        // No attempts yet - show if available
        processed.push(session);
      } else {
        const attempts = result.attempts || [];
        const passedAttempt = attempts.find(a => a.passed === true);
        const failedAttempts = attempts.filter(a => !a.passed && a.status === 'submitted');

        if (passedAttempt) {
          // User passed for this session - don't show in available exams
          continue;
        }

        if (failedAttempts.length >= 3) {
          // User failed 3 times - don't show
          continue;
        }

        // Check if within cooldown period
        const lastFailedAttempt = failedAttempts[failedAttempts.length - 1];
        if (lastFailedAttempt && lastFailedAttempt.next_attempt_available) {
          const nextAvailable = new Date(lastFailedAttempt.next_attempt_available);
          if (new Date() < nextAvailable) {
            cooldownMap[session.id] = true;
          }
        }

        processed.push(session);
      }
    }

    setAvailableExams(processed);
    setExamWithCooldown(Object.keys(cooldownMap).map(Number)[0] || null);
  }, [examSessions, userResults]);

  const startExam = (sessionId: number) => {
    navigate(`/exam/instructions/${sessionId}`);
  };

  const getExamStatus = (session: ExamSession) => {
    const now = new Date();
    const startDate = new Date(session.start_date);
    const endDate = new Date(session.end_date);

    if (now < startDate) {
      return { status: 'not_started', message: `Available from ${startDate.toLocaleString()}`, disabled: true };
    } else if (now > endDate) {
      return { status: 'expired', message: `Expired on ${endDate.toLocaleString()}`, disabled: true };
    } else {
      return { status: 'available', message: `Available until ${endDate.toLocaleString()}`, disabled: false };
    }
  };

  const getCooldownMessage = (result: ExamResult) => {
    const lastAttempt = result.attempts[result.attempts.length - 1];
    if (lastAttempt && lastAttempt.next_attempt_available) {
      const nextDate = new Date(lastAttempt.next_attempt_available);
      return `Next attempt available: ${nextDate.toLocaleString()}`;
    }
    return '';
  };

  const downloadPortalResultAsPDF = async (
    result: ExamResult, 
    attempt: ExamAttempt
  ) => {
    const key = `${result.session_id}-${attempt.attempt_number}`;
    setDownloadingAttempt(key);
    try {
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const userName = user?.full_name || user?.email || 'Candidate';

      // Create a temporary div
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'fixed';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.background = 'white';
      tempDiv.style.padding = '40px';
      tempDiv.style.maxWidth = '800px';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      document.body.appendChild(tempDiv);

      // Build HTML
      tempDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a3a5c; margin: 0;">Mariner Mastery</h1>
          <p style="color: #666; margin: 5px 0 0 0;">Exam Result Certificate</p>
        </div>
        
        <div style="border-top: 2px solid #1a3a5c; border-bottom: 2px solid #1a3a5c; padding: 20px 0; margin: 20px 0;">
          <h2 style="text-align: center; margin: 0 0 15px 0; color: #1a3a5c;">${result.title}</h2>
          <p style="text-align: center; color: #666; margin: 0;">Question Set: ${result.set_name}</p>
          <p style="text-align: center; color: #666; margin: 5px 0 0 0;">Attempt: ${attempt.attempt_number}</p>
        </div>
        
        <div style="margin: 30px 0;">
          <h3 style="margin: 0 0 20px 0;">Candidate Information</h3>
          <p style="margin: 8px 0;"><strong>Name:</strong> ${userName}</p>
          <p style="margin: 8px 0;"><strong>Date:</strong> ${currentDate}</p>
        </div>
        
        <div style="margin: 30px 0; background-color: #f8f9fa; padding: 25px; border-radius: 8px;">
          <h3 style="margin: 0 0 20px 0;">Exam Results</h3>
          <div style="display: flex; justify-content: space-around; flex-wrap: wrap;">
            <div style="text-align: center; margin: 10px;">
              <div style="font-size: 36px; font-weight: bold; color: ${attempt.passed ? '#10b981' : '#ef4444'};">
                ${attempt.percentage_score}%
              </div>
              <div style="color: #666; margin-top: 5px;">Score</div>
            </div>
            <div style="text-align: center; margin: 10px;">
              <div style="font-size: 24px; font-weight: bold;">
                ${attempt.correct_answers}/${attempt.total_questions}
              </div>
              <div style="color: #666; margin-top: 5px;">Correct Answers</div>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <span style="font-size: 24px; font-weight: bold; color: ${attempt.passed ? '#10b981' : '#ef4444'};">
              ${attempt.passed ? 'PASSED' : 'FAILED'}
            </span>
          </div>
        </div>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px;">
          <p>This is an official examination result. Issued by Mariner Mastery.</p>
        </div>
      `;

      // Capture and generate PDF
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`Mariner-Mastery-Result-${userName.replace(/\s+/g, '-')}-${result.session_id}-attempt-${attempt.attempt_number}.pdf`);

      document.body.removeChild(tempDiv);
    } catch (error) {
      console.error('Error downloading PDF:', error);
    } finally {
      setDownloadingAttempt(null);
    }
  };

  const handleSignOut = () => {
    signOut();
    navigate("/login");
  };

  if (sessionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
      </div>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <Anchor className="h-7 w-7 text-accent" />
            <h1 className="text-xl font-heading font-bold">Maritime CBT Portal</h1>
          </div>
          <Button variant="ghost" onClick={handleSignOut} className="text-primary-foreground hover:bg-primary/80">
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </div>
      </header>

      <div className="container mx-auto p-4 space-y-6">
        {/* Welcome Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Welcome back, {user.full_name || user.email}!</h2>
                <p className="text-muted-foreground">
                  {availableExams.length > 0 
                    ? 'Select an exam below to begin your assessment.' 
                    : 'You have no scheduled exams at this time.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Available Exams */}
        {availableExams.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Available Exams</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {availableExams.map((session) => {
                  const result = userResults.find((r: ExamResult) => r.session_id === session.id);
                  const lastAttempt = result?.attempts?.[result.attempts.length - 1];
                  const examStatus = getExamStatus(session);
                  const isOnCooldown = examWithCooldown === session.id && lastAttempt?.next_attempt_available;
                  const failedCount = result?.attempts?.filter(a => !a.passed && a.status === 'submitted').length || 0;

                  if (failedCount >= 3) {
                    return (
                      <div key={session.id} className="border rounded-lg p-4 bg-red-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-heading font-semibold">{session.title}</p>
                            <p className="text-sm text-destructive mt-1">You don't have another attempt left. Contact with admin.</p>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (isOnCooldown && lastAttempt?.next_attempt_available) {
                    const nextDate = new Date(lastAttempt.next_attempt_available);
                    return (
                      <div key={session.id} className="border rounded-lg p-4 bg-yellow-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-heading font-semibold">{session.title}</p>
                            <p className="text-sm text-muted-foreground">Duration: {session.duration_minutes} min</p>
                            <p className="text-xs text-destructive mt-1">
                              Cooldown period: Next attempt available on {nextDate.toLocaleString()}
                            </p>
                          </div>
                          <Button disabled variant="secondary">Attempt {(failedCount || 0) + 1} (Locked)</Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={session.id} className={`border rounded-lg p-4 flex items-center justify-between`}>
                      <div className="flex-1">
                        <p className="font-heading font-semibold">{session.title}</p>
                        <p className="text-sm text-muted-foreground">Duration: {session.duration_minutes} min</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">{examStatus.message}</p>
                        </div>
                        {failedCount > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">Attempt: {failedCount + 1}/3</p>
                        )}
                      </div>
                      <Button
                        onClick={() => startExam(session.id)}
                        disabled={examStatus.disabled}
                        variant={examStatus.disabled ? "secondary" : "default"}
                      >
                        {examStatus.status === 'not_started' && 'Not Available'}
                        {examStatus.status === 'expired' && 'Expired'}
                        {examStatus.status === 'available' && (failedCount > 0 ? `Attempt ${failedCount + 1}` : 'Start Exam')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Exam History / Results */}
        {userResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading">Exam Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {userResults.map((result: ExamResult) => (
                  <div key={result.session_id} className="border rounded-lg p-4">
                    <div className="mb-3">
                      <h3 className="font-semibold">{result.title}</h3>
                      <p className="text-sm text-muted-foreground">{result.set_name}</p>
                    </div>
                    <div className="space-y-2">
                      {result.attempts.map((attempt, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm p-2 bg-muted rounded flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Attempt {attempt.attempt_number}</span>
                            {attempt.status === 'submitted' && (
                              <>
                                {attempt.passed ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                                <span>{attempt.percentage_score}% ({attempt.correct_answers}/{attempt.total_questions})</span>
                                <Badge variant={attempt.passed ? 'default' : 'destructive'}>
                                  {attempt.passed ? 'Passed' : 'Failed'}
                                </Badge>
                              </>
                            )}
                            {attempt.status === 'in_progress' && (
                              <Badge variant="secondary">In Progress</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleDateString() : 'Not submitted'}
                            </span>
                            {attempt.passed && attempt.status === 'submitted' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadPortalResultAsPDF(result, attempt)}
                                disabled={downloadingAttempt === `${result.session_id}-${attempt.attempt_number}`}
                              >
                                <Download className="h-3 w-3 mr-1" />
                                {downloadingAttempt === `${result.session_id}-${attempt.attempt_number}` ? 'Downloading...' : 'Download'}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <h4 className="font-semibold">Important Instructions</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Ensure you have a stable internet connection</li>
                  <li>• Complete the exam in one session without switching tabs</li>
                  <li>• Read each question carefully before answering</li>
                  <li>• Manage your time effectively - exams are timed</li>
                  <li>• You have 3 attempts to pass. After failing, wait 48 hours before retrying</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExamPortal;
