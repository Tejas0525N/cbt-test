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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { FileText, Plus, Upload, Edit, Eye, Trash2, File, FileQuestion } from "lucide-react";

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

interface Question {
  id: number;
  question_text: string;
  question_type: 'single_choice' | 'multiple_choice';
  question_order: number;
  marks: number;
  options: AnswerOption[];
}

interface AnswerOption {
  id: number;
  option_text: string;
  option_order: number;
  is_correct: boolean;
}

interface QuestionUpload {
  question_text: string;
  question_type?: 'single_choice' | 'multiple_choice';
  question_order?: number;
  marks?: number;
  options: { option_text: string; option_order?: number; is_correct: boolean }[];
  explanation?: string;
}

interface Rank {
  id: number;
  rank_name: string;
  department_id: number;
  department_name: string;
  description?: string;
}

interface Department {
  id: number;
  department_name: string;
  created_at: string;
}

const QuestionBank = () => {
  const queryClient = useQueryClient();
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [newSet, setNewSet] = useState({
    rank_id: "",
    set_name: "",
    description: "",
    total_questions: 30,
    duration_minutes: 30,
    passing_percentage: 75
  });

  const [editSetData, setEditSetData] = useState({
    set_name: "",
    description: "",
    total_questions: 30,
    duration_minutes: 30,
    passing_percentage: 75
  });
  const [bulkQuestions, setBulkQuestions] = useState("");
  const [editingSet, setEditingSet] = useState<QuestionSet | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAnswerSheet, setSelectedAnswerSheet] = useState<File | null>(null);
  const [uploadMethod, setUploadMethod] = useState<'json' | 'file'>('json');
  const [selectedQuestionSetNumber, setSelectedQuestionSetNumber] = useState<'1' | '2' | '3'>('1');

  // Fetch data
  const { data: questionSets = [], isLoading: setsLoading } = useQuery({
    queryKey: ["admin_question_sets"],
    queryFn: adminAPI.getQuestionSets,
  });

  const [selectedSet, setSelectedSet] = useState<QuestionSet | null>(null);

  const { data: multipleQuestionSets, isLoading: multipleSetsLoading } = useQuery({
    queryKey: ["admin_multiple_question_sets", selectedSet?.id],
    queryFn: () => selectedSet ? adminAPI.getMultipleQuestionSets(selectedSet.id) : null,
    enabled: !!selectedSet,
  });

  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ["admin_departments"],
    queryFn: adminAPI.getDepartments,
  });

  const { data: ranks = [], isLoading: ranksLoading } = useQuery({
    queryKey: ["admin_ranks"],
    queryFn: adminAPI.getRanks,
  });

  const { data: filteredRanks = [] } = useQuery({
    queryKey: ["admin_ranks_filtered", selectedDepartment],
    queryFn: () => selectedDepartment ? adminAPI.getRanksByDepartment(parseInt(selectedDepartment)) : [],
    enabled: !!selectedDepartment,
  });

  const { data: questions = [], isLoading: questionsLoading } = useQuery({
    queryKey: ["admin_questions", selectedSet?.id, selectedQuestionSetNumber],
    queryFn: () => {
      if (!selectedSet || !multipleQuestionSets) return [];
      const setKey = `set_${selectedQuestionSetNumber}`;
      return multipleQuestionSets.question_sets?.[setKey] || [];
    },
    enabled: !!selectedSet && !!multipleQuestionSets,
  });

  // Mutations
  const createSetMutation = useMutation({
    mutationFn: adminAPI.createQuestionSet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_question_sets"] });
      toast.success("Question set created successfully");
      setNewSet({
        rank_id: "",
        set_name: "",
        description: "",
        total_questions: 30,
        duration_minutes: 30,
        passing_percentage: 75
      });
      setSelectedDepartment("");
      setSelectedDepartment("");
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to create question set");
    },
  });

  const uploadQuestionsMutation = useMutation({
    mutationFn: ({ setId, questions }: { setId: number; questions: QuestionUpload[] }) => 
      adminAPI.uploadQuestionSet(setId, parseInt(selectedQuestionSetNumber), questions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_questions", selectedSet?.id, selectedQuestionSetNumber] });
      queryClient.invalidateQueries({ queryKey: ["admin_multiple_question_sets", selectedSet?.id] });
      toast.success(`Questions uploaded successfully to Set ${selectedQuestionSetNumber}`);
      setBulkQuestions("");
      setShowQuestionDialog(false);
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to upload questions");
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: ({ setId, file, answerSheet, setNumber }: { setId: number; file: File; answerSheet?: File; setNumber?: number }) => 
      adminAPI.uploadQuestionsFile(setId, file, answerSheet, setNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_multiple_question_sets", selectedSet?.id] });
      queryClient.invalidateQueries({ queryKey: ["admin_questions", selectedSet?.id, selectedQuestionSetNumber] });
      toast.success("File uploaded successfully");
      setSelectedFile(null);
      setSelectedAnswerSheet(null);
      setShowQuestionDialog(false);
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to upload file");
    },
  });

  const uploadAnswerSheetMutation = useMutation({
    mutationFn: ({ setId, answerSheet }: { setId: number; answerSheet: File }) => 
      adminAPI.uploadAnswerSheet(setId, answerSheet),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_questions", selectedSet?.id] });
      toast.success("Answer sheet uploaded successfully");
      setSelectedAnswerSheet(null);
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to upload answer sheet");
    },
  });

  const updateSetMutation = useMutation({
    mutationFn: ({ setId, setData }: { setId: number; setData: Partial<QuestionSet> }) => 
      adminAPI.updateQuestionSet(setId, setData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_question_sets"] });
      toast.success("Question set updated successfully");
      setEditingSet(null);
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to update question set");
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: (setId: number) => adminAPI.deleteQuestionSet(setId),
    onSuccess: (_, setId) => {
      queryClient.invalidateQueries({ queryKey: ["admin_question_sets"] });
      toast.success("Question set deleted successfully");
      if (selectedSet?.id === setId) {
        setSelectedSet(null);
      }
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to delete question set");
    },
  });

  const handleCreateSet = () => {
    if (!newSet.rank_id || !newSet.set_name) {
      toast.error("Please fill all required fields");
      return;
    }
    createSetMutation.mutate({
      ...newSet,
      rank_id: parseInt(newSet.rank_id),
    });
  };

  const handleBulkUpload = () => {
    if (!selectedSet) {
      toast.error("Please select a question set");
      return;
    }

    if (uploadMethod === 'json') {
      if (!bulkQuestions.trim()) {
        toast.error("Please enter questions to upload");
        return;
      }

      try {
        // Parse bulk questions (JSON format)
        const parsedQuestions = JSON.parse(bulkQuestions) as QuestionUpload[];
        
        if (!Array.isArray(parsedQuestions)) {
          throw new Error("Questions must be an array");
        }

        // Validate question format
        for (const question of parsedQuestions) {
          if (!question.question_text || !question.options || !Array.isArray(question.options)) {
            throw new Error("Invalid question format");
          }
          
          if (question.options.length < 2) {
            throw new Error("Each question must have at least 2 options");
          }

          const hasCorrectOption = question.options.some((opt: { option_text: string; is_correct: boolean }) => opt.is_correct);
          if (!hasCorrectOption) {
            throw new Error("Each question must have at least one correct option");
          }
        }

        console.log('Uploading questions:', { 
          setId: selectedSet.id, 
          selectedQuestionSetNumber,
          questionsCount: parsedQuestions.length,
          questions: parsedQuestions 
        });
        
        uploadQuestionsMutation.mutate({ 
          setId: selectedSet.id, 
          questions: parsedQuestions 
        });
      } catch (error) {
        toast.error("Invalid JSON format. Please check your question data.");
      }
    } else {
      if (!selectedFile) {
        toast.error("Please select a file to upload");
        return;
      }

      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!validTypes.includes(selectedFile.type)) {
        toast.error("Please select a PDF or DOCX file");
        return;
      }

      if (!selectedAnswerSheet) {
        toast.error("Please upload the answer sheet (required)");
        return;
      }

      if (!validTypes.includes(selectedAnswerSheet.type)) {
        toast.error("Please select a PDF or DOCX answer sheet");
        return;
      }

      uploadFileMutation.mutate({ 
        setId: selectedSet.id, 
        file: selectedFile,
        answerSheet: selectedAnswerSheet,
        setNumber: parseInt(selectedQuestionSetNumber, 10)
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleAnswerSheetSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedAnswerSheet(file);
    }
  };

  const handleAnswerSheetUpload = () => {
    if (!selectedSet || !selectedAnswerSheet) {
      toast.error("Please select a question set and answer sheet");
      return;
    }

    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(selectedAnswerSheet.type)) {
      toast.error("Please select a PDF or DOCX answer sheet");
      return;
    }

    uploadAnswerSheetMutation.mutate({ 
      setId: selectedSet.id, 
      answerSheet: selectedAnswerSheet 
    });
  };

  const handleEditSet = (set: QuestionSet) => {
    setEditingSet(set);
    setEditSetData({
      set_name: set.set_name,
      description: set.description || "",
      total_questions: set.total_questions,
      duration_minutes: set.duration_minutes,
      passing_percentage: set.passing_percentage
    });
    setShowEditDialog(true);
  };

  const handleUpdateSet = () => {
    if (!editingSet || !editSetData.set_name) {
      toast.error("Please fill all required fields");
      return;
    }
    updateSetMutation.mutate({ 
      setId: editingSet.id, 
      setData: editSetData 
    });
  };

  const handleDeleteSet = (set: QuestionSet) => {
    if (window.confirm(`Are you sure you want to delete "${set.set_name}"? This action cannot be undone.`)) {
      deleteSetMutation.mutate(set.id);
    }
  };

  const sampleQuestions = [
    {
      question_text: "What is the primary purpose of a life jacket?",
      question_type: "single_choice",
      question_order: 1,
      marks: 1.0,
      options: [
        { option_text: "To keep you warm", option_order: 1, is_correct: false },
        { option_text: "To keep you afloat", option_order: 2, is_correct: true },
        { option_text: "To make you visible", option_order: 3, is_correct: false },
        { option_text: "All of the above", option_order: 4, is_correct: false }
      ]
    },
    {
      question_text: "Which of the following are emergency signals? (Select all that apply)",
      question_type: "multiple_choice",
      question_order: 2,
      marks: 1.0,
      options: [
        { option_text: "Seven short blasts followed by one long blast", option_order: 1, is_correct: true },
        { option_text: "Continuous sounding of fog horn", option_order: 2, is_correct: true },
        { option_text: "Red flares", option_order: 3, is_correct: true },
        { option_text: "Blue lights", option_order: 4, is_correct: false }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Question Bank</h2>
          <p className="text-muted-foreground">Manage exam questions organized by rank</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Question Set
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Question Set</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Department</Label>
                <Select 
                  value={selectedDepartment} 
                  onValueChange={(value) => {
                    setSelectedDepartment(value);
                    setNewSet({ ...newSet, rank_id: "" });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department: Department) => (
                      <SelectItem key={department.id} value={department.id.toString()}>
                        {department.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rank *</Label>
                <Select 
                  value={newSet.rank_id} 
                  onValueChange={(value) => setNewSet({ ...newSet, rank_id: value })}
                  disabled={!selectedDepartment}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rank" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRanks.map((rank: Rank) => (
                      <SelectItem key={rank.id} value={rank.id.toString()}>
                        {rank.rank_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Set Name *</Label>
                <Input
                  value={newSet.set_name}
                  onChange={(e) => setNewSet({ ...newSet, set_name: e.target.value })}
                  placeholder="e.g., Captain Exam Set 1"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={newSet.description}
                  onChange={(e) => setNewSet({ ...newSet, description: e.target.value })}
                  placeholder="Enter description..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Total Questions</Label>
                  <Input
                    type="number"
                    value={newSet.total_questions}
                    onChange={(e) => setNewSet({ ...newSet, total_questions: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration (min)</Label>
                  <Input
                    type="number"
                    value={newSet.duration_minutes}
                    onChange={(e) => setNewSet({ ...newSet, duration_minutes: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Passing %</Label>
                  <Input
                    type="number"
                    value={newSet.passing_percentage}
                    onChange={(e) => setNewSet({ ...newSet, passing_percentage: parseInt(e.target.value) || 75 })}
                  />
                </div>
              </div>
              <Button 
                className="w-full" 
                onClick={handleCreateSet} 
                disabled={createSetMutation.isPending}
              >
                {createSetMutation.isPending ? "Creating..." : "Create Set"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Question Sets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Question Sets ({questionSets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {questionSets.map((set: QuestionSet) => (
                <div
                  key={set.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedSet?.id === set.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedSet(set)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{set.set_name}</h3>
                      <p className="text-sm text-muted-foreground">{set.rank_name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {set.total_questions} questions • {set.duration_minutes} min • {set.passing_percentage}% pass
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={set.is_active ? "default" : "secondary"}>
                        {set.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditSet(set);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSet(set);
                          }}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {questionSets.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No question sets found
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Questions {selectedSet && `(${questions.length})`}
            </CardTitle>
            {selectedSet && (
              <div className="flex gap-2">
                <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Questions
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Upload Questions to {selectedSet.set_name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      {/* Question Set Selection */}
                      <div className="space-y-2">
                        <Label>Upload to Question Set *</Label>
                        <Select 
                          value={selectedQuestionSetNumber} 
                          onValueChange={(value: '1' | '2' | '3') => setSelectedQuestionSetNumber(value)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Set 1 (Attempt 1)</SelectItem>
                            <SelectItem value="2">Set 2 (Attempt 2)</SelectItem>
                            <SelectItem value="3">Set 3 (Attempt 3)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Questions will be uploaded to Set {selectedQuestionSetNumber}. Existing questions in this set will be overwritten.
                        </p>
                      </div>
                      {/* Upload Method Selection */}
                      <div className="space-y-2">
                        <Label>Upload Method</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={uploadMethod === 'json' ? 'default' : 'outline'}
                            onClick={() => setUploadMethod('json')}
                            className="flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            JSON Format
                          </Button>
                          <Button
                            type="button"
                            variant={uploadMethod === 'file' ? 'default' : 'outline'}
                            onClick={() => setUploadMethod('file')}
                            className="flex items-center gap-2"
                          >
                            <File className="h-4 w-4" />
                            PDF/DOCX File
                          </Button>
                        </div>
                      </div>

                      {uploadMethod === 'json' ? (
                        <div className="space-y-2">
                          <Label>Questions (JSON Format)</Label>
                          <Textarea
                            value={bulkQuestions}
                            onChange={(e) => setBulkQuestions(e.target.value)}
                            placeholder={`Paste your questions in JSON format here. Example:
${JSON.stringify(sampleQuestions, null, 2)}`}
                            rows={15}
                            className="font-mono text-sm"
                          />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Question File (PDF or DOCX)</Label>
                            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
                              <div className="text-center">
                                <File className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                <div className="space-y-2">
                                  <p className="text-sm text-muted-foreground">
                                    Drop your PDF or DOCX file here, or click to browse
                                  </p>
                                  <input
                                    type="file"
                                    accept=".pdf,.docx"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    id="file-upload"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => document.getElementById('file-upload')?.click()}
                                  >
                                    Choose File
                                  </Button>
                                </div>
                                {selectedFile && (
                                  <div className="mt-4 p-3 bg-muted rounded-lg">
                                    <p className="text-sm font-medium">{selectedFile.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Answer Sheet *</Label>
                            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4">
                              <div className="text-center">
                                <FileQuestion className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground mb-2">
                                  Upload answer sheet (PDF or DOCX)
                                </p>
                                <input
                                  type="file"
                                  accept=".pdf,.docx"
                                  onChange={handleAnswerSheetSelect}
                                  className="hidden"
                                  id="answer-sheet-upload"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => document.getElementById('answer-sheet-upload')?.click()}
                                >
                                  Choose Answer Sheet
                                </Button>
                                {selectedAnswerSheet && (
                                  <div className="mt-2 p-2 bg-muted rounded">
                                    <p className="text-xs font-medium">{selectedAnswerSheet.name}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <Button 
                        className="w-full" 
                        onClick={handleBulkUpload} 
                        disabled={uploadQuestionsMutation.isPending || uploadFileMutation.isPending}
                      >
                        {(uploadQuestionsMutation.isPending || uploadFileMutation.isPending) ? "Uploading..." : "Upload Questions"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAnswerSheetUpload}
                  disabled={uploadAnswerSheetMutation.isPending}
                >
                  <FileQuestion className="h-4 w-4 mr-2" />
                  {uploadAnswerSheetMutation.isPending ? "Uploading..." : "Upload Answer Sheet"}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!selectedSet ? (
              <div className="text-center text-muted-foreground py-8">
                Select a question set to view questions
              </div>
            ) : (
              <div className="space-y-4">
                {/* Question Set Selector */}
                <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                  <Label className="text-sm font-medium">Question Set:</Label>
                  <Select 
                    value={selectedQuestionSetNumber} 
                    onValueChange={(value: '1' | '2' | '3') => setSelectedQuestionSetNumber(value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Set 1 (Attempt 1)</SelectItem>
                      <SelectItem value="2">Set 2 (Attempt 2)</SelectItem>
                      <SelectItem value="3">Set 3 (Attempt 3)</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>Set 1: {multipleQuestionSets?.question_sets?.set_1?.length || 0} questions</span>
                    <span>Set 2: {multipleQuestionSets?.question_sets?.set_2?.length || 0} questions</span>
                    <span>Set 3: {multipleQuestionSets?.question_sets?.set_3?.length || 0} questions</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                {questions.map((question: Question, index: number) => (
                  <div key={question.id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-medium">Q{index + 1}</span>
                      <Badge variant="outline" className="text-xs">
                        {question.question_type === 'single_choice' ? 'Single Choice' : 'Multiple Choice'}
                      </Badge>
                    </div>
                    <p className="text-sm mb-2">{question.question_text}</p>
                    <div className="space-y-1">
                      {question.options.map((option) => (
                        <div key={option.id} className="flex items-center gap-2 text-xs">
                          {question.question_type === 'single_choice' ? (
                            <div className={`w-3 h-3 rounded-full border ${option.is_correct ? 'bg-primary border-primary' : 'border-muted-foreground'}`} />
                          ) : (
                            <Checkbox checked={option.is_correct} disabled className="w-3 h-3" />
                          )}
                          <span className={option.is_correct ? 'font-medium text-primary' : ''}>
                            {option.option_text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {questions.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No questions in this set
                  </div>
                )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Question Set Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Question Set</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Set Name *</Label>
              <Input
                value={editSetData.set_name}
                onChange={(e) => setEditSetData({ ...editSetData, set_name: e.target.value })}
                placeholder="e.g., Captain Exam Set 1"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editSetData.description}
                onChange={(e) => setEditSetData({ ...editSetData, description: e.target.value })}
                placeholder="Enter description..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Total Questions</Label>
                <Input
                  type="number"
                  value={editSetData.total_questions}
                  onChange={(e) => setEditSetData({ ...editSetData, total_questions: parseInt(e.target.value) || 30 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  value={editSetData.duration_minutes}
                  onChange={(e) => setEditSetData({ ...editSetData, duration_minutes: parseInt(e.target.value) || 30 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Passing %</Label>
                <Input
                  type="number"
                  value={editSetData.passing_percentage}
                  onChange={(e) => setEditSetData({ ...editSetData, passing_percentage: parseInt(e.target.value) || 75 })}
                />
              </div>
            </div>
            <Button 
              className="w-full" 
              onClick={handleUpdateSet} 
              disabled={updateSetMutation.isPending}
            >
              {updateSetMutation.isPending ? "Updating..." : "Update Set"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuestionBank;
