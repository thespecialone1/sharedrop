
import React, { useState, useEffect } from 'react';
import { ViewerToolbar } from './ViewerToolbar';

interface TextViewerProps {
    path: string;
    onClose: () => void;
}

export const TextViewer: React.FC<TextViewerProps> = ({ path, onClose }) => {
    const [content, setContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fontSize, setFontSize] = useState(14);
    const [wordWrap, setWordWrap] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        fetch(`/api/preview?path=${encodeURIComponent(path)}&format=text`)
            .then(async res => {
                if (!res.ok) throw new Error('Failed to load text');
                const text = await res.text();
                // Simple safety check for size already handled by server stream or client limit?
                // For now, assume reasonable size or we just display what we got.
                setContent(text.slice(0, 100000)); // Hard client cap for V1 rendering safety
                if (text.length > 100000) setError('Text truncated (too large)');
                setIsLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setIsLoading(false);
            });
    }, [path]);

    const handleDownload = () => {
        window.open(`/api/file?path=${encodeURIComponent(path)}`);
    };

    return (
        <div className="flex flex-col h-full w-full bg-bg relative">
            <ViewerToolbar
                title={path.split('/').pop() || 'Text Viewer'}
                onClose={onClose}
                onDownload={handleDownload}
                onZoomIn={() => setFontSize(s => Math.min(s + 2, 32))}
                onZoomOut={() => setFontSize(s => Math.max(s - 2, 10))}
                zoomLevel={fontSize / 14}
                onToggleWrap={() => setWordWrap(!wordWrap)}
            />

            <div className="flex-1 overflow-auto pt-16 p-6 bg-surface-2">
                <div className={`max-w-4xl mx-auto bg-bg shadow-sm p-8 min-h-full rounded-lg ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}`}
                    style={{ fontSize: `${fontSize}px`, fontFamily: 'monospace' }}>
                    {isLoading ? (
                        <div className="animate-pulse space-y-2">
                            <div className="h-4 bg-surface-2 rounded w-3/4"></div>
                            <div className="h-4 bg-surface-2 rounded w-1/2"></div>
                            <div className="h-4 bg-surface-2 rounded w-5/6"></div>
                        </div>
                    ) : (
                        <>
                            {content}
                            {error && (
                                <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 rounded border border-yellow-200 text-sm">
                                    {error} - <a href="#" onClick={(e) => { e.preventDefault(); handleDownload(); }} className="underline">Download full file</a>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
