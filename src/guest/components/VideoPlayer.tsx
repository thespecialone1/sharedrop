import React, { useRef, useEffect, useCallback } from 'react';
import { Plyr } from 'plyr-react';
import "plyr-react/plyr.css";

interface VideoPlayerProps {
    src: string;
    poster?: string;
    onNext?: () => void;
    onPrev?: () => void;
    onClose?: () => void;
}

export default function SimpleVideoPlayer({ src, poster, onNext, onPrev, onClose }: VideoPlayerProps) {
    const ref = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const player = ref.current?.plyr;
        if (!player) return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                player.togglePlay();
                break;
            case 'ArrowLeft':
                if (e.shiftKey) onPrev?.();
                else player.currentTime = Math.max(0, player.currentTime - 5);
                break;
            case 'ArrowRight':
                if (e.shiftKey) onNext?.();
                else player.currentTime = Math.min(player.duration || 0, player.currentTime + 5);
                break;
            case 'n':
            case 'N':
                e.preventDefault();
                onNext?.();
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                onPrev?.();
                break;
            case 'Escape':
                e.preventDefault();
                onClose?.();
                break;
        }
    }, [onNext, onPrev, onClose]);

    useEffect(() => {
        containerRef.current?.focus();
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div
            ref={containerRef}
            tabIndex={0}
            className="w-full h-full flex items-center justify-center bg-black rounded-md overflow-hidden outline-none"
            style={{ maxHeight: '80vh' }}
        >
            <style>{`
                .plyr--video {
                    height: 100%;
                    max-height: 80vh;
                }
                .plyr--video .plyr__video-wrapper {
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .plyr--video video {
                    object-fit: contain !important;
                    max-height: 80vh !important;
                    width: auto !important;
                    height: auto !important;
                    max-width: 100% !important;
                }
            `}</style>
            <Plyr
                ref={ref}
                source={{
                    type: 'video',
                    sources: [{ src }],
                    poster
                }}
                options={{
                    controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'fullscreen'],
                    autoplay: true,
                    keyboard: { focused: true, global: false },
                    tooltips: { controls: true, seek: true },
                    seekTime: 5,
                    ratio: undefined
                }}
            />
        </div>
    );
}
