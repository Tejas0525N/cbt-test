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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Users, Plus, Edit, Eye, EyeOff, Trash2 } from "lucide-react";

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
  password?: string; // Optional password field for admin access
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

const UserManagement = () => {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
    rank_id: 0,
    phone: ""
  });

  const [editUserData, setEditUserData] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
    rank_id: 0,
    phone: "",
    is_active: true,
    department_id: 0
  });

  const [editSelectedDepartment, setEditSelectedDepartment] = useState("");

  const [selectedDepartment, setSelectedDepartment] = useState("");

  // Fetch users, departments and ranks
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin_users"],
    queryFn: adminAPI.getUsers,
  });

  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ["admin_departments"],
    queryFn: adminAPI.getDepartments,
  });

  const { data: ranks = [], isLoading: ranksLoading } = useQuery({
    queryKey: ["admin_ranks"],
    queryFn: adminAPI.getRanks,
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: adminAPI.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast.success("User created successfully");
      setNewUser({
        username: "",
        email: "",
        password: "",
        full_name: "",
        rank_id: 0,
        phone: ""
      });
      setSelectedDepartment("");
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to create user");
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<User>) => adminAPI.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast.success("User updated successfully");
      setEditingUser(null);
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to update user");
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => adminAPI.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast.success("User and all associated exams deleted successfully");
    },
    onError: (error: unknown) => {
      toast.error((error as Error)?.message || "Failed to delete user");
    },
  });

  const handleCreateUser = () => {
    if (!newUser.username || !newUser.email || !newUser.password || !newUser.full_name || !newUser.rank_id) {
      toast.error("Please fill all required fields");
      return;
    }
    createUserMutation.mutate(newUser);
  };

  const handleUpdateUserClick = () => {
    if (!editingUser) return;
    // Only send fields that are expected by the API
    const { department_id, password, ...updateData } = editUserData;
    const payload = password ? { ...updateData, password } : updateData;
    updateUserMutation.mutate({ id: editingUser.id, ...payload } as any);
  };

  const handleEditUser = (user: User) => {
    console.log('Editing user:', user);
    setEditingUser(user);
    
    // Find the user's rank to get department information
    const userRank = ranks.find(rank => rank.id === user.rank_id);
    const departmentId = userRank ? userRank.department_id.toString() : "";
    
    setEditUserData({
      username: user.username,
      email: user.email,
      password: "", // Don't populate password for security
      full_name: user.full_name,
      rank_id: user.rank_id,
      phone: user.phone || "",
      is_active: user.is_active,
      department_id: userRank ? userRank.department_id : 0
    });
    setEditSelectedDepartment(departmentId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground">Manage seafarer accounts and permissions</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Username *</Label>
                <Input
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="Enter username"
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Enter password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="Enter full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <div className="text-xs text-red-500">
                  Debug: Departments count: {departments.length}, Loading: {departmentsLoading.toString()}
                </div>
                <Select value={selectedDepartment} onValueChange={(value) => {
                  setSelectedDepartment(value);
                  setNewUser({ ...newUser, rank_id: parseInt(value) || 0 });
                }}>
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
                <Label>Position/Rank *</Label>
                <Select 
                  value={newUser.rank_id?.toString() || ""} 
                  onValueChange={(value) => setNewUser({ ...newUser, rank_id: parseInt(value) || 0 })}
                  disabled={!selectedDepartment}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select position/rank" />
                  </SelectTrigger>
                  <SelectContent>
                    {ranks
                      .filter((rank: Rank) => rank.department_id.toString() === selectedDepartment)
                      .map((rank: Rank) => (
                        <SelectItem key={rank.id} value={rank.id.toString()}>
                          {rank.rank_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={newUser.phone}
                  onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleCreateUser} 
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Registered Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user: User) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.full_name}</span>
                      <span className="text-xs text-muted-foreground">{user.rank_name}</span>
                      <span className="text-xs text-muted-foreground">{user.department_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? "default" : "secondary"}>
                      {user.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "destructive" : "outline"}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditUser(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>Edit User</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                              <Label>Username</Label>
                              <Input
                                value={editUserData.username}
                                onChange={(e) => setEditUserData({ ...editUserData, username: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Email</Label>
                              <Input
                                type="email"
                                value={editUserData.email}
                                onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Full Name</Label>
                              <Input
                                value={editUserData.full_name}
                                onChange={(e) => setEditUserData({ ...editUserData, full_name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Password</Label>
                              <div className="relative">
                                <Input
                                  type={showEditPassword ? "text" : "password"}
                                  value={editUserData.password}
                                  onChange={(e) => setEditUserData({ ...editUserData, password: e.target.value })}
                                  placeholder="Enter password"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-0 top-0 h-full px-3 py-2"
                                  onClick={() => setShowEditPassword(!showEditPassword)}
                                >
                                  {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Department</Label>
                              <Select 
                                value={editSelectedDepartment} 
                                onValueChange={(value) => {
                                  setEditSelectedDepartment(value);
                                  setEditUserData({ ...editUserData, department_id: parseInt(value) || 0, rank_id: 0 });
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
                              <Label>Position/Rank</Label>
                              <Select 
                                value={editUserData.rank_id?.toString() || ""} 
                                onValueChange={(value) => setEditUserData({ ...editUserData, rank_id: parseInt(value) })}
                                disabled={!editSelectedDepartment}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select position/rank" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ranks
                                    .filter((rank: Rank) => rank.department_id.toString() === editSelectedDepartment)
                                    .map((rank: Rank) => (
                                      <SelectItem key={rank.id} value={rank.id.toString()}>
                                        {rank.rank_name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Phone</Label>
                              <Input
                                value={editUserData.phone}
                                onChange={(e) => setEditUserData({ ...editUserData, phone: e.target.value })}
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <Switch
                                id="is_active"
                                checked={editUserData.is_active}
                                onCheckedChange={(checked) => setEditUserData({ ...editUserData, is_active: checked })}
                              />
                              <Label htmlFor="is_active">Active Status</Label>
                            </div>
                            <Button 
                              className="w-full" 
                              onClick={handleUpdateUserClick} 
                              disabled={updateUserMutation.isPending}
                            >
                              {updateUserMutation.isPending ? "Updating..." : "Update User"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete "${user.full_name}"? This will also delete all their scheduled exams and associated data. This action cannot be undone.`)) {
                            deleteUserMutation.mutate(user.id);
                          }
                        }}
                        disabled={deleteUserMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserManagement;
