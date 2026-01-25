import React from 'react';
import { Mic, MicOff, UserX, Crown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { getPastelColor } from '../utils/color';

interface Participant {
    socketId: string;
    username: string;
    isSpeaking?: boolean;
    isMuted?: boolean;
}

interface ParticipantListProps {
    participants: Participant[];
    hostSocketId: string;
    currentUserId: string;
    isHost: boolean;
    onKick: (socketId: string) => void;
}

const ParticipantList: React.FC<ParticipantListProps> = ({
    participants,
    hostSocketId,
    currentUserId,
    isHost,
    onKick
}) => {
    return (
        <div className="flex flex-row flex-wrap gap-2 w-full px-2">
            {participants.map((p) => {
                const isMe = p.socketId === currentUserId;
                const isParticipantHost = p.socketId === hostSocketId;
                const canKick = isHost && !isMe; // Host can kick others

                return (
                    <div
                        key={p.socketId}
                        className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-surface-2 group transition-colors w-20 relative"
                    >
                        {/* Kick Button (Owner Only) - Top Right Overlay */}
                        {canKick && (
                            <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 bg-bg/80 hover:bg-red-500/10 text-red-500 hover:text-red-600 rounded-full shadow-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onKick(p.socketId);
                                    }}
                                    title="Kick from voice"
                                >
                                    <UserX size={10} />
                                </Button>
                            </div>
                        )}

                        {/* Avatar / Speaking Ring */}
                        <div className={`relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ${p.isSpeaking ? 'ring-2 ring-green-400 ring-offset-2' : ''}`}
                            style={{ backgroundColor: getPastelColor(p.username) }}>
                            <span className="text-sm font-semibold text-text-primary">
                                {p.username.charAt(0).toUpperCase()}
                            </span>
                            {isParticipantHost && (
                                <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-0.5 border border-bg">
                                    <Crown size={10} className="text-white" fill="currentColor" />
                                </div>
                            )}
                        </div>

                        {/* Name Info */}
                        <div className="flex flex-col items-center mt-1.5 w-full">
                            <span className="text-[10px] font-medium text-text-secondary truncate w-full text-center leading-tight">
                                {p.username}
                            </span>
                            {isMe && <span className="text-[9px] text-text-secondary leading-tight">(You)</span>}
                            {p.isSpeaking && (
                                <span className="text-[9px] text-green-600 font-medium animate-pulse mt-0.5">Speaking</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ParticipantList;
