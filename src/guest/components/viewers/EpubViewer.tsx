
import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Epub from 'epubjs';
import { ViewerToolbar } from './ViewerToolbar'; // Adjust path as needed
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface EpubViewerProps {
    path: string; // The original path (e.g., .mobi or .epub)
    previewUrl?: string; // Optional direct URL if already known
    onClose: () => void;
}

export const EpubViewer: React.FC<EpubViewerProps> = ({ path, previewUrl, onClose }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fontSize, setFontSize] = useState(100);
    const [hasPrev, setHasPrev] = useState(false);
    const [hasNext, setHasNext] = useState(false);

    // Server might need time to convert MOBI->EPUB
    // We poll `previewUrl` (or construct it) until 200 OK.
    const [readyUrl, setReadyUrl] = useState<string | null>(null);

    const renditionRef = useRef<any>(null);
    const bookRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 1. Resolve URL (Handle Conversion)
    useEffect(() => {
        let isMounted = true;
        const targetUrl = previewUrl || `/api/preview?path=${encodeURIComponent(path)}&format=epub`; // force epub format

        const checkStatus = async () => {
            try {
                const res = await fetch(targetUrl, { method: 'HEAD' });
                if (res.status === 200) {
                    if (isMounted) setReadyUrl(targetUrl);
                } else if (res.status === 202) {
                    // Converting... poll
                    if (isMounted) setTimeout(checkStatus, 1000);
                } else if (res.status === 501) {
                    if (isMounted) throw new Error('Conversion unavailable (Calibre missing)');
                } else {
                    if (isMounted) throw new Error('Failed to load book');
                }
            } catch (e: any) {
                if (isMounted) setError(e.message);
                setIsLoading(false);
            }
        };

        checkStatus();
        return () => { isMounted = false; };
    }, [path, previewUrl]);

    // 2. Initialize ePub.js
    useEffect(() => {
        if (!readyUrl || !containerRef.current) return;

        let book: any = null;
        let mounted = true;

        const loadBook = async () => {
            try {
                // Fetch as ArrayBuffer to avoid URL resolution/CORS issues with epub.js
                // and to prevent it from treating the URL as a folder path
                const response = await fetch(readyUrl);
                if (!response.ok) throw new Error('Failed to fetch EPUB file');
                const buffer = await response.arrayBuffer();

                if (!mounted) return;

                book = Epub(buffer);
                bookRef.current = book;

                const rendition = book.renderTo(containerRef.current, {
                    width: '100%',
                    height: '100%',
                    flow: 'paginated', // or 'scrolled'
                    allowScriptedContent: false
                });
                renditionRef.current = rendition;

                await rendition.display();
                setIsLoading(false);
                updateNavState();

                rendition.on('relocated', (location: any) => {
                    updateNavState();
                });
            } catch (e) {
                console.error(e);
                if (mounted) {
                    setError('Error loading book. ' + (e as any).message);
                    setIsLoading(false);
                }
            }
        };

        loadBook();

        return () => {
            mounted = false;
            if (book) {
                book.destroy();
            }
        };
    }, [readyUrl]);

    const updateNavState = () => {
        if (!bookRef.current || !renditionRef.current) return;
        // Simple check
        // Ideally we check against package spine
        setHasNext(true);
        setHasPrev(true);
    };

    const handleNext = () => renditionRef.current?.next();
    const handlePrev = () => renditionRef.current?.prev();

    const changeFontSize = (delta: number) => {
        const newSize = Math.max(80, Math.min(200, fontSize + delta));
        setFontSize(newSize);
        if (renditionRef.current) {
            renditionRef.current.themes.fontSize(`${newSize}%`);
        }
    };

    const handleDownload = () => window.open(`/api/file?path=${encodeURIComponent(path)}`);

    return (
        <div className="flex flex-col h-full w-full bg-bg relative">
            <ViewerToolbar
                title={path.split('/').pop() || 'Ebook Reader'}
                onClose={onClose}
                onDownload={handleDownload}
                onZoomIn={() => changeFontSize(10)}
                onZoomOut={() => changeFontSize(-10)}
                zoomLevel={fontSize / 100}
            />

            <div className="flex-1 relative pt-16 bg-surface-2">
                {/* Main Book Container */}
                <div ref={containerRef} className="h-full w-full max-w-4xl mx-auto shadow-md bg-white" />

                {/* Loading / Error States */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-slate-400" size={32} />
                            <p className="text-slate-500 font-medium">
                                {readyUrl ? 'Rendering book...' : 'Converting format...'}
                            </p>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
                        <div className="text-center p-6 max-w-md">
                            <p className="text-red-500 mb-4">{error}</p>
                            <Button onClick={handleDownload}>Download Original File</Button>
                        </div>
                    </div>
                )}

                {/* Navigation Overlay (Side Arrows) */}
                {!isLoading && !error && (
                    <>
                        <button
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/5 hover:bg-black/10 transition-colors"
                            onClick={handlePrev}
                        >
                            <ChevronLeft size={32} className="text-slate-400" />
                        </button>
                        <button
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/5 hover:bg-black/10 transition-colors"
                            onClick={handleNext}
                        >
                            <ChevronRight size={32} className="text-slate-400" />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
