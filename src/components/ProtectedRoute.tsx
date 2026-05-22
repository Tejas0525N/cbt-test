import { useAuth } from "@/hooks/useAuth";
import { Navigate, Outlet } from "react-router-dom";
import { Anchor } from "lucide-react";

export function ProtectedRoute({ allowedRole }: { allowedRole?: "admin" | "user" }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Anchor className="h-12 w-12 text-primary animate-pulse" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRole && role !== allowedRole) {
    return <Navigate to={role === "admin" ? "/admin" : "/exam"} replace />;
  }

  return <Outlet />;
}
