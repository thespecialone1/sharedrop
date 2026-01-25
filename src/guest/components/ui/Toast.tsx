import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export interface ToastProps {
    id: string;
    title: string;
    message?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
    onDismiss: (id: string) => void;
    onClick?: () => void;
}

export const Toast = ({ id, title, message, type = 'info', duration = 3000, onDismiss, onClick }: ToastProps) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onDismiss(id), 300); // Wait for exit animation
        }, duration);
        return () => clearTimeout(timer);
    }, [duration, id, onDismiss]);

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExiting(true);
        setTimeout(() => onDismiss(id), 300);
    };

    return (
        <div
            className={`
                pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-surface-1 shadow-lg ring-1 ring-border-custom 
                transition-all duration-300 ease-out transform
                ${isExiting ? 'opacity-0 translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'}
                cursor-pointer hover:bg-surface-2
            `}
            onClick={onClick}
        >
            <div className="p-4">
                <div className="flex items-start">
                    <div className="flex-1 w-0">
                        <p className="text-sm font-medium text-text-primary">{title}</p>
                        {message && <p className="mt-1 text-sm text-text-secondary truncate">{message}</p>}
                    </div>
                    <div className="ml-4 flex flex-shrink-0">
                        <button
                            type="button"
                            className="inline-flex rounded-md bg-transparent text-text-secondary hover:text-text-primary focus:outline-none"
                            onClick={handleDismiss}
                        >
                            <span className="sr-only">Close</span>
                            <X className="h-5 w-5" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
