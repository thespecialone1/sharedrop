import React from 'react';
import { Mic, X, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface VoiceBannerProps {
    hostName: string;
    onJoin: () => void;
    onDismiss: () => void;
}

export const VoiceBanner = ({ hostName, onJoin, onDismiss }: VoiceBannerProps) => {
    return (
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-surface-1 text-text-primary shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-3 flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300 border border-border-custom ring-1 ring-border-custom">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0 relative">
                <Mic size={20} className="text-blue-500" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-text-primary">{hostName}</p>
                <p className="text-xs text-text-secondary font-medium">Started a voice chat</p>
            </div>
            <div className="flex items-center gap-1.5">
                <Button
                    size="sm"
                    className="h-8 bg-black hover:bg-slate-800 text-white border-0 font-medium px-4 rounded-lg shadow-sm transition-all"
                    onClick={onJoin}
                >
                    <Phone size={14} className="mr-1.5" />
                    Join
                </Button>
                <button
                    onClick={onDismiss}
                    className="p-1.5 hover:bg-surface-2 rounded-lg text-text-secondary hover:text-text-primary transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};
