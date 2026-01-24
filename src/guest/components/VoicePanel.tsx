import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Phone, Lock, Unlock, Users, Keyboard, Settings2 } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MicTestModal } from './MicTestModal';

interface VoicePanelProps {
    isActive: boolean;
    isInVoice: boolean;
    isHost: boolean;
    participantCount: number;
    isMuted: boolean;
    isLocked: boolean;
    isPttEnabled: boolean;
    isSpeaking: boolean;
    onStart: (deviceId?: string) => void;
    onJoin: (deviceId?: string) => void;
    onLeave: () => void;
    onStop: () => void;
    onToggleMute: () => void;
    onToggleLock: () => void;
    onMuteAll: () => void;
    onTogglePtt: () => void;
    isLoading?: boolean;
    isReconnecting?: boolean;
    hostReconnecting?: boolean;
}

const VoicePanel: React.FC<VoicePanelProps> = ({
    isActive,
    isInVoice,
    isHost,
    participantCount,
    isMuted,
    isLocked,
    isPttEnabled,
    isSpeaking,
    onStart,
    onJoin,
    onLeave,
    onStop,
    onToggleMute,
    onToggleLock,
    onMuteAll,
    onTogglePtt,
    isLoading = false,
    isReconnecting = false,
    hostReconnecting = false
}) => {
    // Helper to format button styles
    const buttonBaseClass = "h-8 px-3 rounded-lg text-xs font-semibold shadow-sm transition-all";

    // Not in voice, no active room
    if (!isActive && !isInVoice) {
        return (
            <Button
                variant="outline"
                size="sm"
                className={`${buttonBaseClass} border-slate-200 hover:bg-slate-50 text-slate-700`}
                onClick={() => onStart()}
                disabled={isLoading}
            >
                {isLoading ? (
                    <span className="animate-pulse">Starting...</span>
                ) : (
                    <>
                        <Phone size={14} className="mr-2 text-green-600" />
                        Start Voice
                    </>
                )}
            </Button>
        );
    }

    // Room is active but we're not in it
    if (isActive && !isInVoice) {
        return (
            <Button
                variant="outline"
                size="sm"
                className={`${buttonBaseClass} border-green-200 bg-green-50 hover:bg-green-100 text-green-700 disabled:opacity-50`}
                onClick={() => onJoin()}
                disabled={isLoading || isLocked}
                title={isLocked ? "Room is locked" : "Join voice room"}
            >
                {isLoading ? (
                    <span className="animate-pulse">Joining...</span>
                ) : (
                    <>
                        {isLocked ? <Lock size={14} className="mr-2" /> : <Phone size={14} className="mr-2" />}
                        {isLocked ? 'Locked' : 'Join Voice'}
                        <span className="ml-2 text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-bold">
                            {participantCount}
                        </span>
                    </>
                )}
            </Button>
        );
    }

    // In voice room
    return (
        <div className="flex items-center gap-1 bg-white border border-slate-200 shadow-sm rounded-lg p-0.5 px-1">
            {/* Status Indicators */}
            <div className="hidden sm:flex items-center px-1 border-r border-slate-200 mr-1 gap-2">
                {isLocked && <Lock size={12} className="text-amber-500" />}
                {hostReconnecting ? (
                    <span className="text-[10px] text-amber-600 font-bold animate-pulse">Host Reconnecting...</span>
                ) : isReconnecting ? (
                    <span className="text-[10px] text-amber-600 font-bold animate-pulse">Reconnecting...</span>
                ) : (
                    <div className="flex items-center gap-1">
                        <Users size={12} className="text-slate-400" />
                        <span className="text-[10px] text-slate-600 font-bold">{participantCount}</span>
                    </div>
                )}
            </div>

            {/* PTT Toggle */}
            <Button
                variant={isPttEnabled ? "secondary" : "ghost"}
                size="icon"
                className={`h-7 w-7 rounded-md ${isPttEnabled ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={onTogglePtt}
                title={isPttEnabled ? "Push-to-Talk ON (Hold Space)" : "Turn Push-to-Talk ON"}
            >
                <Keyboard size={14} />
            </Button>

            {/* Mute Toggle (or PTT active indicator) */}
            <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 rounded-md transition-all ${isPttEnabled
                    ? (isSpeaking ? 'bg-green-500 text-white shadow-md' : 'bg-slate-100 text-slate-400')
                    : (isMuted ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'hover:bg-slate-100 text-slate-600')
                    }`}
                onClick={isPttEnabled ? undefined : onToggleMute}
                disabled={isPttEnabled}
                title={isPttEnabled ? (isSpeaking ? 'Transmitting' : 'Press Space to talk') : (isMuted ? 'Unmute' : 'Mute')}
            >
                {isMuted && !isPttEnabled ? (
                    <MicOff size={14} />
                ) : (
                    <div className="relative">
                        <Mic size={14} className={isSpeaking ? 'animate-pulse' : ''} />
                        {isPttEnabled && <span className="absolute -top-1 -right-1 block w-1.5 h-1.5 bg-blue-500 rounded-full border border-white" />}
                    </div>
                )}
            </Button>

            {/* Host Controls Dropdown */}
            {isHost && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-slate-100 text-slate-600">
                            <Settings2 size={14} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[70]">
                        <DropdownMenuItem onSelect={(e) => {
                            e.preventDefault();
                            onToggleLock();
                        }}>
                            {isLocked ? <Unlock className="mr-2 h-3 w-3" /> : <Lock className="mr-2 h-3 w-3" />}
                            {isLocked ? 'Unlock Room' : 'Lock Room'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={(e) => {
                            e.preventDefault();
                            onMuteAll();
                        }}>
                            <MicOff className="mr-2 h-3 w-3" />
                            Mute All Guests
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {/* Leave / Stop */}
            <Button
                variant={isHost ? "destructive" : "ghost"}
                size="icon"
                className={`h-7 w-7 rounded-md ml-1 ${isHost ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
                onClick={isHost ? onStop : onLeave}
                title={isHost ? 'End Voice Room' : 'Leave Voice'}
            >
                <PhoneOff size={14} />
            </Button>
        </div>
    );
};
export default VoicePanel;
