import { useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { examAPI } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Anchor, CheckCircle, XCircle, AlertTriangle, BarChart3, Download } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

interface ExamResultState {
  score: number;
  correctAnswers: number;
  totalQuestions: number;
}

const ExamResult = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ExamResultState | null;
  const resultRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["result_session", sessionId],
    queryFn: () => examAPI.getSession(sessionId!),
    enabled: !!sessionId,
  });

  const { user } = useAuth();
  const score = state?.score || 0;
  const correctAnswers = state?.correctAnswers || 0;
  const totalQuestions = state?.totalQuestions || 0;
  const passed = score >= 75; // Default passing threshold
  const userName = user?.full_name || user?.email || 'Candidate';
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const downloadResultAsPDF = async () => {
    if (!resultRef.current) return;
    
    setIsDownloading(true);
    try {
      // Capture the result element as canvas
      const canvas = await html2canvas(resultRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      });

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Handle multiple pages if needed
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Download PDF
      pdf.save(`Mariner-Mastery-Result-${userName.replace(/\s+/g, '-')}-${currentDate}.pdf`);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      // Fallback: just print the page
      window.print();
    } finally {
      setIsDownloading(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading result...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <Anchor className="h-7 w-7 text-accent" />
            <h1 className="text-xl font-heading font-bold">Exam Result</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4 max-w-4xl">
        {/* Result Card - Wrapped for PDF download */}
        <div ref={resultRef} className="bg-white">
        <Card className="mb-6">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">Thank You, {userName}!</CardTitle>
            <p className="text-muted-foreground">Your exam submission has been received.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Score Display */}
            <div className="text-center space-y-4">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold ${
                passed 
                  ? "bg-success/10 text-success border-2 border-success" 
                  : "bg-destructive/10 text-destructive border-2 border-destructive"
              }`}>
                {Math.round(score)}%
              </div>
              
              <div className="space-y-2">
                <h3 className={`text-xl font-semibold ${passed ? "text-success" : "text-destructive"}`}>
                  {passed ? "PASSED" : "FAILED"}
                </h3>
                <p className="text-muted-foreground">
                  You answered {correctAnswers} out of {totalQuestions} questions correctly
                </p>
              </div>
            </div>

            {/* Score Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-primary">{correctAnswers}</div>
                <div className="text-sm text-muted-foreground">Correct Answers</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-destructive">{totalQuestions - correctAnswers}</div>
                <div className="text-sm text-muted-foreground">Wrong Answers</div>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-primary">{session.duration_minutes} min</div>
                <div className="text-sm text-muted-foreground">Exam Duration</div>
              </div>
            </div>

            {/* Performance Message */}
            <div className={`p-4 rounded-lg border ${
              passed 
                ? "bg-success/10 border-success/20" 
                : "bg-destructive/10 border-destructive/20"
            }`}>
              <div className="flex items-start gap-3">
                {passed ? (
                  <CheckCircle className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                )}
                <div className="space-y-2">
                  <h4 className={`font-semibold ${passed ? "text-success" : "text-destructive"}`}>
                    {passed ? "Congratulations!" : "Better Luck Next Time"}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {passed 
                      ? "You have successfully passed this maritime competency exam. Your results have been recorded."
                      : "You did not meet the passing criteria for this exam. Please review the material and try again."
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="space-y-3">
              <h4 className="font-semibold">Next Steps</h4>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>• Your results have been saved to your profile</p>
                <p>• You can download or print this result for your records</p>
                <p>• Contact your administrator if you have any questions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          {passed && (
            <Button 
              onClick={downloadResultAsPDF}
              disabled={isDownloading}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {isDownloading ? 'Downloading...' : 'Download Result'}
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={() => window.print()}
            className="flex items-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Print Result
          </Button>
          <Button 
            onClick={() => navigate("/exam")}
            className="flex-1"
          >
            Back to Exam Portal
          </Button>
        </div>

        {/* Important Note */}
        <Card className="mt-6">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <h4 className="font-semibold">Important Note</h4>
                <p className="text-sm text-muted-foreground">
                  This is an official examination result. Any attempt to falsify or duplicate this document 
                  may result in disciplinary action according to maritime regulations.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ExamResult;
