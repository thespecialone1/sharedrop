import React from 'react';
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Phone } from 'lucide-react';

interface VoicePanelProps {
    /** Whether voice room is currently active */
    isActive: boolean;
    /** Whether this user is in the voice room */
    isInVoice: boolean;
    /** Whether this user is the host */
    isHost: boolean;
    /** Number of participants in voice room */
    participantCount: number;
    /** Whether local mic is muted */
    isMuted: boolean;
    /** Start a new voice room */
    onStart: () => void;
    /** Join existing voice room */
    onJoin: () => void;
    /** Leave voice room */
    onLeave: () => void;
    /** Stop voice room (host only) */
    onStop: () => void;
    /** Toggle mute */
    onToggleMute: () => void;
    /** Loading state */
    isLoading?: boolean;
}

/**
 * Compact voice room control panel
 * Shows different states: no room, room active but not joined, in room
 */
const VoicePanel: React.FC<VoicePanelProps> = ({
    isActive,
    isInVoice,
    isHost,
    participantCount,
    isMuted,
    onStart,
    onJoin,
    onLeave,
    onStop,
    onToggleMute,
    isLoading = false
}) => {
    // Not in voice, no active room - show Start button
    if (!isActive && !isInVoice) {
        return (
            <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 rounded-lg border-slate-200 hover:bg-slate-50 text-slate-600"
                onClick={onStart}
                disabled={isLoading}
            >
                <Phone size={14} className="mr-1.5" />
                <span className="text-xs font-medium">Start Voice</span>
            </Button>
        );
    }

    // Room is active but we're not in it - show Join button
    if (isActive && !isInVoice) {
        return (
            <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 rounded-lg border-green-200 bg-green-50 hover:bg-green-100 text-green-700"
                onClick={onJoin}
                disabled={isLoading}
            >
                <Phone size={14} className="mr-1.5" />
                <span className="text-xs font-medium">Join Voice</span>
                <span className="ml-1.5 text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full">
                    {participantCount}
                </span>
            </Button>
        );
    }

    // In voice room - show controls
    return (
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2 py-1">
            {/* Participant count */}
            <span className="text-[10px] text-slate-500 font-medium mr-1">
                {participantCount} in call
            </span>

            {/* Mute toggle */}
            <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 rounded-md ${isMuted ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'hover:bg-slate-200 text-slate-600'}`}
                onClick={onToggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
            >
                {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </Button>

            {/* Leave or Stop button */}
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md bg-red-100 text-red-600 hover:bg-red-200"
                onClick={isHost ? onStop : onLeave}
                title={isHost ? 'Stop Voice Room' : 'Leave Voice'}
            >
                <PhoneOff size={14} />
            </Button>
        </div>
    );
};

export default VoicePanel;
