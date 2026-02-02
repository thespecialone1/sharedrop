import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, CheckCircle, AlertTriangle, XCircle, ClipboardPaste } from 'lucide-react';
import { Socket } from 'socket.io-client';

interface AddedItem {
    input: string;
    resolved: string;
    method: string;
}

interface AmbiguousItem {
    name: string;
    candidates: string[];
    method?: string;
}

interface SkippedDuplicate {
    input: string;
    resolved: string;
}

interface PasteMatchResult {
    success: boolean;
    error?: string;
    added: AddedItem[];
    ambiguous: AmbiguousItem[];
    unmatched: string[];
    skippedDuplicates: SkippedDuplicate[];
}

interface PasteToAlbumDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    socket: Socket | null;
    albumId: string;
    albumName: string;
}

const PasteToAlbumDialog: React.FC<PasteToAlbumDialogProps> = ({
    open,
    onOpenChange,
    socket,
    albumId,
    albumName
}) => {
    const [pastedText, setPastedText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<PasteMatchResult | null>(null);

    const handleMatch = () => {
        if (!socket || !pastedText.trim()) return;

        setIsLoading(true);
        setResult(null);

        socket.emit('album:paste-match', { albumId, pastedText }, (res: PasteMatchResult) => {
            setIsLoading(false);
            setResult(res);
        });
    };

    const handleClose = () => {
        setPastedText('');
        setResult(null);
        onOpenChange(false);
    };

    const hasResults = result && result.success;
    const showInput = !hasResults;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 p-0 overflow-hidden">
                <DialogHeader className="p-4 border-b border-zinc-100 dark:border-zinc-800">
                    <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                        <ClipboardPaste size={18} className="text-blue-500" />
                        Paste Filenames
                    </DialogTitle>
                    <p className="text-sm text-zinc-500">Add files to "{albumName}" by pasting a list of filenames</p>
                </DialogHeader>

                <div className="p-4">
                    {showInput ? (
                        <>
                            <textarea
                                value={pastedText}
                                onChange={(e) => setPastedText(e.target.value)}
                                placeholder={`Paste filenames here, one per line.\n\nExamples:\nIMG_001.jpg\nMG3529\nDSC_0001`}
                                className="w-full h-48 p-3 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                                autoFocus
                            />
                            <p className="text-xs text-zinc-400 mt-2">
                                With extension: exact match required. Without extension: auto-resolve if exactly one file matches.
                            </p>
                        </>
                    ) : (
                        <ScrollArea className="h-64">
                            <div className="space-y-4">
                                {/* Added */}
                                {result.added.length > 0 && (
                                    <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CheckCircle size={16} className="text-green-600 dark:text-green-400" />
                                            <span className="text-sm font-medium text-green-700 dark:text-green-300">
                                                Added ({result.added.length})
                                            </span>
                                        </div>
                                        <ul className="text-xs text-green-600 dark:text-green-400 space-y-1 max-h-32 overflow-y-auto">
                                            {result.added.map((item, i) => (
                                                <li key={i} className="flex flex-col">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono truncate">{item.resolved}</span>
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-200 dark:bg-green-500/20 text-green-700 dark:text-green-300">
                                                            {item.method === 'exact_filename' ? 'exact' :
                                                                item.method === 'exact_basename' ? 'basename' :
                                                                    item.method === 'exact_basename_photo' ? 'photo' :
                                                                        item.method === 'normalized' ? 'fuzzy' : item.method}
                                                        </span>
                                                    </div>
                                                    {item.input.toLowerCase() !== item.resolved.toLowerCase() && (
                                                        <span className="text-[10px] text-green-500 dark:text-green-400/70 ml-1">
                                                            ← {item.input}
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Skipped duplicates */}
                                {result.skippedDuplicates.length > 0 && (
                                    <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <CheckCircle size={16} className="text-zinc-400" />
                                            <span className="text-sm font-medium text-zinc-500">
                                                Already in album ({result.skippedDuplicates.length})
                                            </span>
                                        </div>
                                        <ul className="text-xs text-zinc-400 space-y-0.5 max-h-20 overflow-y-auto">
                                            {result.skippedDuplicates.map((item, i) => (
                                                <li key={i} className="truncate font-mono">
                                                    {typeof item === 'string' ? item : item.resolved}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Ambiguous */}
                                {result.ambiguous.length > 0 && (
                                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
                                            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                                Ambiguous ({result.ambiguous.length})
                                            </span>
                                        </div>
                                        <div className="space-y-2 text-xs">
                                            {result.ambiguous.map((a, i) => (
                                                <div key={i}>
                                                    <span className="font-medium text-amber-600 dark:text-amber-400 font-mono">{a.name}</span>
                                                    <span className="text-amber-500 dark:text-amber-400/70"> matches:</span>
                                                    <ul className="ml-3 mt-0.5 text-amber-500 dark:text-amber-400/70 space-y-0.5">
                                                        {a.candidates.slice(0, 5).map((c, j) => (
                                                            <li key={j} className="truncate font-mono">• {c}</li>
                                                        ))}
                                                        {a.candidates.length > 5 && (
                                                            <li className="text-amber-400">...and {a.candidates.length - 5} more</li>
                                                        )}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Unmatched */}
                                {result.unmatched.length > 0 && (
                                    <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <XCircle size={16} className="text-red-600 dark:text-red-400" />
                                            <span className="text-sm font-medium text-red-700 dark:text-red-300">
                                                Not found ({result.unmatched.length})
                                            </span>
                                        </div>
                                        <ul className="text-xs text-red-500 dark:text-red-400 space-y-0.5 max-h-24 overflow-y-auto">
                                            {result.unmatched.map((f, i) => (
                                                <li key={i} className="truncate font-mono">{f}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Empty result */}
                                {result.added.length === 0 && result.ambiguous.length === 0 && result.unmatched.length === 0 && result.skippedDuplicates.length === 0 && (
                                    <div className="text-center py-8 text-zinc-500">
                                        <p className="text-sm">No filenames to process.</p>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    )}

                    {result?.error && (
                        <div className="mt-3 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
                            {result.error}
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 pt-0 gap-2 sm:gap-2">
                    {showInput ? (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClose}
                                className="h-9 text-sm border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleMatch}
                                disabled={!pastedText.trim() || isLoading}
                                className="h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                                        Matching...
                                    </>
                                ) : (
                                    'Match Files'
                                )}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setResult(null);
                                    setPastedText('');
                                }}
                                className="h-9 text-sm border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Paste More
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleClose}
                                className="h-9 text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                            >
                                Done
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default PasteToAlbumDialog;
