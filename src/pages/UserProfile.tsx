import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { authAPI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { User, Award, Calendar, Clock, CheckCircle, XCircle, Download } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

interface ExamResult {
  id: number;
  exam_attempt_id: number;
  total_questions: number;
  correct_answers: number;
  wrong_answers: number;
  percentage_score: number;
  passed: boolean;
  marks_obtained: number;
  total_marks: number;
  time_taken_minutes: number;
  submitted_at: string;
  published_to_profile: boolean;
  email_sent: boolean;
  title: string;
  set_name: string;
}

const UserProfile = () => {
  const { user } = useAuth();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Mock user exam results - in real app, this would come from an API
  const { data: userResults = [], isLoading } = useQuery({
    queryKey: ["user_exam_results"],
    queryFn: async () => {
      // This would be a real API call to get user's published results
      return [
        {
          id: 1,
          exam_attempt_id: 1,
          total_questions: 30,
          correct_answers: 25,
          wrong_answers: 5,
          percentage_score: 83.3,
          passed: true,
          marks_obtained: 25,
          total_marks: 30,
          time_taken_minutes: 28,
          submitted_at: "2024-01-15T10:30:00Z",
          published_to_profile: true,
          email_sent: true,
          title: "Maritime Safety Assessment",
          set_name: "Captain Exam Set 1"
        },
        {
          id: 2,
          exam_attempt_id: 2,
          total_questions: 30,
          correct_answers: 22,
          wrong_answers: 8,
          percentage_score: 73.3,
          passed: false,
          marks_obtained: 22,
          total_marks: 30,
          time_taken_minutes: 30,
          submitted_at: "2024-01-10T14:15:00Z",
          published_to_profile: true,
          email_sent: true,
          title: "Navigation Fundamentals",
          set_name: "Chief Engineer Exam Set 1"
        }
      ];
    },
  });

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreColor = (percentage: number) => {
    if (percentage >= 75) return "text-green-600";
    if (percentage >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const passedCount = userResults.filter((r: ExamResult) => r.passed).length;
  const totalCount = userResults.length;
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
  const averageScore = totalCount > 0 
    ? Math.round(userResults.reduce((sum: number, r: ExamResult) => sum + r.percentage_score, 0) / totalCount)
    : 0;

  const downloadPastResultAsPDF = async (result: ExamResult) => {
    setDownloadingId(result.id);
    try {
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const userName = user?.full_name || user?.email || 'Candidate';

      // Create a temporary div to render the result for PDF capture
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'fixed';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.background = 'white';
      tempDiv.style.padding = '40px';
      tempDiv.style.maxWidth = '800px';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      document.body.appendChild(tempDiv);

      // Build the result HTML
      tempDiv.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a3a5c; margin: 0;">Mariner Mastery</h1>
          <p style="color: #666; margin: 5px 0 0 0;">Exam Result Certificate</p>
        </div>
        
        <div style="border-top: 2px solid #1a3a5c; border-bottom: 2px solid #1a3a5c; padding: 20px 0; margin: 20px 0;">
          <h2 style="text-align: center; margin: 0 0 15px 0; color: #1a3a5c;">${result.title}</h2>
          <p style="text-align: center; color: #666; margin: 0;">Question Set: ${result.set_name}</p>
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
              <div style="font-size: 36px; font-weight: bold; color: ${result.passed ? '#10b981' : '#ef4444'};">
                ${result.percentage_score.toFixed(1)}%
              </div>
              <div style="color: #666; margin-top: 5px;">Score</div>
            </div>
            <div style="text-align: center; margin: 10px;">
              <div style="font-size: 24px; font-weight: bold;">
                ${result.correct_answers}/${result.total_questions}
              </div>
              <div style="color: #666; margin-top: 5px;">Correct Answers</div>
            </div>
            <div style="text-align: center; margin: 10px;">
              <div style="font-size: 24px; font-weight: bold;">${result.time_taken_minutes} min</div>
              <div style="color: #666; margin-top: 5px;">Time Taken</div>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <span style="font-size: 24px; font-weight: bold; color: ${result.passed ? '#10b981' : '#ef4444'};">
              ${result.passed ? 'PASSED' : 'FAILED'}
            </span>
          </div>
        </div>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #999; font-size: 12px;">
          <p>This is an official examination result. Issued by Mariner Mastery.</p>
        </div>
      `;

      // Capture as canvas
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      // Download PDF
      pdf.save(`Mariner-Mastery-Result-${userName.replace(/\s+/g, '-')}-${result.id}.pdf`);

      // Clean up
      document.body.removeChild(tempDiv);
    } catch (error) {
      console.error('Error downloading PDF:', error);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto py-6 px-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-primary-foreground/20">
              <User className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{user?.full_name || "User Profile"}</h1>
              <p className="text-primary-foreground/80">
                {user?.position_rank || "Position"} • {user?.email || "email@example.com"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="flex items-center gap-4 py-4">
              <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCount}</p>
                <p className="text-sm text-muted-foreground">Total Exams</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-4 py-4">
              <div className="p-3 rounded-xl bg-green-100 text-green-600">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{passedCount}</p>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-4 py-4">
              <div className="p-3 rounded-xl bg-yellow-100 text-yellow-600">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{passRate}%</p>
                <p className="text-sm text-muted-foreground">Pass Rate</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-4 py-4">
              <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{averageScore}%</p>
                <p className="text-sm text-muted-foreground">Avg Score</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Performance Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Performance Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Pass Rate</span>
                  <span>{passRate}%</span>
                </div>
                <Progress value={passRate} className="h-2" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Average Score</span>
                  <span>{averageScore}%</span>
                </div>
                <Progress value={averageScore} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Exam Results Table */}
        <Card>
          <CardHeader>
            <CardTitle>Exam History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam Title</TableHead>
                  <TableHead>Question Set</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Time Taken</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userResults.map((result: ExamResult) => (
                  <TableRow key={result.id}>
                    <TableCell className="font-medium">{result.title}</TableCell>
                    <TableCell>{result.set_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={`font-bold ${getScoreColor(result.percentage_score)}`}>
                          {result.percentage_score.toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {result.correct_answers}/{result.total_questions}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={result.passed ? "default" : "destructive"}>
                        {result.passed ? "Passed" : "Failed"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{result.time_taken_minutes} min</span>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(result.submitted_at)}</TableCell>
                    <TableCell>
                      {result.passed && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadPastResultAsPDF(result)}
                          disabled={downloadingId === result.id}
                        >
                          <Download className="h-3 w-3 mr-1" />
                          {downloadingId === result.id ? 'Downloading...' : 'Download'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {userResults.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No exam results available yet. Results will appear here once published by the administrator.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Certifications */}
        <Card>
          <CardHeader>
            <CardTitle>Certifications Achieved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userResults.filter((r: ExamResult) => r.passed).map((result: ExamResult) => (
                <Card key={result.id} className="border-green-200 bg-green-50">
                  <CardContent className="p-4 text-center">
                    <div className="p-3 rounded-full bg-green-100 text-green-600 w-fit mx-auto mb-3">
                      <Award className="h-6 w-6" />
                    </div>
                    <h3 className="font-semibold text-sm">{result.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Score: {result.percentage_score.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(result.submitted_at)}
                    </p>
                  </CardContent>
                </Card>
              ))}
              {userResults.filter((r: ExamResult) => r.passed).length === 0 && (
                <div className="col-span-full text-center text-muted-foreground py-8">
                  No certifications earned yet. Pass exams to see your certifications here.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserProfile;
