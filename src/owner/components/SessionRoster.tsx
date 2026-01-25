import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent
} from '@/components/ui/dropdown-menu';
import { MoreVertical, UserX, Ban, ShieldAlert, WifiOff, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export interface Member {
    username: string;
    canonicalUsername: string;
    color: string;
    joinedAt: string;
    socketId: string;
}

interface SessionRosterProps {
    members: Member[];
    onKick: (member: Member) => void;
    onBan: (member: Member, scope: 'session' | 'global') => void;
}

export const SessionRoster: React.FC<SessionRosterProps> = ({ members, onKick, onBan }) => {
    const [search, setSearch] = useState('');

    const filteredMembers = members.filter(m =>
        m.username.toLowerCase().includes(search.toLowerCase())
    );

    const getInitials = (name: string) => name.substring(0, 2).toUpperCase();

    const formatTime = (iso: string) => {
        const date = new Date(iso);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex items-center gap-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-1">
                    Who's Live ({members.length})
                </div>
                <div className="relative w-32">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold" />
                    <Input
                        className="h-8 text-xs pl-9 rounded-full bg-white border-none shadow-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-100"
                        placeholder="Search..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                {members.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        <p className="text-xs">No active members</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {filteredMembers.map(member => (
                            <div key={member.socketId} className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors group">
                                <Avatar className="h-8 w-8 border border-white shadow-sm">
                                    <AvatarFallback style={{ backgroundColor: member.color, color: '#334155' }} className="text-[10px] font-medium">
                                        {getInitials(member.username)}
                                    </AvatarFallback>
                                </Avatar>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-700 truncate">{member.username}</span>
                                        {member.username !== member.canonicalUsername && (
                                            <span className="text-[10px] text-slate-400">({member.canonicalUsername})</span>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <span>Joined {formatTime(member.joinedAt)}</span>
                                    </div>
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MoreVertical size={14} className="text-slate-400" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                        <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 mb-1">
                                            Actions for {member.username}
                                        </div>
                                        <DropdownMenuItem onClick={() => onKick(member)} className="text-xs text-orange-600 focus:text-orange-700 focus:bg-orange-50">
                                            <WifiOff size={12} className="mr-2" />
                                            Kick from Session
                                        </DropdownMenuItem>

                                        <DropdownMenuSeparator />

                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger className="text-xs text-red-600 focus:text-red-700 focus:bg-red-50">
                                                <Ban size={12} className="mr-2" />
                                                Ban User
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent className="w-40">
                                                <DropdownMenuItem onClick={() => onBan(member, 'session')} className="text-xs">
                                                    <span>Session Ban</span>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => onBan(member, 'global')} className="text-xs">
                                                    <span>Global Ban</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};
