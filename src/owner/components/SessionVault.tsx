import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Archive } from 'lucide-react';
import SessionCard from './SessionCard';

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

interface SessionVaultProps {
    sessions: Session[];
    selectedSessionId: string | null;
    onSelectSession: (id: string) => void;
    onCreateSession: () => void;
    onDeploySession: (id: string) => void;
    onStopSession: (id: string) => void;
    onDeleteSession: (id: string) => void;
    onWipeChat: (id: string) => void;
    onRotatePassword: (id: string) => void;
    isLoading: boolean;
}

export default function SessionVault({
    sessions,
    selectedSessionId,
    onSelectSession,
    onCreateSession,
    onDeploySession,
    onStopSession,
    onDeleteSession,
    onWipeChat,
    onRotatePassword,
    isLoading
}: SessionVaultProps) {
    const activeSessions = sessions.filter(s => s.status === 'active' || s.isActive);
    const inactiveSessions = sessions.filter(s => s.status !== 'active' && !s.isActive);

    return (
        <div className="flex flex-col h-full bg-slate-50/50">
            {/* Header */}
            <div className="flex-shrink-0 px-3 py-3 border-b border-slate-100 bg-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Archive size={16} className="text-slate-500" />
                        <span className="font-semibold text-sm text-slate-800">Session Vault</span>
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {sessions.length}
                        </span>
                    </div>
                    <Button
                        size="sm"
                        className="h-7 text-xs rounded-lg bg-blue-600 hover:bg-blue-700"
                        onClick={onCreateSession}
                    >
                        <Plus size={12} className="mr-1" />
                        New
                    </Button>
                </div>
            </div>

            {/* Sessions list */}
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                    {/* Active sessions first */}
                    {activeSessions.map(session => (
                        <SessionCard
                            key={session.id}
                            session={session}
                            isSelected={selectedSessionId === session.id}
                            isLoading={isLoading}
                            onSelect={onSelectSession}
                            onDeploy={onDeploySession}
                            onStop={onStopSession}
                            onDelete={onDeleteSession}
                            onWipeChat={onWipeChat}
                            onRotatePassword={onRotatePassword}
                        />
                    ))}

                    {/* Divider if both active and inactive exist */}
                    {activeSessions.length > 0 && inactiveSessions.length > 0 && (
                        <div className="flex items-center gap-2 py-1">
                            <div className="flex-1 h-px bg-slate-200" />
                            <span className="text-[9px] text-slate-400 uppercase font-medium">History</span>
                            <div className="flex-1 h-px bg-slate-200" />
                        </div>
                    )}

                    {/* Inactive sessions */}
                    {inactiveSessions.map(session => (
                        <SessionCard
                            key={session.id}
                            session={session}
                            isSelected={selectedSessionId === session.id}
                            isLoading={isLoading}
                            onSelect={onSelectSession}
                            onDeploy={onDeploySession}
                            onStop={onStopSession}
                            onDelete={onDeleteSession}
                            onWipeChat={onWipeChat}
                            onRotatePassword={onRotatePassword}
                        />
                    ))}

                    {/* Empty state */}
                    {sessions.length === 0 && (
                        <div className="text-center py-8 text-slate-400">
                            <Archive size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-xs">No sessions yet</p>
                            <p className="text-[10px]">Click "New" to create one</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
