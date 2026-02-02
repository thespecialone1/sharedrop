import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Image, Plus, Star, Folder, Check, X, Loader2, ChevronRight, ChevronDown, ClipboardPaste, Download } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import PasteToAlbumDialog from './PasteToAlbumDialog';

interface Album {
    id: string;
    name: string;
    type: string | null;
    status: string;
    locked: number;
    created_by: string;
    items: AlbumItem[];
}

interface AlbumItem {
    id: string;
    album_id: string;
    file_path: string;
    favorite: number;
    note: string;
    cover_role: string;
    added_by: string;
}

interface AlbumPanelProps {
    socket: Socket | null;
    roomId: string;
    username: string;
    selectedPaths: string[];
    onAddToAlbum: (albumId: string, paths: string[]) => void;
    onPreview: (path: string) => void;
    isMobile: boolean;
    onClearSelection?: () => void;
}

const AlbumPanel: React.FC<AlbumPanelProps> = ({
    socket,
    roomId,
    username,
    selectedPaths,
    onAddToAlbum,
    onPreview,
    isMobile,
    onClearSelection
}) => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [showSuggestDialog, setShowSuggestDialog] = useState(false);
    const [suggestName, setSuggestName] = useState('');
    const [suggestType, setSuggestType] = useState('');
    const [collapsedAlbums, setCollapsedAlbums] = useState<Set<string>>(new Set());
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isIdle, setIsIdle] = useState(true);
    const [pasteAlbumId, setPasteAlbumId] = useState<string | null>(null);
    const [pasteAlbumName, setPasteAlbumName] = useState('');

    useEffect(() => {
        if (socket) {
            socket.emit('album:get-sync');

            socket.on('album:sync', (data: Album[]) => {
                const approved = data.filter(a => a.status === 'approved');
                const mySuggested = data.filter(a => a.status === 'suggested' && a.created_by === username);
                setAlbums([...approved, ...mySuggested]);
                setIsLoading(false);
            });
        }

        return () => {
            socket?.off('album:sync');
        };
    }, [socket, username]);

    useEffect(() => {
        if (isDrawerOpen) {
            const timer = setTimeout(() => setIsIdle(true), 2000);
            return () => clearTimeout(timer);
        }
    }, [isDrawerOpen, isIdle]);

    const handleSuggestAlbum = () => {
        if (!suggestName.trim() || !socket) return;
        setIsSuggesting(true);

        socket.emit('album:suggest', { name: suggestName.trim(), type: suggestType.trim() }, (res: { success: boolean }) => {
            if (res.success) {
                setShowSuggestDialog(false);
                setSuggestName('');
                setSuggestType('');
                socket?.emit('album:get-sync');
            }
            setIsSuggesting(false);
        });
    };

    const handleAddToAlbum = (albumId: string) => {
        if (selectedPaths.length === 0) return;
        setSelectedAlbumId(albumId);
        setShowAddDialog(true);
    };

    const confirmAddToAlbum = () => {
        if (!selectedAlbumId || selectedPaths.length === 0) return;

        const targetAlbum = albums.find(a => a.id === selectedAlbumId);
        if (!targetAlbum) return;

        // Check for duplicates
        const existingPaths = new Set(targetAlbum.items.map(i => i.file_path));
        const newPaths = selectedPaths.filter(p => !existingPaths.has(p));
        const duplicates = selectedPaths.length - newPaths.length;

        if (duplicates > 0) {
            alert(`Skipped ${duplicates} duplicate item(s) already in this album.`);
        }

        if (newPaths.length === 0) {
            setShowAddDialog(false);
            return;
        }

        setIsAdding(true);

        newPaths.forEach(path => {
            socket?.emit('album:item-add', {
                albumId: selectedAlbumId,
                filePath: path,
                metadata: {}
            }, (res: { success: boolean }) => {
                if (res.success) {
                    socket?.emit('album:get-sync');
                }
            });
        });

        // Clear selection after adding
        if (onClearSelection) {
            onClearSelection();
        }

        setShowAddDialog(false);
        setIsAdding(false);
    };

    const handleSetCover = (item: AlbumItem, role: 'front' | 'back') => {
        socket?.emit('album:item-update', {
            itemId: item.id,
            updates: { coverRole: role }
        }, () => {
            socket?.emit('album:get-sync');
        });
    };

    const handleToggleFavorite = (item: AlbumItem) => {
        socket?.emit('album:item-update', {
            itemId: item.id,
            updates: { favorite: !item.favorite }
        }, () => {
            socket?.emit('album:get-sync');
        });
    };

    const toggleAlbumCollapse = (albumId: string) => {
        const newCollapsed = new Set(collapsedAlbums);
        if (newCollapsed.has(albumId)) {
            newCollapsed.delete(albumId);
        } else {
            newCollapsed.add(albumId);
        }
        setCollapsedAlbums(newCollapsed);
    };

    const approvedAlbums = albums.filter(a => a.status === 'approved');
    const suggestedAlbums = albums.filter(a => a.status === 'suggested' && a.created_by === username);
    // Calculate total items across all approved albums
    const totalItems = approvedAlbums.reduce((acc, album) => acc + (album.items?.length || 0), 0);

    if (isMobile) {
        return (
            <>
                {/* Mobile FAB */}
                <div className="fixed bottom-6 right-6 z-50">
                    <Button
                        size="lg"
                        className="rounded-full h-14 w-14 shadow-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
                        onClick={() => setIsDrawerOpen(true)}
                    >
                        <Image size={24} className="text-zinc-200" />
                        {totalItems > 0 && (
                            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                                {totalItems}
                            </span>
                        )}
                    </Button>
                </div>

                {/* Mobile Bottom Sheet */}
                {isDrawerOpen && (
                    <div className="fixed inset-0 z-50" onClick={() => setIsDrawerOpen(false)}>
                        <div
                            className="absolute bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl rounded-t-2xl max-h-[70vh] flex flex-col animate-in slide-in-from-bottom duration-300"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Handle */}
                            <div className="flex items-center justify-center p-3 border-b border-zinc-800">
                                <div className="w-12 h-1 bg-zinc-700 rounded-full" />
                            </div>

                            <div className="flex-1 overflow-y-auto p-4">
                                <h3 className="text-lg font-semibold text-zinc-200 mb-4">Albums</h3>

                                {suggestedAlbums.length > 0 && (
                                    <div className="mb-4">
                                        <p className="text-xs font-medium text-amber-500 mb-2">Your Suggestions</p>
                                        {suggestedAlbums.map(album => (
                                            <div key={album.id} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Folder size={14} className="text-amber-500" />
                                                    <span className="text-sm font-medium text-zinc-300">{album.name}</span>
                                                    <span className="text-xs text-zinc-500 ml-auto">Pending</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {approvedAlbums.length === 0 && suggestedAlbums.length === 0 && (
                                    <div className="text-center py-8 text-zinc-500">
                                        <Image size={32} className="mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No albums yet</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="mt-2 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                                            onClick={() => setShowSuggestDialog(true)}
                                        >
                                            <Plus size={14} className="mr-1" />
                                            Suggest Album
                                        </Button>
                                    </div>
                                )}

                                {approvedAlbums.map(album => (
                                    <div key={album.id} className="border border-zinc-800 bg-zinc-800/30 rounded-lg p-3 mb-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <Folder size={16} className="text-blue-500" />
                                                <span className="font-medium text-sm text-zinc-200">{album.name}</span>
                                                {album.locked && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">Locked</span>}
                                            </div>
                                            <span className="text-xs text-zinc-500">{album.items?.length || 0}</span>
                                        </div>

                                        {album.items && album.items.length > 0 && (
                                            <div className="flex gap-1 overflow-x-auto pb-2">
                                                {album.items.slice(0, 10).map(item => (
                                                    <img
                                                        key={item.id}
                                                        src={`/api/preview?path=${encodeURIComponent(item.file_path)}`}
                                                        alt=""
                                                        className="w-12 h-12 rounded object-cover flex-shrink-0"
                                                        onClick={() => onPreview(item.file_path)}
                                                    />
                                                ))}
                                                {album.items.length > 10 && (
                                                    <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">
                                                        +{album.items.length - 10}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {selectedPaths.length > 0 && !album.locked && (
                                            <Button
                                                size="sm"
                                                className="w-full mt-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
                                                onClick={() => handleAddToAlbum(album.id)}
                                            >
                                                <Plus size={14} className="mr-1" />
                                                Add Selected ({selectedPaths.length})
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Suggest Dialog */}
                <Dialog open={showSuggestDialog} onOpenChange={setShowSuggestDialog}>
                    <DialogContent className="max-w-[300px] rounded-xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xl">
                        <DialogHeader>
                            <DialogTitle className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Suggest Album</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Album Name</label>
                                <Input
                                    value={suggestName}
                                    onChange={(e) => setSuggestName(e.target.value)}
                                    placeholder="e.g., Best Shots"
                                    className="h-9 text-xs bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-blue-500"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Type (optional)</label>
                                <Input
                                    value={suggestType}
                                    onChange={(e) => setSuggestType(e.target.value)}
                                    placeholder="e.g., Prints"
                                    className="h-9 text-xs bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-blue-500"
                                />
                            </div>
                        </div>
                        <DialogFooter className="gap-2 sm:gap-2">
                            <Button variant="outline" size="sm" onClick={() => setShowSuggestDialog(false)} className="h-8 text-xs border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSuggestAlbum}
                                disabled={!suggestName.trim() || isSuggesting}
                                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50"
                            >
                                {isSuggesting ? 'Sending...' : 'Send Suggestion'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </>
        );
    }

    // Desktop: Floating trigger + Right drawer
    return (
        <>
            {/* Floating Trigger Button */}
            {/* Floating Trigger Button (FAB) */}
            <div className="fixed bottom-6 right-6 z-40">
                <Button
                    size="icon"
                    className="h-14 w-14 rounded-full shadow-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-all hover:scale-105 active:scale-95"
                    onClick={() => setIsDrawerOpen(true)}
                >
                    <Image size={24} className="stroke-[1.5]" />
                    {totalItems > 0 && (
                        <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold shadow-sm border border-white dark:border-zinc-900">
                            {totalItems}
                        </span>
                    )}
                </Button>
            </div>

            {/* Drawer Overlay */}
            {isDrawerOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setIsDrawerOpen(false)}
                    />

                    {/* Right Drawer */}
                    <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-blue-100 dark:bg-blue-500/20 rounded-md">
                                    <Image size={16} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <span className="font-semibold text-zinc-800 dark:text-zinc-100">Albums</span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-500">({approvedAlbums.length})</span>
                            </div>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setIsDrawerOpen(false)}
                                className="h-8 w-8 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full"
                            >
                                <ChevronRight size={18} className="text-zinc-500 dark:text-zinc-400" />
                            </Button>
                        </div>

                        {/* Quick stats */}
                        <div className="flex-shrink-0 px-5 py-2.5 bg-zinc-50/50 dark:bg-zinc-800/30 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{totalItems} items across all albums</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs text-zinc-400 hover:text-zinc-200"
                                onClick={() => setShowSuggestDialog(true)}
                            >
                                <Plus size={12} className="mr-1" />
                                Suggest
                            </Button>
                        </div>

                        {/* Content */}
                        <ScrollArea className="flex-1 w-full">
                            <div className="p-3 space-y-2 w-full max-w-full overflow-hidden">
                                {/* Selected count */}
                                {selectedPaths.length > 0 && (
                                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 mb-3">
                                        <span className="text-xs text-blue-400">{selectedPaths.length} selected</span>
                                    </div>
                                )}

                                {/* Suggested albums */}
                                {suggestedAlbums.length > 0 && (
                                    <div className="space-y-1 mb-4">
                                        <p className="text-[10px] font-medium text-amber-500 uppercase tracking-wider mb-2">Pending Review</p>
                                        {suggestedAlbums.map(album => (
                                            <div key={album.id} className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3">
                                                <div className="flex items-center gap-2">
                                                    <Folder size={14} className="text-amber-500" />
                                                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">{album.name}</span>
                                                    <span className="text-[10px] text-amber-600 dark:text-amber-500 ml-auto bg-amber-100 dark:bg-amber-500/10 px-1.5 py-0.5 rounded">Pending</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {approvedAlbums.length === 0 && suggestedAlbums.length === 0 && (
                                    <div className="text-center py-8 text-zinc-500">
                                        <Image size={24} className="mx-auto mb-2 opacity-50" />
                                        <p className="text-xs">No albums yet</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="mt-2 text-xs border-zinc-700 text-zinc-400 hover:text-zinc-200"
                                            onClick={() => setShowSuggestDialog(true)}
                                        >
                                            <Plus size={12} className="mr-1" />
                                            Suggest Album
                                        </Button>
                                    </div>
                                )}

                                {approvedAlbums.map(album => (
                                    <div key={album.id} className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 rounded-xl overflow-hidden shadow-sm w-full max-w-full">
                                        <div
                                            className="flex items-center gap-3 px-4 py-3 bg-zinc-50/50 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800/50 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                                            onClick={() => toggleAlbumCollapse(album.id)}
                                        >
                                            <div className="p-1 rounded bg-blue-100/50 dark:bg-blue-500/10">
                                                <Folder size={16} className="text-blue-500" />
                                            </div>
                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{album.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        {!!album.locked && <span className="text-[10px] bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">Locked</span>}
                                                        {collapsedAlbums.has(album.id) ? <ChevronRight size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">{album.items?.length || 0} items</span>
                                                    {album.type && (
                                                        <>
                                                            <span className="text-[10px] text-zinc-300 dark:text-zinc-600">•</span>
                                                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{album.type}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {!collapsedAlbums.has(album.id) && (
                                            <>
                                                {album.items && album.items.length > 0 ? (
                                                    <div className="p-3 overflow-hidden">
                                                        <div className="grid grid-cols-3 gap-2 w-full">
                                                            {album.items.map(item => (
                                                                <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer border border-zinc-100 dark:border-zinc-800" onClick={() => onPreview(item.file_path)}>
                                                                    <img
                                                                        src={`/api/preview?path=${encodeURIComponent(item.file_path)}`}
                                                                        alt=""
                                                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                                    />
                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

                                                                    {!album.locked && (
                                                                        <div
                                                                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-black/40 hover:bg-red-500/80 rounded-full text-white"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setItemToDelete(item.id);
                                                                                setShowDeleteConfirm(true);
                                                                            }}
                                                                        >
                                                                            <X size={12} />
                                                                        </div>
                                                                    )}

                                                                    {item.favorite && (
                                                                        <div className="absolute top-1 right-1 bg-black/30 backdrop-blur-sm p-1 rounded-full">
                                                                            <Star size={8} className="text-amber-400 fill-amber-400" />
                                                                        </div>
                                                                    )}
                                                                    {item.cover_role === 'front' && (
                                                                        <div className="absolute bottom-1 left-1 bg-blue-600/90 text-white text-[8px] px-1.5 py-0.5 rounded font-bold shadow-sm backdrop-blur-sm">
                                                                            COVER
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/50 flex flex-wrap gap-2 justify-between items-center">
                                                            <div className="flex flex-wrap gap-1.5 shrink-0">
                                                                {!album.locked && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setPasteAlbumId(album.id);
                                                                            setPasteAlbumName(album.name);
                                                                        }}
                                                                    >
                                                                        <ClipboardPaste size={14} className="mr-1" />
                                                                        Paste Names
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-7 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        // Trigger download properly to respect Content-Disposition header
                                                                        const link = document.createElement('a');
                                                                        link.href = `/api/albums/${album.id}/download`;
                                                                        link.download = ''; // Let server set the filename
                                                                        document.body.appendChild(link);
                                                                        link.click();
                                                                        document.body.removeChild(link);
                                                                    }}
                                                                >
                                                                    <Download size={14} className="mr-1" />
                                                                    Download
                                                                </Button>
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedAlbumId(album.id);
                                                                    if (selectedPaths.length > 0) {
                                                                        confirmAddToAlbum();
                                                                    } else {
                                                                        alert('Select items from the main list first to add here.');
                                                                    }
                                                                }}
                                                            >
                                                                <Plus size={14} className="mr-1.5" />
                                                                Add Selected ({selectedPaths.length})
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="px-4 py-6 text-center">
                                                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">Empty album</p>
                                                        <div className="flex flex-col gap-1.5 mt-2">
                                                            {!album.locked && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-7 text-xs border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 w-full"
                                                                    onClick={() => {
                                                                        setPasteAlbumId(album.id);
                                                                        setPasteAlbumName(album.name);
                                                                    }}
                                                                >
                                                                    <ClipboardPaste size={12} className="mr-1" />
                                                                    Paste Names
                                                                </Button>
                                                            )}
                                                            {selectedPaths.length > 0 && !album.locked && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-7 text-xs border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-600 w-full"
                                                                    onClick={() => {
                                                                        setSelectedAlbumId(album.id);
                                                                        confirmAddToAlbum();
                                                                    }}
                                                                >
                                                                    <Plus size={12} className="mr-1" />
                                                                    Add Selected
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </>
            )}

            {/* Suggest Dialog (Duplicate block removed in refactor check, assuming it was rendered conditionally elsewhere or just duplicate in file view) */}
            {/* The previous block handled the Suggest Dialog. Now handling Add to Album Dialog */}

            <Dialog open={showSuggestDialog} onOpenChange={setShowSuggestDialog}>
                {/* This block seems to be a duplicate in the original file view or just rendered twice? 
                    Ah, looking at file view, lines 260-300 are inside `if (isMobile)`.
                    Lines 500-540 are inside the desktop return.
                    I need to update BOTH. 
                    Wait, let me check the file content again.
                    Lines 306 starts `return (` for desktop.
                    Yes, there are two dialogs. One for mobile, one for desktop.
                    I should update BOTH.
                */}
                <DialogContent className="max-w-[300px] rounded-xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Suggest Album</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Album Name</label>
                            <Input
                                value={suggestName}
                                onChange={(e) => setSuggestName(e.target.value)}
                                placeholder="e.g., Best Shots"
                                className="h-9 text-xs bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-blue-500"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">Type (optional)</label>
                            <Input
                                value={suggestType}
                                onChange={(e) => setSuggestType(e.target.value)}
                                placeholder="e.g., Prints"
                                className="h-9 text-xs bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus-visible:ring-blue-500"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowSuggestDialog(false)} className="h-8 text-xs border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSuggestAlbum}
                            disabled={!suggestName.trim() || isSuggesting}
                            className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50"
                        >
                            {isSuggesting ? 'Sending...' : 'Send Suggestion'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add to Album Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="max-w-[300px] rounded-xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xl">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Add to Album</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                        {approvedAlbums.map(album => (
                            <button
                                key={album.id}
                                className={`w-full px-3 py-2.5 rounded-lg text-left text-xs flex items-center gap-2 border transition-all ${selectedAlbumId === album.id
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                                    : 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'
                                    }`}
                                onClick={() => setSelectedAlbumId(album.id)}
                            >
                                {selectedAlbumId === album.id ? <Check size={14} className="text-blue-500" /> : <Plus size={14} className="text-zinc-400 dark:text-zinc-500" />}
                                <Folder size={14} className="text-blue-500" />
                                <span className="text-zinc-700 dark:text-zinc-300 font-medium">{album.name}</span>
                            </button>
                        ))}
                    </div>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowAddDialog(false)} className="h-8 text-xs border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={confirmAddToAlbum}
                            disabled={!selectedAlbumId || isAdding}
                            className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50"
                        >
                            {isAdding ? 'Adding...' : 'Add'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent className="max-w-sm rounded-xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                    <DialogHeader>
                        <DialogTitle>Remove Item?</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Are you sure you want to remove this item from the album?
                        </p>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDeleteConfirm(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                                if (itemToDelete) {
                                    socket?.emit('album:item-remove', { itemId: itemToDelete }, () => socket?.emit('album:get-sync'));
                                }
                                setShowDeleteConfirm(false);
                                setItemToDelete(null);
                            }}
                        >
                            Remove
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Paste to Album Dialog */}
            <PasteToAlbumDialog
                open={!!pasteAlbumId}
                onOpenChange={(open) => {
                    if (!open) {
                        setPasteAlbumId(null);
                        setPasteAlbumName('');
                    }
                }}
                socket={socket}
                albumId={pasteAlbumId || ''}
                albumName={pasteAlbumName}
            />
        </>
    );
};

export default AlbumPanel;
