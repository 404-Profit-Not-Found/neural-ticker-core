import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
                    <div className="bg-red-500/10 p-4 rounded-full mb-4">
                        <AlertTriangle className="w-12 h-12 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h2>
                    <p className="text-muted-foreground max-w-md mb-6">
                        We encountered an unexpected error while rendering this component.
                        {this.state.error?.message && (
                            <span className="block mt-2 font-mono text-xs bg-muted p-2 rounded text-red-400">
                                {this.state.error.message}
                            </span>
                        )}
                    </p>
                    <Button
                        onClick={() => window.location.reload()}
                        className="gap-2"
                    >
                        <RefreshCw size={16} />
                        Reload Application
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
