import { useAuth } from '../context/AuthContext';
import { Activity } from 'lucide-react';

export function Login() {
    const { loginWithGoogle } = useAuth();

    return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
            <div className="glass-panel p-8 w-full max-w-md text-center">
                <div className="flex justify-center mb-6">
                    <Activity size={48} className="text-emerald-500" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Neural Ticket</h1>
                <p className="text-zinc-400 mb-8">Institutional Market Intelligence</p>

                <button
                    onClick={loginWithGoogle}
                    className="w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                    Sign in with Google
                </button>

                <div className="mt-6 text-xs text-zinc-600">
                    Protected by Neural Gatekeeper
                </div>
            </div>
        </div>
    );
}
