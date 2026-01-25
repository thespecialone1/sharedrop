import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Folder, Play, Square, ExternalLink, Copy, Check, Trash2, Key,
    MessageCircle, Clock, Users, MoreVertical, Plus, ChevronDown, ChevronRight
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { SessionRoster, Member } from './components/SessionRoster';
import { BannedUsersDialog } from './components/BannedUsersDialog';
// import { toast } from 'sonner'; 

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

const formatDuration = (ms: number): string => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    const hours = Math.floor(ms / 3600000);
    const mins = Math.round((ms % 3600000) / 60000);
    return `${hours}h ${mins}m`;
};

const OwnerApp = () => {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeSession, setActiveSession] = useState<{ active: boolean; sessionId?: string; tunnelUrl?: string; password?: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [copiedPass, setCopiedPass] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ type: 'delete' | 'wipe' | 'kick' | 'ban' | null; sessionId: string | null; targetMember?: Member; banScope?: 'session' | 'global' }>({ type: null, sessionId: null });
    const [appVersion, setAppVersion] = useState<string>('');
    const [deployError, setDeployError] = useState<string | null>(null);
    const [sessionMembers, setSessionMembers] = useState<Member[]>([]);
    const [showBans, setShowBans] = useState(false);

    useEffect(() => {
        loadSessions();
        loadActiveSession();
        // Load app version
        window.electronAPI.getAppVersion().then(setAppVersion);

        // Listen for member updates
        window.electronAPI.onSessionMembersUpdate((data: { roomId: string; members: Member[] }) => {
            // Update only if it matches active session or just update state
            // Ideally we check roomId against activeSession.sessionId but the event listener is global
            setSessionMembers(data.members);
        });
    }, []);

    const loadSessions = async () => {
        const result = await window.electronAPI.getSessions();
        setSessions(result);
    };

    const loadActiveSession = async () => {
        const result = await window.electronAPI.getActiveSession();
        setActiveSession(result);
    };

    const handleCreateSession = async () => {
        const result = await window.electronAPI.selectFolder();
        if (!result.success || !result.path) return;

        setIsLoading(true);
        const createResult = await window.electronAPI.createSession(result.path);
        if (createResult.success && createResult.session) {
            await loadSessions();
            // Auto-deploy new session
            await handleDeploy(createResult.session.id);
        }
        setIsLoading(false);
    };

    const handleDeploy = async (sessionId: string) => {
        setIsLoading(true);
        setDeployError(null);
        try {
            const result = await window.electronAPI.deploySession(sessionId);
            if (result.success) {
                setActiveSession({
                    active: true,
                    sessionId,
                    tunnelUrl: result.url,
                    password: result.password
                });
            } else {
                setDeployError(result.error || 'Deploy failed');
                console.error('Deploy failed:', result.error);
            }
        } catch (e) {
            setDeployError(e instanceof Error ? e.message : 'Unknown error');
            console.error('Deploy error:', e);
        }
        await loadSessions();
        setIsLoading(false);
    };

    const handleStop = async () => {
        if (!activeSession?.sessionId) return;
        setIsLoading(true);
        await window.electronAPI.stopSession(activeSession.sessionId);
        setActiveSession({ active: false });
        await loadSessions();
        setIsLoading(false);
    };

    const handleOpenInBrowser = async () => {
        if (activeSession?.tunnelUrl) {
            await window.electronAPI.openExternal(activeSession.tunnelUrl);
        }
    };

    const handleDelete = async (sessionId: string) => {
        setIsLoading(true);
        await window.electronAPI.deleteSession(sessionId);
        if (activeSession?.sessionId === sessionId) {
            setActiveSession({ active: false });
        }
        await loadSessions();
        setConfirmDialog({ type: null, sessionId: null });
        setIsLoading(false);
    };

    const handleWipeChat = async (sessionId: string) => {
        setIsLoading(true);
        await window.electronAPI.wipeSessionChat(sessionId);
        await loadSessions();
        setConfirmDialog({ type: null, sessionId: null });
        setIsLoading(false);
    };

    const handleRotatePassword = async (sessionId: string) => {
        setIsLoading(true);
        await window.electronAPI.rotatePassword(sessionId);
        await loadSessions();
        setIsLoading(false);
    };

    const handleKickUser = async () => {
        if (!activeSession?.sessionId || !confirmDialog.targetMember) return;
        setIsLoading(true);
        const result = await window.electronAPI.kickUser(activeSession.sessionId, confirmDialog.targetMember.socketId, 'Kicked by owner');
        if (result.success) {
            // toast.success('User kicked');
        } else {
            // toast.error('Failed to kick user');
        }
        setConfirmDialog({ type: null, sessionId: null });
        setIsLoading(false);
    };

    const handleBanUser = async () => {
        if (!activeSession?.sessionId || !confirmDialog.targetMember) return;
        setIsLoading(true);
        const result = await window.electronAPI.banUser(activeSession.sessionId, confirmDialog.targetMember.canonicalUsername, 'Banned by owner', confirmDialog.banScope);
        if (result.success) {
            // toast.success('User banned');
        } else {
            // toast.error('Failed to ban user');
            alert('Failed to ban user');
        }
        setConfirmDialog({ type: null, sessionId: null });
        setIsLoading(false);
    };

    const copyToClipboard = (text: string, type: 'link' | 'pass') => {
        navigator.clipboard.writeText(text);
        if (type === 'link') { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
        else { setCopiedPass(true); setTimeout(() => setCopiedPass(false), 2000); }
    };

    const activeSessionData = sessions.find(s => s.id === activeSession?.sessionId);
    const historySessions = sessions.filter(s => !s.isActive);

    return (
        <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
            {/* Header */}
            <header className="flex-shrink-0 h-11 bg-white border-b border-slate-200 flex items-center px-4" style={{ WebkitAppRegion: 'drag' } as any}>
                <div className="flex items-center gap-3 pl-16">
                    <h1 className="text-sm font-bold text-slate-800">SharedDrop</h1>
                    {activeSession?.active && (
                        <div className="flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[9px] font-bold text-green-600 uppercase">Live</span>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Left: Active Session */}
                <div className="w-[55%] p-4 flex flex-col">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Active Session</div>

                    {activeSession?.active && activeSessionData ? (
                        <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                            {/* Session Info */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                    <Folder size={20} className="text-green-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm text-slate-800 truncate">{activeSessionData.folder_name}</p>
                                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                        <span className="flex items-center gap-1"><Users size={10} /> {activeSessionData.usersInvolved?.length || 0}</span>
                                        <span className="flex items-center gap-1"><MessageCircle size={10} /> {activeSessionData.messageCount}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Credentials */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-slate-50 px-3 py-2 rounded-lg text-xs font-mono text-slate-600 truncate border">
                                        {activeSession.tunnelUrl}
                                    </div>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(activeSession.tunnelUrl!, 'link')}>
                                        {copiedLink ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-slate-50 px-3 py-2 rounded-lg text-lg font-mono tracking-[0.2em] text-center border text-slate-800">
                                        {activeSession.password}
                                    </div>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(activeSession.password!, 'pass')}>
                                        {copiedPass ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                                    </Button>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-2">
                                <Button className="flex-1 h-9 text-xs bg-blue-600 hover:bg-blue-700 rounded-lg" onClick={handleOpenInBrowser}>
                                    <ExternalLink size={14} className="mr-1.5" />
                                    Open in Browser
                                </Button>
                                <Button variant="destructive" className="h-9 px-4 text-xs rounded-lg" onClick={handleStop} disabled={isLoading}>
                                    <Square size={12} className="mr-1.5" />
                                    Stop
                                </Button>
                            </div>
                            <Button variant="outline" className="w-full h-8 text-xs" onClick={() => setShowBans(true)}>
                                <Users size={12} className="mr-1.5" />
                                Manage Users
                            </Button>
                        </div>
                    ) : (
                        <div className="flex-1 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center p-6">
                            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
                                <Folder size={28} className="text-slate-400" />
                            </div>
                            <p className="text-sm font-medium text-slate-600 mb-1">No Active Session</p>
                            <p className="text-xs text-slate-400 mb-4">Select a folder to share</p>
                            <Button className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 rounded-lg" onClick={handleCreateSession} disabled={isLoading}>
                                <Plus size={14} className="mr-1.5" />
                                New Session
                            </Button>
                            {deployError && (
                                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg max-w-[280px]">
                                    <p className="text-xs text-red-600 font-medium">Deploy Failed</p>
                                    <p className="text-[10px] text-red-500 mt-1">{deployError}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeSession?.active && (
                        <div className="flex-1 mt-4 overflow-hidden min-h-0">
                            <SessionRoster
                                members={sessionMembers}
                                onKick={(m) => setConfirmDialog({ type: 'kick', sessionId: activeSession.sessionId!, targetMember: m })}
                                onBan={(m, scope) => setConfirmDialog({ type: 'ban', sessionId: activeSession.sessionId!, targetMember: m, banScope: scope })}
                            />
                        </div>
                    )}
                </div>

                {/* Right: Session History */}
                <div className="w-[45%] border-l border-slate-200 bg-white flex flex-col">
                    <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Session History</div>
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{historySessions.length}</span>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-2 space-y-1">
                            {historySessions.map(session => (
                                <div key={session.id} className="rounded-lg border border-slate-100 overflow-hidden">
                                    {/* Header */}
                                    <button
                                        className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-slate-50 transition-colors"
                                        onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                                    >
                                        {expandedId === session.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                        <Folder size={14} className="text-amber-500" />
                                        <span className="flex-1 text-left text-xs font-medium text-slate-700 truncate">{session.folder_name}</span>
                                        <span className="text-[10px] text-slate-400">{formatDuration(session.total_duration_ms)}</span>
                                    </button>

                                    {/* Expanded Details */}
                                    {expandedId === session.id && (
                                        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-50 bg-slate-50/50">
                                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                <div><span className="text-slate-400">Messages:</span> <span className="font-medium">{session.messageCount}</span></div>
                                                <div><span className="text-slate-400">Users:</span> <span className="font-medium">{session.usersInvolved?.length || 0}</span></div>
                                                <div className="col-span-2"><span className="text-slate-400">Created:</span> <span className="font-medium">{new Date(session.created_at).toLocaleDateString()}</span></div>
                                                {session.usersInvolved && session.usersInvolved.length > 0 && (
                                                    <div className="col-span-2">
                                                        <span className="text-slate-400">Joined:</span>{' '}
                                                        <span className="font-medium">{session.usersInvolved.join(', ')}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-1.5 pt-1">
                                                <Button size="sm" className="h-7 text-[10px] flex-1 bg-green-600 hover:bg-green-700 rounded" onClick={() => handleDeploy(session.id)} disabled={isLoading}>
                                                    <Play size={10} className="mr-1" /> Redeploy
                                                </Button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button size="icon" variant="outline" className="h-7 w-7 rounded">
                                                            <MoreVertical size={12} />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-36">
                                                        <DropdownMenuItem onClick={() => handleRotatePassword(session.id)} className="text-xs">
                                                            <Key size={10} className="mr-2" /> Rotate Password
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setConfirmDialog({ type: 'wipe', sessionId: session.id })} className="text-xs">
                                                            <MessageCircle size={10} className="mr-2" /> Wipe Chat
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => setConfirmDialog({ type: 'delete', sessionId: session.id })} className="text-xs text-red-600">
                                                            <Trash2 size={10} className="mr-2" /> Delete
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {historySessions.length === 0 && (
                                <div className="text-center py-8 text-slate-400">
                                    <Clock size={24} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-xs">No session history yet</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </div>

            {/* Confirmation Dialog */}
            <Dialog open={confirmDialog.type !== null} onOpenChange={() => setConfirmDialog({ type: null, sessionId: null })}>
                <DialogContent className="max-w-[320px] rounded-xl">
                    <DialogHeader>
                        <DialogTitle className="text-base">
                            {confirmDialog.type === 'delete' ? 'Delete Session?'
                                : confirmDialog.type === 'wipe' ? 'Wipe Chat?'
                                    : confirmDialog.type === 'kick' ? 'Kick User?'
                                        : confirmDialog.type === 'ban' ? 'Ban User?'
                                            : 'Confirm Action'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            {confirmDialog.type === 'delete'
                                ? 'This will permanently delete the session and all its chat history.'
                                : confirmDialog.type === 'wipe'
                                    ? 'This will permanently delete all messages in this session.'
                                    : confirmDialog.type === 'kick'
                                        ? `Are you sure you want to kick ${confirmDialog.targetMember?.username}?`
                                        : `Are you sure you want to ${confirmDialog.banScope} ban ${confirmDialog.targetMember?.username}?`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmDialog({ type: null, sessionId: null })} className="h-8 text-xs rounded-lg">
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 text-xs rounded-lg"
                            onClick={() => {
                                if (confirmDialog.type === 'delete' && confirmDialog.sessionId) handleDelete(confirmDialog.sessionId);
                                else if (confirmDialog.type === 'wipe' && confirmDialog.sessionId) handleWipeChat(confirmDialog.sessionId);
                                else if (confirmDialog.type === 'kick') handleKickUser();
                                else if (confirmDialog.type === 'ban') handleBanUser();
                            }}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Processing...' : 'Confirm'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <BannedUsersDialog
                open={showBans}
                onOpenChange={setShowBans}
                sessionId={activeSession?.sessionId || ''}
                onUnban={async (u, s) => {
                    await window.electronAPI.unbanUser(activeSession?.sessionId!, u, s);
                }}
            />

            {/* Footer with version */}
            <footer className="flex-shrink-0 h-6 bg-slate-50 border-t border-slate-200 flex items-center justify-center">
                <span className="text-[10px] text-slate-400">v{appVersion}</span>
            </footer>
        </div>
    );
};

export default OwnerApp;
