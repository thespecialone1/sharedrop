
import React from 'react';
import { Button } from "@/components/ui/button";
import { Search, ZoomIn, ZoomOut, Download, X, Type, AlignLeft, Info } from 'lucide-react';

interface ViewerToolbarProps {
    onClose: () => void;
    onDownload: () => void;
    title: string;

    // Optional controls
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onToggleTheme?: () => void;
    onSearch?: () => void;
    onToggleWrap?: () => void;

    // Status
    zoomLevel?: number;
}

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
    onClose, onDownload, title,
    onZoomIn, onZoomOut, onToggleTheme, onSearch, onToggleWrap,
    zoomLevel
}) => {
    return (
        <div className="absolute top-0 left-0 right-0 h-16 bg-surface-2/90 border-b border-border-custom backdrop-blur-md flex items-center px-4 justify-between z-50 text-text-primary transition-opacity duration-200">
            <div className="flex items-center gap-4 flex-1 min-w-0">
                <h2 className="text-sm font-medium truncate opacity-90">{title}</h2>
            </div>

            <div className="flex items-center gap-1">
                {onSearch && (
                    <Button variant="ghost" size="icon" onClick={onSearch} className="text-text-secondary hover:text-text-primary hover:bg-surface-1 h-9 w-9">
                        <Search size={18} />
                    </Button>
                )}

                {onZoomIn && onZoomOut && (
                    <div className="flex items-center bg-surface-1 rounded-lg mx-2 border border-border-custom">
                        <Button variant="ghost" size="icon" onClick={onZoomOut} className="text-text-secondary hover:text-text-primary hover:bg-surface-2 h-9 w-9 rounded-r-none">
                            <ZoomOut size={16} />
                        </Button>
                        <span className="text-xs w-12 text-center font-mono text-text-primary">{Math.round((zoomLevel || 1) * 100)}%</span>
                        <Button variant="ghost" size="icon" onClick={onZoomIn} className="text-text-secondary hover:text-text-primary hover:bg-surface-2 h-9 w-9 rounded-l-none">
                            <ZoomIn size={16} />
                        </Button>
                    </div>
                )}

                {onToggleWrap && (
                    <Button variant="ghost" size="icon" onClick={onToggleWrap} className="text-text-secondary hover:text-text-primary hover:bg-surface-1 h-9 w-9" title="Toggle Word Wrap">
                        <AlignLeft size={18} />
                    </Button>
                )}

                {onToggleTheme && (
                    <Button variant="ghost" size="icon" onClick={onToggleTheme} className="text-text-secondary hover:text-text-primary hover:bg-surface-1 h-9 w-9">
                        <Type size={18} />
                    </Button>
                )}

                <div className="w-px h-6 bg-border-custom mx-2" />

                <Button variant="ghost" size="icon" onClick={onDownload} className="text-text-secondary hover:text-text-primary hover:bg-surface-1 h-9 w-9" title="Download">
                    <Download size={18} />
                </Button>

                <Button variant="ghost" size="icon" onClick={onClose} className="text-text-secondary hover:text-text-primary hover:bg-surface-1 h-9 w-9 ml-2" title="Close">
                    <X size={20} />
                </Button>
            </div>
        </div>
    );
};
