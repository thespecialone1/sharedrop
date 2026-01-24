/// <reference types="vite/client" />
import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// [REMOVED] Sentry initialization

// Error Boundary component for catching React errors
interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        console.error('React error caught:', error, errorInfo);
        // [REMOVED] Sentry capture
    }

    render(): ReactNode {
        if (this.state.hasError && this.state.error) {
            return (
                <div className="flex h-screen w-screen items-center justify-center bg-zinc-900 p-8">
                    <div className="text-center">
                        <h1 className="mb-4 text-2xl font-semibold text-white">Something went wrong</h1>
                        <p className="mb-4 text-zinc-400">{this.state.error.message}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                        >
                            Reload App
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <AppErrorBoundary>
            <App />
        </AppErrorBoundary>
    </React.StrictMode>,
)

