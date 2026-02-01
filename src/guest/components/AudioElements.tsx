import React, { useEffect, useRef } from 'react';

interface AudioElementsProps {
    /** Map of socketId -> MediaStream */
    streams: Map<string, MediaStream>;
}

/**
 * Manages hidden <audio> elements for remote voice streams
 * Each peer gets their own audio element for playback
 */
const AudioElements: React.FC<AudioElementsProps> = ({ streams }) => {
    const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

    useEffect(() => {
        // Attach streams to audio elements
        streams.forEach((stream, socketId) => {
            let audio = audioRefs.current.get(socketId);
            if (!audio) {
                audio = document.createElement('audio');
                audio.autoplay = true;
                audio.setAttribute('playsinline', 'true');
                // Hidden, we only need audio playback
                // Avoid display: none as it blocks playback on some browsers
                audio.style.position = 'fixed';
                audio.style.top = '-10000px';
                audio.style.left = '-10000px';
                audio.style.opacity = '0';
                audio.style.pointerEvents = 'none';

                document.body.appendChild(audio);
                audioRefs.current.set(socketId, audio);
                console.log(`[AudioElements] Created audio element for ${socketId}`);
            }
            if (audio.srcObject !== stream) {
                console.log(`[AudioElements] Attaching stream to ${socketId}`, stream.id);
                audio.srcObject = stream;
                // Try to play (may require user gesture on mobile)
                audio.play()
                    .then(() => console.log(`[AudioElements] Playing ${socketId}`))
                    .catch(e => {
                        console.warn('Audio autoplay blocked:', e);
                    });
            }
        });

        // Clean up removed streams
        audioRefs.current.forEach((audio, socketId) => {
            if (!streams.has(socketId)) {
                audio.srcObject = null;
                audio.remove();
                audioRefs.current.delete(socketId);
            }
        });
    }, [streams]);

    // Cleanup all on unmount
    useEffect(() => {
        return () => {
            audioRefs.current.forEach(audio => {
                audio.srcObject = null;
                audio.remove();
            });
            audioRefs.current.clear();
        };
    }, []);

    // This component renders nothing visible
    return null;
};

export default AudioElements;
