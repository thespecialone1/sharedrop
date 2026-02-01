import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Folder, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import type { Album } from '@/types/electron';
import { Socket } from 'socket.io-client';

interface AddToAlbumDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    socket: Socket | null;
    selectedPaths: string[];
    onClearSelection: () => void;
}

const AddToAlbumDialog: React.FC<AddToAlbumDialogProps> = ({
    open,
    onOpenChange,
    socket,
    selectedPaths,
    onClearSelection
}) => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [addingToId, setAddingToId] = useState<string | null>(null);
    const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Fetch albums when dialog opens
    useEffect(() => {
        if (open && socket) {
            setIsLoading(true);
            socket.emit('album:get-sync'); // Request fresh data

            const handleSync = (data: Album[]) => {
                // Filter only approved albums that are not locked ideally? 
                // User might want to see locked albums but disabled.
                setAlbums(data);
                setIsLoading(false);
            };

            socket.on('album:sync', handleSync);
            return () => {
                socket.off('album:sync', handleSync);
            };
        }
    }, [open, socket]);

    const handleAdd = (album: Album) => {
        if (album.locked) return;
        setAddingToId(album.id);
        setResultMessage(null);

        // Check duplicates locally first
        const existingPaths = new Set(album.items?.map(i => i.file_path) || []);
        const newPaths = selectedPaths.filter(p => !existingPaths.has(p));
        const duplicates = selectedPaths.length - newPaths.length;

        if (newPaths.length === 0) {
            setResultMessage({ type: 'error', text: `All ${selectedPaths.length} items are already in "${album.name}".` });
            setAddingToId(null);
            return;
        }

        let completed = 0;
        let errors = 0;

        newPaths.forEach(path => {
            socket?.emit('album:item-add', {
                albumId: album.id,
                filePath: path,
                metadata: {}
            }, (res: { success: boolean }) => {
                if (res.success) completed++;
                else errors++;

                if (completed + errors === newPaths.length) {
                    // All done
                    setAddingToId(null);
                    const msg = duplicates > 0
                        ? `Added ${completed} items to "${album.name}" (${duplicates} duplicates skipped).`
                        : `Added ${completed} items to "${album.name}".`;

                    setResultMessage({ type: 'success', text: msg });

                    // Clear selection after short delay or immediately?
                    // User might want to add same items to another album.
                    // But typically "move" logic implies clear.
                    // Let's clear after success.
                    setTimeout(() => {
                        onClearSelection();
                        onOpenChange(false);
                        setResultMessage(null);
                    }, 1500);
                }
            });
        });

        // Trigger sync update
        socket?.emit('album:get-sync');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-2xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 p-0 overflow-hidden">
                <DialogHeader className="p-4 border-b border-zinc-100 dark:border-zinc-800">
                    <DialogTitle className="text-lg font-semibold">Add to Album</DialogTitle>
                    <p className="text-sm text-zinc-500">{selectedPaths.length} items selected</p>
                </DialogHeader>

                <div className="p-4">
                    {resultMessage && (
                        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${resultMessage.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-500/20 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                            }`}>
                            {resultMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            {resultMessage.text}
                        </div>
                    )}

                    <ScrollArea className="h-[300px] pr-2">
                        <div className="space-y-2">
                            {albums.filter(a => a.status === 'approved').map(album => (
                                <button
                                    key={album.id}
                                    disabled={!!album.locked || addingToId !== null}
                                    onClick={() => handleAdd(album)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${album.locked
                                            ? 'opacity-50 bg-zinc-50 border-zinc-100 cursor-not-allowed'
                                            : 'bg-white dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10'
                                        }`}
                                >
                                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                        <Folder size={20} className="text-blue-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{album.name}</span>
                                            {!!album.locked && <Lock size={14} className="text-zinc-400" />}
                                        </div>
                                        <p className="text-xs text-zinc-500">{album.items?.length || 0} items</p>
                                    </div>
                                    {addingToId === album.id && (
                                        <div className="h-4 w-4 rounded-full border-2 border-primary-blue border-t-transparent animate-spin" />
                                    )}
                                </button>
                            ))}

                            {albums.filter(a => a.status === 'approved').length === 0 && (
                                <div className="text-center py-8 text-zinc-500">
                                    <p>No albums available.</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default AddToAlbumDialog;
