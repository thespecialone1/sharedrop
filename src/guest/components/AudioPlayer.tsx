import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AudioPlayerProps {
    src: string;
    title: string;
    onNext: () => void;
    onPrev: () => void;
    path: string;
}

import { Maximize2 } from 'lucide-react';

export const AudioPlayer = ({ src, title, onNext, onPrev, path }: AudioPlayerProps) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
            audioRef.current.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
        }
    }, [src]); // Re-play on source change

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) audioRef.current.pause();
            else audioRef.current.play();
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setProgress(audioRef.current.currentTime);
            setDuration(audioRef.current.duration || 0);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = Number(e.target.value);
        if (audioRef.current) audioRef.current.currentTime = time;
        setProgress(time);
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!audioRef.current) return;
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    // If SHIFT or focused on slider? 
                    // User requirements: "Left / Right -> seek +/- 5 seconds" (Phase 3)
                    // But also "Left / Right -> Next/Prev" (Phase 1)
                    // We will check if modifier key is pressed OR if player is focused
                    if (e.shiftKey) {
                        audioRef.current.currentTime -= 15;
                    } else {
                        // Standard ArrowLeft is usually navigation in this app context. 
                        // We reserve ArrowLeft/Right for File Navigation as per "Critical Bug" fix.
                        // We use J/L or Shift+Arrows optionally?
                        // User explicitly asked for "Left / Right -> seek" in Phase 3.
                        // But Phase 1 is "Phase 1 - ... Critical Bug ... ArrowLeft -> move to currentIndex - 1".
                        // Navigation takes precedence.
                        // We will ONLY seek if Shift is held, or if this component explicitly captures focus?
                        // Let's implement Shift+Arrow for seek, standard for Nav.
                        // Or just let the overlay controls handle it?
                        return;
                    }
                    break;
            }
        };
        // We rely on parent for global keys. This component only handles internal logic if focused?
        // Actually, we'll let parent handle global Nav. We handle Space for play/pause if this component is active.
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying]);

    return (
        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl p-6 rounded-3xl flex flex-col gap-4 shadow-2xl border border-white/10 text-white">
            <div className="flex items-center gap-4 relative">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                    <Volume2 className="text-white opacity-80" size={32} />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden pr-16">
                    <div className="relative w-full h-6 overflow-hidden">
                        <h3 className={`font-medium text-lg leading-tight whitespace-nowrap absolute top-0 left-0 ${title.length > 25 ? 'animate-marquee' : ''}`}>
                            {title}
                        </h3>
                    </div>
                    <p className="text-white/50 text-sm">Audio Preview</p>
                </div>

                {/* Embedded Actions (Top Right) */}
                <div className="absolute top-0 right-0 flex gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                        onClick={() => window.open(`/api/stream?path=${encodeURIComponent(path)}`)}
                        title="Open Full"
                    >
                        <Maximize2 size={14} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                        onClick={() => window.open(`/api/file?path=${encodeURIComponent(path)}`)}
                        title="Download"
                    >
                        <Download size={14} />
                    </Button>
                </div>
            </div>

            <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={handleTimeUpdate}
                onEnded={onNext}
            />

            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-white/50 font-mono">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={progress}
                    onChange={handleSeek}
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                />
            </div>

            <div className="flex items-center justify-center gap-6 pt-2">
                <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full" onClick={() => audioRef.current && (audioRef.current.currentTime -= 15)}>
                    <span className="text-xs font-bold">-15s</span>
                </Button>
                <Button
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 rounded-full bg-white text-black hover:bg-white/90"
                    onClick={togglePlay}
                >
                    {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-1" />}
                </Button>
                <Button variant="ghost" size="icon" className="hover:bg-white/10 rounded-full" onClick={() => audioRef.current && (audioRef.current.currentTime += 15)}>
                    <span className="text-xs font-bold">+15s</span>
                </Button>
            </div>
        </div>
    );
};

const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}
