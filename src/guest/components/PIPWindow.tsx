import React, { useState, useRef, useEffect } from 'react';
import { useCallTimer } from '../hooks/useCallTimer';
import { X, Mic, MicOff, Video, VideoOff, Maximize2, Minimize2, GripHorizontal, PhoneOff } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { VideoGrid } from './VideoGrid';

interface PIPWindowProps {
    isActive: boolean;
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    participants: { socketId: string, username: string }[];
    isMuted: boolean;
    isCameraOff: boolean;
    onToggleMute: () => void;
    onToggleCamera: () => void;
    onLeave: () => void;
}

export const PIPWindow = ({
    isActive,
    localStream,
    remoteStreams,
    participants,
    isMuted,
    isCameraOff,
    onToggleMute,
    onToggleCamera,
    onLeave
}: PIPWindowProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const duration = useCallTimer(isActive);
    const [position, setPosition] = useState({ x: 20, y: 20 });
    const [size, setSize] = useState({ width: 320, height: 450 }); // Default vertical-ish aspect
    const dragRef = useRef<{ startX: number, startY: number, startLeft: number, startTop: number } | null>(null);
    const resizeRef = useRef<{ startX: number, startY: number, startWidth: number, startHeight: number } | null>(null);

    if (!isActive) return null;

    const handleMouseDown = (e: React.MouseEvent) => {
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startLeft: position.x,
            startTop: position.y
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (dragRef.current) {
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            // Allow dragging anywhere on screen
            const maxX = window.innerWidth - size.width;
            const maxY = window.innerHeight - size.height;
            setPosition({
                x: Math.min(Math.max(0, dragRef.current.startLeft + dx), maxX),
                y: Math.min(Math.max(0, dragRef.current.startTop + dy), maxY)
            });
        }
        if (resizeRef.current) {
            const dx = e.clientX - resizeRef.current.startX;
            const dy = e.clientY - resizeRef.current.startY;
            setSize({
                width: Math.max(280, resizeRef.current.startWidth + dx),
                height: Math.max(200, resizeRef.current.startHeight + dy)
            });
        }
    };

    const handleMouseUp = () => {
        dragRef.current = null;
        resizeRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    const handleResizeStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        resizeRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startWidth: size.width,
            startHeight: size.height
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div
            className={`
                fixed z-[100] bg-slate-900 border border-slate-700 shadow-2xl rounded-xl overflow-hidden flex flex-col
                ${isExpanded ? 'inset-0 w-full h-full rounded-none z-[200]' : 'transition-all duration-200'}
            `}
            style={!isExpanded ? {
                top: position.y,
                left: position.x,
                width: `${size.width}px`,
                height: `${size.height}px`
            } : {}}
        >
            {/* Resize Handle (Desktop Only, Non-Expanded) */}
            {!isExpanded && (
                <div
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-50 hover:bg-white/10 rounded-tl"
                    onMouseDown={handleResizeStart}
                />
            )}

            {/* Header / Drag Handle */}
            <div
                className={`h-10 bg-slate-800 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing ${isExpanded ? 'cursor-default' : ''}`}
                onMouseDown={!isExpanded ? handleMouseDown : undefined}
            >
                <div className="flex items-center gap-2 text-slate-300">
                    <GripHorizontal size={16} className={isExpanded ? 'hidden' : 'block'} />
                    <span className="text-sm font-medium">Video Call ({participants.length + 1})</span>
                    <span className="text-xs text-slate-500 font-mono ml-1">{duration}</span>
                </div>
                <div className="flex items-center gap-2" onMouseDown={e => e.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-white"
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? "Minimize" : "Full Screen"}
                    >
                        {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-400"
                        onClick={onLeave}
                    >
                        <X size={16} />
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 relative bg-black">
                <VideoGrid
                    localStream={localStream}
                    remoteStreams={remoteStreams}
                    participants={participants}
                    isMuted={isMuted}
                    isCameraOff={isCameraOff}
                />
            </div>

            {/* Floating Controls Overlay (bottom center) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/90 backdrop-blur-md rounded-full px-5 py-2 shadow-xl border border-slate-700/50">
                <Button
                    variant="ghost"
                    size="icon"
                    className={`h-10 w-10 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                    onClick={onToggleMute}
                >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className={`h-10 w-10 rounded-full transition-all ${isCameraOff ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                    onClick={onToggleCamera}
                >
                    {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20"
                    onClick={onLeave}
                >
                    <PhoneOff size={20} />{/* Changed X to PhoneOff for clear semantic */}
                </Button>
            </div>
        </div>
    );
};
