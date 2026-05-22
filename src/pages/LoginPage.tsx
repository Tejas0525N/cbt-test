import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Anchor, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const LoginPage = () => {
  const { signIn, user, role, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-primary">
        <Anchor className="h-12 w-12 text-accent animate-pulse" />
      </div>
    );
  }

  if (user && role === "admin") return <Navigate to="/admin" replace />;
  if (user && role === "user") return <Navigate to="/exam" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Please enter your credentials");
      return;
    }
    setIsLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error("Invalid credentials. Please try again.");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-primary relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-accent blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-secondary blur-3xl" />
      </div>

      <Card className="w-full max-w-md mx-4 border-0 shadow-2xl bg-card relative z-10">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
            <Anchor className="h-8 w-8 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">
              Maritime CBT Platform
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Computer Based Test for Seafarers
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email / User ID</Label>
              <Input
                id="email"
                type="text"
                placeholder="Enter your email or user ID"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
            <ShieldCheck className="h-4 w-4" />
            <span>Secure exam environment</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginPage;
