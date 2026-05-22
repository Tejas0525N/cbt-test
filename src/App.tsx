import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import AdminDashboard from "@/pages/AdminDashboard";
import ExamPortal from "@/pages/ExamPortal";
import ExamInstructions from "@/pages/ExamInstructions";
import ExamTake from "@/pages/ExamTake";
import ExamResult from "@/pages/ExamResult";
import UserProfile from "@/pages/UserProfile";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            
            {/* Admin routes */}
            <Route element={<ProtectedRoute allowedRole="admin" />}>
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>

            {/* User/Exam routes */}
            <Route element={<ProtectedRoute allowedRole="user" />}>
              <Route path="/exam" element={<ExamPortal />} />
              <Route path="/exam/instructions/:sessionId" element={<ExamInstructions />} />
              <Route path="/exam/take/:sessionId" element={<ExamTake />} />
              <Route path="/exam/result/:sessionId" element={<ExamResult />} />
              <Route path="/profile" element={<UserProfile />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
