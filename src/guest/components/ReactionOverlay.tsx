import React, { useEffect, useRef } from 'react';
import { Heart, ThumbsUp, Eye, Smile, Star } from 'lucide-react';

interface ComponentProps {
    lastReaction: {
        username: string;
        color: string;
        type: string;
        socketId: string;
        timestamp: number;
    } | null;
}

interface Particle {
    element: HTMLDivElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number; // 0 to 1
    decay: number;
    scale: number;
    rotation: number;
    vRotation: number;
}

const ICONS: Record<string, any> = {
    heart: Heart,
    like: ThumbsUp,
    eyes: Eye,
    smile: Smile,
    star: Star
};

export const ReactionOverlay: React.FC<ComponentProps & { isSidebarOpen: boolean }> = ({ lastReaction, isSidebarOpen }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const particlesRef = useRef<Particle[]>([]);
    const frameIdRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number>(0);

    // ... (animate function remains the same, omitted for brevity if unchanged, but since I'm replacing a block, I need to be careful) 
    // Wait, I should replace the component definition to include prop type
    // AND the useEffect spawn logic.
    // The previous steps are unchanged.

    // Animation Loop
    const animate = (time: number) => {
        if (!lastTimestampRef.current) lastTimestampRef.current = time;
        lastTimestampRef.current = time;

        const container = containerRef.current;
        if (!container) return;

        // Update particles
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
            const p = particlesRef.current[i];

            // Physics
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // Gravity-ish
            p.rotation += p.vRotation;
            p.life -= p.decay;

            // Render
            if (p.life <= 0) {
                p.element.remove();
                particlesRef.current.splice(i, 1);
            } else {
                const opacity = p.life < 0.2 ? p.life * 5 : 1;
                const scale = p.scale * (p.life < 0.1 ? p.life * 10 : 1);
                p.element.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rotation}deg) scale(${scale})`;
                p.element.style.opacity = opacity.toString();
            }
        }

        if (particlesRef.current.length > 0) {
            frameIdRef.current = requestAnimationFrame(animate);
        } else {
            frameIdRef.current = null;
        }
    };

    const startLoop = () => {
        if (!frameIdRef.current) {
            lastTimestampRef.current = 0;
            frameIdRef.current = requestAnimationFrame(animate);
        }
    };

    // Spawn Effect
    useEffect(() => {
        if (!lastReaction || !containerRef.current) return;

        const isMascot = lastReaction.type.startsWith('mascot-');

        // Configuration based on type
        const count = isMascot ? 1 : (8 + Math.random() * 5);

        // Positioning Logic
        const isDesktop = window.innerWidth >= 640; // sm breakpoint
        let startX = window.innerWidth / 2;

        if (isDesktop && isSidebarOpen) {
            startX = 180 + (Math.random() * 100 - 50);
        } else {
            startX = window.innerWidth / 2 + (Math.random() * 200 - 100);
        }

        // For single mascot, center it more precisely
        if (isMascot) {
            startX = isDesktop && isSidebarOpen ? 180 : window.innerWidth / 2;
        }

        const startY = window.innerHeight - 80;

        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = `absolute pointer-events-none drop-shadow-md`;

            // Particle State defaults
            let scale = 0.5 + Math.random() * 1;
            let rotation = Math.random() * 360;
            let vRotation = (Math.random() - 0.5) * 10;
            let speed = 5 + Math.random() * 8;
            let angle = -Math.PI / 2 + (Math.random() * 1 - 0.5); // Upwards spread
            let life = 1.0;
            let vx = Math.cos(angle) * speed * 0.5;
            let vy = -speed; // Up

            if (isMascot) {
                // Mascot specific configuration
                const imageName = lastReaction.type;
                const img = document.createElement('img');
                // Use larger size 128px for better visibility
                img.src = `/branding/${imageName}-128.png`;
                img.className = "w-full h-full object-contain";
                el.appendChild(img);

                // Fixed large size
                const baseSize = 150;
                el.style.width = `${baseSize}px`;
                el.style.height = `${baseSize}px`;

                // Reset physics for a "pop up" or "float" effect without chaos
                scale = 1.0; // Start normal
                rotation = 0; // No rotation
                vRotation = 0; // No spin

                // Move straight up, slower
                vx = 0;
                vy = -4; // Slower constant rise
                life = 1.5; // Longer life

                // Tweaking decay to match life
                // We handle decay in the loop as life -= decay
            } else {
                // Emoji Logic
                el.className += " text-white";

                const EMOJI_MAP: Record<string, string> = {
                    heart: '❤️',
                    like: '👍',
                    eyes: '👀',
                    smile: '😄',
                    star: '⭐'
                };
                el.textContent = EMOJI_MAP[lastReaction.type] || '✨';
                el.style.fontSize = `${20 + Math.random() * 20}px`;
            }

            el.style.left = '0px';
            el.style.top = '0px';
            el.style.position = 'absolute';
            el.style.willChange = 'transform, opacity';
            el.style.zIndex = '9999';

            containerRef.current.appendChild(el);

            particlesRef.current.push({
                element: el,
                x: startX,
                y: startY,
                vx,
                vy,
                life,
                decay: isMascot ? 0.015 : (0.01 + Math.random() * 0.02),
                scale,
                rotation,
                vRotation
            });
        }

        startLoop();

    }, [lastReaction]); // Removed isSidebarOpen to prevent re-triggering on sidebar toggle

    // Cleanup
    useEffect(() => {
        return () => {
            if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
            particlesRef.current.forEach(p => p.element.remove());
            particlesRef.current = [];
        };
    }, []);

    return <div ref={containerRef} className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" />;
};
