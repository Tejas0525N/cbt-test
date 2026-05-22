import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Anchor, 
  Users, 
  FileText, 
  Calendar, 
  BarChart3, 
  LogOut, 
  Settings,
  Home
} from "lucide-react";
import UserManagement from "./UserManagement";
import QuestionBank from "./QuestionBank";
import ExamScheduling from "./ExamScheduling";
import ResultsReview from "./ResultsReview";

const AdminLayout = () => {
  const { signOut, user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const handleSignOut = () => {
    signOut();
    toast.success("Logged out successfully");
  };

  const navigationItems = [
    { id: "overview", label: "Overview", icon: Home },
    { id: "users", label: "User Management", icon: Users },
    { id: "questions", label: "Question Bank", icon: FileText },
    { id: "exams", label: "Exam Scheduling", icon: Calendar },
    { id: "results", label: "Results Review", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="bg-primary text-primary-foreground border-b">
        <div className="container mx-auto flex items-center justify-between py-4 px-4">
          <div className="flex items-center gap-3">
            <Anchor className="h-7 w-7 text-accent" />
            <h1 className="text-xl font-heading font-bold">Maritime CBT Admin</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm">Welcome, {user?.full_name}</span>
            <Button variant="ghost" onClick={handleSignOut} className="text-primary-foreground hover:bg-primary/80">
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-4">
        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger key={item.id} value={item.id} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Tab Contents */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <QuickActionCard
                icon={<Users className="h-8 w-8" />}
                title="User Management"
                description="Create and manage seafarer accounts"
                onClick={() => setActiveTab("users")}
                color="blue"
              />
              <QuickActionCard
                icon={<FileText className="h-8 w-8" />}
                title="Question Bank"
                description="Upload and organize exam questions by rank"
                onClick={() => setActiveTab("questions")}
                color="green"
              />
              <QuickActionCard
                icon={<Calendar className="h-8 w-8" />}
                title="Exam Scheduling"
                description="Schedule exams for candidates"
                onClick={() => setActiveTab("exams")}
                color="yellow"
              />
              <QuickActionCard
                icon={<BarChart3 className="h-8 w-8" />}
                title="Results Review"
                description="Review and publish exam results"
                onClick={() => setActiveTab("results")}
                color="purple"
              />
            </div>

            {/* System Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">New user registrations</span>
                      <span className="font-medium">12 this week</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">Exams completed</span>
                      <span className="font-medium">8 this week</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">Pass rate</span>
                      <span className="font-medium">75%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">System Status</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-sm">Database</span>
                      <span className="font-medium text-green-600">Connected</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-sm">Email Service</span>
                      <span className="font-medium text-green-600">Active</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-sm">Security</span>
                      <span className="font-medium text-green-600">Enabled</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          <TabsContent value="questions">
            <QuestionBank />
          </TabsContent>

          <TabsContent value="exams">
            <ExamScheduling />
          </TabsContent>

          <TabsContent value="results">
            <ResultsReview />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

interface QuickActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  color: "blue" | "green" | "yellow" | "purple";
}

const QuickActionCard = ({ icon, title, description, onClick, color }: QuickActionCardProps) => {
  const colorClasses = {
    blue: "hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700",
    green: "hover:bg-green-50 hover:border-green-200 hover:text-green-700",
    yellow: "hover:bg-yellow-50 hover:border-yellow-200 hover:text-yellow-700",
    purple: "hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700",
  };

  const iconColorClasses = {
    blue: "text-blue-600 bg-blue-100",
    green: "text-green-600 bg-green-100",
    yellow: "text-yellow-600 bg-yellow-100",
    purple: "text-purple-600 bg-purple-100",
  };

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-md ${colorClasses[color]}`}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 py-6">
        <div className={`p-4 rounded-xl ${iconColorClasses[color]}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminLayout;
