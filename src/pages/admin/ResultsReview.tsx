import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BarChart3, Eye, Mail, CheckCircle, XCircle, Clock, Download } from "lucide-react";
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
  full_name: string;
  email: string;
  set_name: string;
  rank_name: string;
}

interface UserAnswer {
  id: number;
  question_text: string;
  question_type: 'single_choice' | 'multiple_choice';
  selected_option_ids: number[];
  is_correct: boolean | null;
  options: AnswerOption[];
}

interface AnswerOption {
  id: number;
  option_text: string;
  is_correct: boolean;
}

const ResultsReview = () => {
  const queryClient = useQueryClient();
  const [selectedResult, setSelectedResult] = useState<ExamResult | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Debug logging
  useEffect(() => {
    console.log('selectedResult changed:', selectedResult);
    console.log('showDetailsDialog:', showDetailsDialog);
  }, [selectedResult, showDetailsDialog]);

  // Fetch exam results
  const { data: results = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["admin_exam_results"],
    queryFn: adminAPI.getExamResults,
  });

  const { data: answerDetails = [], isLoading: detailsLoading, error: detailsError } = useQuery({
    queryKey: ["admin_exam_result_details", selectedResult?.id],
    queryFn: () => {
      console.log('Query function called for result ID:', selectedResult?.id);
      return selectedResult ? adminAPI.getExamResultDetails(selectedResult.id) : [];
    },
    enabled: !!selectedResult && showDetailsDialog,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Publish results mutation
  const publishResultsMutation = useMutation({
    mutationFn: ({ resultId, sendEmail }: { resultId: number; sendEmail: boolean }) => 
      adminAPI.publishResults(resultId, sendEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_exam_results"] });
      toast.success("Results published successfully");
      setShowDetailsDialog(false);
      setSelectedResult(null);
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to publish results");
    },
  });

  const handlePublishResults = () => {
    if (!selectedResult) return;
    publishResultsMutation.mutate({ 
      resultId: selectedResult.id, 
      sendEmail 
    });
  };

  const handleViewDetails = (result: ExamResult) => {
    console.log('handleViewDetails called with result:', result);
    setSelectedResult(result);
    setShowDetailsDialog(true);
  };

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

  const getScoreBadgeVariant = (passed: boolean) => {
    return passed ? "default" : "destructive";
  };

  const passedCount = results.filter((r: ExamResult) => r.passed).length;
  const failedCount = results.filter((r: ExamResult) => !r.passed).length;
  const publishedCount = results.filter((r: ExamResult) => r.published_to_profile).length;

  const downloadAdminResultAsPDF = async (result: ExamResult) => {
    setDownloadingId(result.id);
    try {
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Create temp div
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
        </div>
        
        <div style="margin: 30px 0;">
          <h3 style="margin: 0 0 20px 0;">Candidate Information</h3>
          <p style="margin: 8px 0;"><strong>Name:</strong> ${result.full_name}</p>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${result.email}</p>
          <p style="margin: 8px 0;"><strong>Rank:</strong> ${result.rank_name}</p>
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
          <p>This is an official examination result. Issued by Mariner Mastery Administration.</p>
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
      pdf.save(`Mariner-Mastery-Result-${result.full_name.replace(/\s+/g, '-')}-${result.id}.pdf`);

      document.body.removeChild(tempDiv);
    } catch (error) {
      console.error('Error downloading PDF:', error);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Results Review</h2>
          <p className="text-muted-foreground">Review and publish exam results</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-xl bg-blue-10 text-blue-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{results.length}</p>
              <p className="text-sm text-muted-foreground">Total Results</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-xl bg-green-10 text-green-600">
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
            <div className="p-3 rounded-xl bg-red-10 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{failedCount}</p>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-xl bg-purple-10 text-purple-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{publishedCount}</p>
              <p className="text-sm text-muted-foreground">Published</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Exam Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Time Taken</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result: ExamResult) => (
                <TableRow key={result.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{result.full_name}</span>
                      <span className="text-xs text-muted-foreground">{result.rank_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {result.email}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{result.title}</span>
                      <span className="text-xs text-muted-foreground">{result.set_name}</span>
                    </div>
                  </TableCell>
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
                    <Badge variant={getScoreBadgeVariant(result.passed)}>
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
                    <div className="flex flex-col gap-1">
                      <Badge variant={result.published_to_profile ? "default" : "secondary"} className="text-xs">
                        {result.published_to_profile ? "Published" : "Draft"}
                      </Badge>
                      {result.email_sent && (
                        <Badge variant="outline" className="text-xs">
                          Email Sent
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(result)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {result.passed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadAdminResultAsPDF(result)}
                          disabled={downloadingId === result.id}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {!result.published_to_profile && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setSelectedResult(result);
                            setSendEmail(false);
                            publishResultsMutation.mutate({ 
                              resultId: result.id, 
                              sendEmail: false 
                            });
                          }}
                          disabled={publishResultsMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {results.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No exam results found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Result Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={(open) => {
        setShowDetailsDialog(open);
        if (!open) {
          setSelectedResult(null);
          setSendEmail(false);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Exam Result Details</span>
              <div className="flex items-center gap-4">
                <Badge variant={getScoreBadgeVariant(selectedResult?.passed || false)}>
                  {selectedResult?.passed ? "Passed" : "Failed"}
                </Badge>
                <span className={`font-bold text-lg ${getScoreColor(selectedResult?.percentage_score || 0)}`}>
                  {selectedResult?.percentage_score.toFixed(1)}%
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedResult && (
            <div className="space-y-6 pt-4">
              {/* Download Button */}
              {selectedResult.passed && (
                <div className="flex justify-end">
                  <Button
                    variant="default"
                    onClick={() => downloadAdminResultAsPDF(selectedResult)}
                    disabled={downloadingId === selectedResult.id}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadingId === selectedResult.id ? 'Downloading...' : 'Download Result'}
                  </Button>
                </div>
              )}
              
              {/* Result Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="text-center py-4">
                    <p className="text-2xl font-bold">{selectedResult.correct_answers}</p>
                    <p className="text-sm text-muted-foreground">Correct</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="text-center py-4">
                    <p className="text-2xl font-bold">{selectedResult.wrong_answers}</p>
                    <p className="text-sm text-muted-foreground">Wrong</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="text-center py-4">
                    <p className="text-2xl font-bold">{selectedResult.percentage_score.toFixed(1)}%</p>
                    <p className="text-sm text-muted-foreground">Score</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="text-center py-4">
                    <p className="text-2xl font-bold">{selectedResult.time_taken_minutes}</p>
                    <p className="text-sm text-muted-foreground">Minutes</p>
                  </CardContent>
                </Card>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Score Progress</span>
                  <span>{selectedResult.percentage_score.toFixed(1)}%</span>
                </div>
                <Progress value={selectedResult.percentage_score} className="h-2" />
              </div>

              {/* Questions and Answers */}
              <div className="space-y-4">
                <h3 className="font-semibold">Question Review</h3>
                {/* Debug: answerDetails can be logged in useEffect if needed */}
                {detailsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <span className="ml-2">Loading question details...</span>
                  </div>
                ) : detailsError ? (
                  <div className="text-center py-8 text-red-600">
                    Error loading question details: {(detailsError as Error)?.message || 'Unknown error'}
                  </div>
                ) : answerDetails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No question details available
                  </div>
                ) : (
                  <div className="space-y-3">
                    {answerDetails.map((answer: UserAnswer, index: number) => (
                      <Card key={answer.id} className={`p-4 ${answer.is_correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                        <div className="flex items-start justify-between mb-2">
                          <span className="font-medium">Question {index + 1}</span>
                          <Badge variant={answer.is_correct ? "default" : "destructive"}>
                            {answer.is_correct ? "Correct" : "Incorrect"}
                          </Badge>
                        </div>
                        <p className="text-sm mb-3">{answer.question_text}</p>
                        <div className="space-y-2">
                          {answer.options.map((option) => {
                            const isSelected = answer.selected_option_ids?.includes(option.id);
                            const isCorrect = option.is_correct;
                            
                            return (
                              <div key={option.id} className="flex items-center gap-2 text-sm">
                                <Checkbox 
                                  checked={isSelected} 
                                  disabled 
                                  className={isCorrect ? "border-green-600" : ""}
                                />
                                <span className={`
                                  ${isCorrect ? "font-medium text-green-600" : ""}
                                  ${isSelected && !isCorrect ? "text-red-600 line-through" : ""}
                                `}>
                                  {option.option_text}
                                  {isCorrect && " ✓"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Publish Actions */}
              {!selectedResult.published_to_profile && (
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="send_email"
                        checked={sendEmail}
                        onCheckedChange={(checked) => setSendEmail(checked as boolean)}
                      />
                      <Label htmlFor="send_email">Send results to candidate via email</Label>
                    </div>
                    <Button 
                      onClick={handlePublishResults} 
                      disabled={publishResultsMutation.isPending}
                    >
                      {publishResultsMutation.isPending ? "Publishing..." : "Publish Results"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResultsReview;
