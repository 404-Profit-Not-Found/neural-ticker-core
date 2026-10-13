import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export function AdminRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
                <div className="text-blue-500">Loading...</div>
            </div>
        );
    }

    if (!user || user.role !== 'admin') {
        return <Navigate to="/access-denied" replace />;
    }

    return <>{children}</>;
}
