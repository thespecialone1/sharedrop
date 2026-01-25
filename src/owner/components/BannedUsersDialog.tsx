import React from 'react';
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Ban, WifiOff, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface BannedUser {
    username: string;
    scope: 'session' | 'global';
    reason?: string;
}

interface BannedUsersDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sessionId: string;
    onUnban: (username: string, scope: 'session' | 'global') => Promise<void>;
}

export const BannedUsersDialog: React.FC<BannedUsersDialogProps> = ({ open, onOpenChange, sessionId, onUnban }) => {
    const [bans, setBans] = React.useState<{ session: string[]; tempKicked: string[]; global: any[] }>({ session: [], tempKicked: [], global: [] });
    const [isLoading, setIsLoading] = React.useState(false);

    React.useEffect(() => {
        if (open) loadBans();
    }, [open]);

    const loadBans = async () => {
        setIsLoading(true);
        const result = await window.electronAPI.getBannedUsers(sessionId);
        if (result.success && result.bans) {
            setBans(result.bans);
        }
        setIsLoading(false);
    };

    const handleUnban = async (username: string, scope: 'session' | 'global') => {
        await onUnban(username, scope);
        loadBans();
    };

    const hasBans = bans.session.length > 0 || bans.global.length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Banned Users</DialogTitle>
                    <DialogDescription>Manage session and global bans.</DialogDescription>
                </DialogHeader>

                <ScrollArea className="h-[300px] pr-4">
                    {!hasBans ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                            <Ban size={32} className="mb-2 opacity-20" />
                            <p className="text-sm">No banned users found</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {bans.session.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Session Bans</h4>
                                    <div className="space-y-2">
                                        {bans.session.map(user => (
                                            <div key={user} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarFallback className="text-[10px] bg-red-100 text-red-600">{user.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-sm font-medium">{user}</span>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-red-50 hover:text-red-600" onClick={() => handleUnban(user, 'session')}>
                                                    Unban
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {bans.global.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Global Bans</h4>
                                    <div className="space-y-2">
                                        {bans.global.map((user: any) => (
                                            <div key={user.username} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarFallback className="text-[10px] bg-slate-200 text-slate-600">{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{user.username}</span>
                                                        <span className="text-[10px] text-slate-400">{user.reason}</span>
                                                    </div>
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-slate-200" onClick={() => handleUnban(user.username, 'global')}>
                                                    Unban
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>

                <div className="flex justify-end pt-2">
                    <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
