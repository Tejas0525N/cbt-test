import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calendar, Plus, Clock, User, BookOpen, Edit, Trash2 } from "lucide-react";

interface ExamSession {
  id: number;
  user_id: number;
  question_set_id: number;
  title: string;
  description?: string;
  scheduled_date: string;
  start_date: string;
  end_date: string;
  duration_minutes: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'expired';
  created_at: string;
  full_name: string;
  email: string;
  set_name: string;
  rank_name: string;
  department_name: string;
}

interface ExamSessionFormData {
  user_id: string;
  question_set_id: string;
  title: string;
  description: string;
  scheduled_date: string;
  start_date: string;
  end_date: string;
  duration_minutes: number;
}

interface ExamSessionPayload {
  user_id: number;
  question_set_id: number;
  title: string;
  description: string;
  scheduled_date: string;
  start_date: string;
  end_date: string;
  duration_minutes: number;
}

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  rank_id: number;
  rank_name: string;
  department_name: string;
  phone?: string;
  created_at: string;
  is_active: boolean;
  role: string;
}

interface QuestionSet {
  id: number;
  rank_id: number;
  set_name: string;
  description?: string;
  total_questions: number;
  duration_minutes: number;
  passing_percentage: number;
  is_active: boolean;
  created_at: string;
  rank_name: string;
  department_name: string;
}

interface Department {
  id: number;
  department_name: string;
  created_at: string;
}

const ExamScheduling = () => {
  const queryClient = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [newSession, setNewSession] = useState<ExamSessionFormData>({
    user_id: "",
    question_set_id: "",
    title: "",
    description: "",
    scheduled_date: "",
    start_date: "",
    end_date: "",
    duration_minutes: 30
  });

  const [editingSession, setEditingSession] = useState<ExamSession | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editSessionData, setEditSessionData] = useState<ExamSessionFormData>({
    user_id: "",
    question_set_id: "",
    title: "",
    description: "",
    scheduled_date: "",
    start_date: "",
    end_date: "",
    duration_minutes: 30
  });

  // Fetch data
  const { data: examSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["admin_exam_sessions"],
    queryFn: adminAPI.getExamSessions,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin_users"],
    queryFn: adminAPI.getUsers,
  });

  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ["admin_departments"],
    queryFn: adminAPI.getDepartments,
  });

  const { data: questionSets = [], isLoading: setsLoading } = useQuery({
    queryKey: ["admin_question_sets"],
    queryFn: adminAPI.getQuestionSets,
  });

  const { data: examResults = [], isLoading: resultsLoading } = useQuery({
    queryKey: ["admin_exam_results"],
    queryFn: adminAPI.getExamResults,
  });

  const { data: filteredRanks = [] } = useQuery({
    queryKey: ["admin_ranks_filtered", selectedDepartment],
    queryFn: () => selectedDepartment ? adminAPI.getRanksByDepartment(parseInt(selectedDepartment)) : [],
    enabled: !!selectedDepartment,
  });

  const { data: filteredQuestionSets = [] } = useQuery({
    queryKey: ["admin_question_sets_filtered", selectedDepartment],
    queryFn: () => {
      if (!selectedDepartment) return [];
      return questionSets.filter((set: QuestionSet) => set.rank_id.toString() === selectedDepartment);
    },
    enabled: !!selectedDepartment,
  });

  const { data: filteredUsers = [] } = useQuery({
    queryKey: ["admin_users_filtered", selectedDepartment],
    queryFn: () => {
      if (!selectedDepartment) return [];
      return users.filter((user: User) => user.department_name === selectedDepartment);
    },
    enabled: !!selectedDepartment,
  });

  // Create exam session mutation
  const createSessionMutation = useMutation({
    mutationFn: adminAPI.createExamSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_exam_sessions"] });
      toast.success("Exam scheduled successfully");
      setNewSession({
        user_id: "",
        question_set_id: "",
        title: "",
        description: "",
        scheduled_date: "",
        start_date: "",
        end_date: "",
        duration_minutes: 30
      });
      setSelectedDepartment("");
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to schedule exam");
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, sessionData }: { sessionId: number; sessionData: Partial<ExamSessionPayload> }) => 
      adminAPI.updateExamSession(sessionId, sessionData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_exam_sessions"] });
      toast.success("Exam session updated successfully");
      setEditingSession(null);
      setShowEditDialog(false);
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to update exam session");
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => adminAPI.deleteExamSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_exam_sessions"] });
      toast.success("Exam session deleted successfully");
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to delete exam session");
    },
  });

  const handleScheduleExam = () => {
    if (!newSession.user_id || !newSession.question_set_id || !newSession.title || !newSession.start_date || !newSession.end_date) {
      toast.error("Please fill all required fields");
      return;
    }

    const payload: ExamSessionPayload = {
      ...newSession,
      user_id: parseInt(newSession.user_id),
      question_set_id: parseInt(newSession.question_set_id),
    };
    createSessionMutation.mutate(payload);
  };

  const handleEditSession = (session: ExamSession) => {
    setEditingSession(session);
    setEditSessionData({
      user_id: session.user_id.toString(),
      question_set_id: session.question_set_id.toString(),
      title: session.title,
      description: session.description || "",
      scheduled_date: new Date(session.scheduled_date).toISOString().slice(0, 16),
      start_date: new Date(session.start_date).toISOString().slice(0, 16),
      end_date: new Date(session.end_date).toISOString().slice(0, 16),
      duration_minutes: session.duration_minutes
    });
    setShowEditDialog(true);
  };

  const handleUpdateSession = () => {
    if (!editingSession || !editSessionData.user_id || !editSessionData.question_set_id || !editSessionData.title || !editSessionData.start_date || !editSessionData.end_date) {
      toast.error("Please fill all required fields");
      return;
    }
    const payload: Partial<ExamSessionPayload> = {
      ...editSessionData,
      user_id: parseInt(editSessionData.user_id),
      question_set_id: parseInt(editSessionData.question_set_id),
    };
    updateSessionMutation.mutate({ 
      sessionId: editingSession.id, 
      sessionData: payload 
    });
  };

  const handleDeleteSession = (session: ExamSession) => {
    if (window.confirm(`Are you sure you want to delete "${session.title}"? This action cannot be undone.`)) {
      deleteSessionMutation.mutate(session.id);
    }
  };

  // Check if a user has passed an exam session
  const hasUserPassedExam = (session: ExamSession): boolean => {
    // Look for exam results where the exam was passed
    // We check by matching user_id and exam session title or by checking if there's a passed result
    const passedResult = examResults.find((res: any) => 
      res.passed === 1 || res.passed === true
    );
    
    // For now, if the session status is 'completed' and we have a result that shows passed,
    // we consider it passed
    if (session.status === 'completed' && passedResult) {
      return true;
    }
    return false;
  };

  // Get the display status for an exam session
  const getDisplayStatus = (session: ExamSession): string => {
    // If user has passed, show "Completed"
    if (hasUserPassedExam(session)) {
      return 'Completed';
    }
    return session.status;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      scheduled: "default",
      in_progress: "secondary",
      completed: "outline",
      expired: "destructive"
    };
    return variants[status] || "outline";
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

  const activeUsers = users.filter((user: User) => user.is_active);
  const activeQuestionSets = questionSets.filter((set: QuestionSet) => set.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Exam Scheduling</h2>
          <p className="text-muted-foreground">Schedule exams for seafarers</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Schedule Exam
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule New Exam</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Select User *</Label>
                <Select value={newSession.user_id} onValueChange={(value) => setNewSession({ ...newSession, user_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeUsers.map((user: User) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        <div className="flex flex-col">
                          <span>{user.full_name}</span>
                          <span className="text-xs text-muted-foreground">{user.rank_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Question Set *</Label>
                <Select value={newSession.question_set_id} onValueChange={(value) => setNewSession({ ...newSession, question_set_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select question set" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeQuestionSets.map((set: QuestionSet) => (
                      <SelectItem key={set.id} value={set.id.toString()}>
                        <div className="flex flex-col">
                          <span>{set.set_name}</span>
                          <span className="text-xs text-muted-foreground">{set.rank_name} • {set.total_questions} questions</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Exam Title *</Label>
                <Input
                  value={newSession.title}
                  onChange={(e) => setNewSession({ ...newSession, title: e.target.value })}
                  placeholder="e.g., Maritime Safety Assessment"
                />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newSession.description}
                  onChange={(e) => setNewSession({ ...newSession, description: e.target.value })}
                  placeholder="Enter exam description..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Start Date & Time *</Label>
                <Input
                  type="datetime-local"
                  value={newSession.start_date}
                  onChange={(e) => setNewSession({ ...newSession, start_date: e.target.value })}
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>

              <div className="space-y-2">
                <Label>End Date & Time *</Label>
                <Input
                  type="datetime-local"
                  value={newSession.end_date}
                  onChange={(e) => setNewSession({ ...newSession, end_date: e.target.value })}
                  min={newSession.start_date || new Date().toISOString().slice(0, 16)}
                />
              </div>

              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={newSession.duration_minutes}
                  onChange={(e) => setNewSession({ ...newSession, duration_minutes: parseInt(e.target.value) || 30 })}
                  min="1"
                  max="180"
                />
              </div>

              <Button 
                className="w-full" 
                onClick={handleScheduleExam} 
                disabled={createSessionMutation.isPending}
              >
                {createSessionMutation.isPending ? "Scheduling..." : "Schedule Exam"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-xl bg-blue-10 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{examSessions.length}</p>
              <p className="text-sm text-muted-foreground">Total Exams</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-xl bg-yellow-10 text-yellow-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {examSessions.filter((s: ExamSession) => s.status === 'scheduled').length}
              </p>
              <p className="text-sm text-muted-foreground">Scheduled</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-xl bg-green-10 text-green-600">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeUsers.length}</p>
              <p className="text-sm text-muted-foreground">Active Users</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-3 rounded-xl bg-purple-10 text-purple-600">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeQuestionSets.length}</p>
              <p className="text-sm text-muted-foreground">Question Sets</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exam Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Scheduled Exams
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Question Set</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>End Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {examSessions.map((session: ExamSession) => (
                <TableRow key={session.id}>
                  <TableCell className="font-medium">{session.title}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{session.full_name}</span>
                      <span className="text-xs text-muted-foreground">{session.rank_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{session.set_name}</span>
                      <span className="text-xs text-muted-foreground">{session.rank_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{formatDateTime(session.start_date)}</TableCell>
                  <TableCell>{formatDateTime(session.end_date)}</TableCell>
                  <TableCell>{session.duration_minutes} min</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadge(getDisplayStatus(session))}>
                      {getDisplayStatus(session).replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(session.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditSession(session)}
                        disabled={session.status !== 'scheduled'}
                        className="h-8 w-8 p-0"
                        title={session.status !== 'scheduled' ? 'Cannot edit - exam already started' : 'Edit exam'}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteSession(session)}
                        disabled={session.status !== 'scheduled'}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        title={session.status !== 'scheduled' ? 'Cannot delete - exam already started' : 'Delete exam'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {examSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No exams scheduled yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Exam Session Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Exam Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Select User *</Label>
              <Select value={editSessionData.user_id} onValueChange={(value) => setEditSessionData({ ...editSessionData, user_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {activeUsers.map((user: User) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      <div className="flex flex-col">
                        <span>{user.full_name}</span>
                        <span className="text-xs text-muted-foreground">{user.rank_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Question Set *</Label>
              <Select value={editSessionData.question_set_id} onValueChange={(value) => setEditSessionData({ ...editSessionData, question_set_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select question set" />
                </SelectTrigger>
                <SelectContent>
                  {activeQuestionSets.map((set: QuestionSet) => (
                    <SelectItem key={set.id} value={set.id.toString()}>
                      <div className="flex flex-col">
                        <span>{set.set_name}</span>
                        <span className="text-xs text-muted-foreground">{set.rank_name} â¢ {set.total_questions} questions</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Exam Title *</Label>
              <Input
                value={editSessionData.title}
                onChange={(e) => setEditSessionData({ ...editSessionData, title: e.target.value })}
                placeholder="e.g., Maritime Safety Assessment"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editSessionData.description}
                onChange={(e) => setEditSessionData({ ...editSessionData, description: e.target.value })}
                placeholder="Enter exam description..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Start Date & Time *</Label>
              <Input
                type="datetime-local"
                value={editSessionData.start_date}
                onChange={(e) => setEditSessionData({ ...editSessionData, start_date: e.target.value })}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>

            <div className="space-y-2">
              <Label>End Date & Time *</Label>
              <Input
                type="datetime-local"
                value={editSessionData.end_date}
                onChange={(e) => setEditSessionData({ ...editSessionData, end_date: e.target.value })}
                min={editSessionData.start_date || new Date().toISOString().slice(0, 16)}
              />
            </div>

            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                value={editSessionData.duration_minutes}
                onChange={(e) => setEditSessionData({ ...editSessionData, duration_minutes: parseInt(e.target.value) || 30 })}
                min="1"
                max="180"
              />
            </div>

            <Button 
              className="w-full" 
              onClick={handleUpdateSession} 
              disabled={updateSessionMutation.isPending}
            >
              {updateSessionMutation.isPending ? "Updating..." : "Update Exam"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExamScheduling;
