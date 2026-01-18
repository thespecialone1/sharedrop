import React from 'react';
import { Button } from '@/components/ui/button';
import { Folder, Play, Trash2, Key, MessageCircle, Clock, Users, MoreVertical } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

interface Session {
    id: string;
    folder_name: string;
    folder_path: string;
    password: string;
    status: 'active' | 'inactive';
    created_at: number;
    last_deployed_at: number | null;
    total_duration_ms: number;
    messageCount: number;
    usersInvolved: string[];
    isActive: boolean;
}

interface SessionCardProps {
    session: Session;
    onDeploy: (id: string) => void;
    onStop: (id: string) => void;
    onDelete: (id: string) => void;
    onWipeChat: (id: string) => void;
    onRotatePassword: (id: string) => void;
    onSelect: (id: string) => void;
    isSelected: boolean;
    isLoading: boolean;
}

function formatDuration(ms: number): string {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
}

function formatDate(ts: number | null): string {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function SessionCard({
    session,
    onDeploy,
    onStop,
    onDelete,
    onWipeChat,
    onRotatePassword,
    onSelect,
    isSelected,
    isLoading
}: SessionCardProps) {
    const isActive = session.status === 'active' || session.isActive;

    return (
        <div
            onClick={() => onSelect(session.id)}
            className={`
                group relative p-3 rounded-xl border transition-all cursor-pointer
                ${isSelected
                    ? 'bg-blue-50 border-blue-200 shadow-sm'
                    : 'bg-white border-slate-100 hover:border-slate-200 hover:shadow-sm'}
                ${isActive ? 'ring-2 ring-green-400/50' : ''}
            `}
        >
            {/* Status indicator */}
            {isActive && (
                <div className="absolute top-2 right-2 flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-semibold text-green-600 uppercase">Live</span>
                </div>
            )}

            {/* Header */}
            <div className="flex items-start gap-2.5">
                <div className={`p-2 rounded-lg ${isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Folder size={18} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">{session.folder_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{session.folder_path}</p>
                </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 mt-2.5 text-[10px] text-slate-500">
                <div className="flex items-center gap-1">
                    <Clock size={10} />
                    <span>{formatDuration(session.total_duration_ms)}</span>
                </div>
                <div className="flex items-center gap-1">
                    <MessageCircle size={10} />
                    <span>{session.messageCount}</span>
                </div>
                <div className="flex items-center gap-1">
                    <Users size={10} />
                    <span>{session.usersInvolved?.length || 0}</span>
                </div>
                <span className="text-slate-300">•</span>
                <span>{formatDate(session.last_deployed_at)}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 mt-2.5">
                {isActive ? (
                    <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs rounded-lg flex-1"
                        onClick={(e) => { e.stopPropagation(); onStop(session.id); }}
                        disabled={isLoading}
                    >
                        Stop
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        className="h-7 text-xs rounded-lg bg-green-600 hover:bg-green-700 flex-1"
                        onClick={(e) => { e.stopPropagation(); onDeploy(session.id); }}
                        disabled={isLoading}
                    >
                        <Play size={12} className="mr-1" />
                        Deploy
                    </Button>
                )}

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreVertical size={14} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => onWipeChat(session.id)}>
                            <MessageCircle size={12} className="mr-2" />
                            Wipe Chat
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onRotatePassword(session.id)}>
                            <Key size={12} className="mr-2" />
                            New Password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => onDelete(session.id)}
                            className="text-red-600 focus:text-red-600"
                        >
                            <Trash2 size={12} className="mr-2" />
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
