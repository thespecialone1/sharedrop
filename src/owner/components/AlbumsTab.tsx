import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Download, Lock, Unlock, Trash2, Check, X, Image, Users, Folder, Cloud } from 'lucide-react';
import type { Album, Session } from '@/types/electron';

interface AlbumsTabProps {
    sessionId: string | null;
    activeSession: { id?: string; sessionId?: string } | null;
    allSessions: Session[];
}

const AlbumsTab: React.FC<AlbumsTabProps> = ({ sessionId, activeSession, allSessions }) => {
    const [albums, setAlbums] = useState<Album[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newAlbumName, setNewAlbumName] = useState('');
    const [newAlbumType, setNewAlbumType] = useState('');
    const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);
    const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessionId);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [serverPort, setServerPort] = useState<number | null>(null);

    // sessionId prop is the active session ID (from activeSession?.sessionId)
    // activeSession?.sessionId should match sessionId when truly active
    const isActiveSession = sessionId && (activeSession?.sessionId === sessionId || activeSession?.id === sessionId);

    useEffect(() => {
        if (selectedSessionId) {
            loadAlbums(selectedSessionId);
        } else {
            setAlbums([]);
        }

        // Fetch server port for previews
        window.electronAPI.getServerPort().then((res: any) => {
            if (res.success) setServerPort(res.port);
        });

        // Listen for album updates (sync)
        const cleanup = window.electronAPI.onAlbumUpdate(() => {
            console.log('Received album update, reloading...');
            if (selectedSessionId) loadAlbums(selectedSessionId);
        });

        return () => {
            if (cleanup) cleanup();
        };
    }, [selectedSessionId]);

    const loadAlbums = async (sessId: string) => {
        if (!sessId) return;
        setIsLoading(true);
        try {
            const result = await window.electronAPI.getAlbums(sessId);
            if (result.success) {
                setAlbums(result.albums || []);
            }
        } catch (e) {
            console.error('Failed to load albums:', e);
        }
        setIsLoading(false);
    };

    const handleCreateAlbum = async () => {
        console.log('handleCreateAlbum triggered', { sessionId, newAlbumName, newAlbumType });
        if (!sessionId || !newAlbumName.trim()) {
            console.warn('Missing sessionId or album name');
            return;
        }
        setIsLoading(true);
        try {
            console.log('Invoking electronAPI.createAlbum...');
            const result = await window.electronAPI.createAlbum(sessionId, newAlbumName.trim(), newAlbumType.trim());
            console.log('electronAPI.createAlbum result:', result);

            if (result.success) {
                console.log('Album created successfully, reloading list...');
                await loadAlbums(sessionId);
                setShowCreateDialog(false);
                setNewAlbumName('');
                setNewAlbumType('');
            } else {
                console.error('Create album failed:', result.error);
                alert(`Error creating album: ${result.error}`);
            }
        } catch (e: any) {
            console.error('Failed to create album (exception):', e);
            alert(`Exception creating album: ${e.message || e}`);
        }
        setIsLoading(false);
    };

    const handleApproveAlbum = async (albumId: string) => {
        if (!sessionId) return;
        try {
            await window.electronAPI.approveAlbum(sessionId, albumId);
            await loadAlbums(sessionId);
        } catch (e) {
            console.error('Failed to approve album:', e);
        }
    };

    const handleLockAlbum = async (album: Album) => {
        if (!sessionId) return;
        try {
            await window.electronAPI.lockAlbum(sessionId, album.id, !album.locked);
            await loadAlbums(sessionId);
        } catch (e) {
            console.error('Failed to lock album:', e);
        }
    };

    const handleDeleteAlbum = async (albumId: string) => {
        if (!sessionId) return;
        try {
            await window.electronAPI.deleteAlbum(sessionId, albumId);
            await loadAlbums(sessionId);
            setSelectedAlbum(null);
        } catch (e) {
            console.error('Failed to delete album:', e);
        }
    };

    const handleExportAlbums = async () => {
        if (!sessionId) return;
        try {
            const result = await window.electronAPI.exportAlbums(sessionId);
            if (result.success) {
                const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `albums-${sessionId}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.error('Failed to export albums:', e);
        }
    };

    const approvedAlbums = albums.filter(a => a.status === 'approved');
    const suggestedAlbums = albums.filter(a => a.status === 'suggested');

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Albums</span>
                    <Select value={selectedSessionId || ''} onValueChange={setSelectedSessionId}>
                        <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                            <SelectValue placeholder="Select session" />
                        </SelectTrigger>
                        <SelectContent>
                            {allSessions.map(sess => (
                                <SelectItem key={sess.id} value={sess.id}>
                                    <div className="flex items-center gap-2">
                                        {sess.id === sessionId && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                                        <span className="truncate">{sess.folder_name}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-2">
                    {albums.length > 0 && sessionId === selectedSessionId && (
                        <Button size="sm" variant="outline" onClick={handleExportAlbums} className="h-7 text-xs">
                            <Download size={12} className="mr-1" />
                            Export
                        </Button>
                    )}
                    <Button
                        size="sm"
                        onClick={() => setShowCreateDialog(true)}
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                        disabled={!isActiveSession}
                    >
                        <Plus size={12} className="mr-1" />
                        New Album
                    </Button>
                </div>
            </div>

            {/* Session indicator */}
            {selectedSessionId && selectedSessionId !== sessionId && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                    <Folder size={12} className="text-amber-600" />
                    <span className="text-xs text-amber-700">
                        Viewing albums from: {allSessions.find(s => s.id === selectedSessionId)?.folder_name}
                    </span>
                    {!isActiveSession && (
                        <span className="text-[10px] text-amber-500 ml-auto">Deploy session to sync changes</span>
                    )}
                </div>
            )}

            {/* Content */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                    {!selectedSessionId ? (
                        <div className="text-center py-12 text-slate-400">
                            <Image size={32} className="mx-auto mb-3 opacity-50" />
                            <p className="text-sm">Select a session to view albums</p>
                        </div>
                    ) : isLoading ? (
                        <div className="text-center py-12 text-slate-400">
                            <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-xs">Loading albums...</p>
                        </div>
                    ) : suggestedAlbums.length > 0 ? (
                        <div className="space-y-2">
                            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                                Pending Approval ({suggestedAlbums.length})
                            </div>
                            {suggestedAlbums.map(album => (
                                <div key={album.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-slate-800">{album.name}</p>
                                            <p className="text-xs text-slate-500">Suggested by {album.created_by}</p>
                                        </div>
                                        {isActiveSession ? (
                                            <div className="flex items-center gap-2">
                                                <Button size="sm" variant="outline" onClick={() => handleApproveAlbum(album.id)} className="h-7 text-xs">
                                                    <Check size={12} className="mr-1" />
                                                    Approve
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => handleDeleteAlbum(album.id)} className="h-7 w-7 p-0 text-red-500">
                                                    <X size={14} />
                                                </Button>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                                                {isActiveSession ? '' : 'Deploy to approve'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {approvedAlbums.length === 0 && suggestedAlbums.length === 0 && selectedSessionId && (
                        <div className="text-center py-12 text-slate-400">
                            <Image size={32} className="mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No albums in this session</p>
                            {isActiveSession && (
                                <p className="text-xs mt-1">Create an album to organize client selections</p>
                            )}
                        </div>
                    )}

                    {approvedAlbums.map(album => (
                        <div key={album.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <button
                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
                                onClick={() => setExpandedAlbum(expandedAlbum === album.id ? null : album.id)}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-800 truncate">{album.name}</span>
                                        {/* Status Icons */}
                                        <div className="flex items-center gap-1">
                                            {/* Sync Indicator */}
                                            <Cloud size={12} className="text-green-500" />

                                            {/* Lock Status */}
                                            {!!album.locked && (
                                                <Lock size={12} className="text-amber-500" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                        <span className="flex items-center gap-1">
                                            <Image size={10} /> {album.items?.length || 0} items
                                        </span>
                                        {album.type && (
                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded">{album.type}</span>
                                        )}
                                    </div>
                                </div>
                                {isActiveSession && (
                                    <div className="flex items-center gap-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleLockAlbum(album);
                                            }}
                                            className="h-8 w-8 p-0"
                                        >
                                            {album.locked ? <Lock size={14} className="text-amber-500" /> : <Unlock size={14} className="text-slate-400" />}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedAlbum(album);
                                            }}
                                            className="h-8 text-xs"
                                        >
                                            Manage
                                        </Button>
                                    </div>
                                )}
                            </button>

                            {expandedAlbum === album.id && album.items && album.items.length > 0 && (
                                <div className="border-t border-slate-100 bg-slate-50 p-3">
                                    <div className="grid grid-cols-4 gap-2">
                                        {album.items.map(item => (
                                            <div
                                                key={item.id}
                                                className="relative aspect-square bg-slate-200 rounded-lg overflow-hidden group cursor-pointer"
                                                onClick={() => setPreviewImage(item.file_path)}
                                            >
                                                <img
                                                    src={serverPort ? `http://127.0.0.1:${serverPort}/api/preview?path=${encodeURIComponent(item.file_path)}` : ''}
                                                    alt=""
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                />
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                                {item.cover_role === 'front' && (
                                                    <div className="absolute top-1 left-1 bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                                                        FRONT
                                                    </div>
                                                )}
                                                {item.cover_role === 'back' && (
                                                    <div className="absolute top-1 left-1 bg-slate-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                                                        BACK
                                                    </div>
                                                )}
                                                {item.favorite && (
                                                    <div className="absolute top-1 right-1">
                                                        <div className="w-2 h-2 bg-amber-400 rounded-full" />
                                                    </div>
                                                )}
                                                {item.note && (
                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <span className="text-[10px] text-white text-center px-2 line-clamp-2">
                                                            {item.note}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </ScrollArea>

            {/* Create Album Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent className="max-w-[320px] rounded-xl">
                    <DialogHeader>
                        <DialogTitle className="text-base">Create Album</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Album Name</label>
                            <Input
                                value={newAlbumName}
                                onChange={(e) => setNewAlbumName(e.target.value)}
                                placeholder="e.g., Bride Side, Prints"
                                className="h-9"
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-slate-600 mb-1.5 block">Type (optional)</label>
                            <Input
                                value={newAlbumType}
                                onChange={(e) => setNewAlbumType(e.target.value)}
                                placeholder="e.g., Event, Print Product"
                                className="h-9"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(false)} className="h-8 text-xs">
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleCreateAlbum}
                            disabled={!newAlbumName.trim() || isLoading}
                            className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                        >
                            {isLoading ? 'Creating...' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Album Detail Dialog */}
            <Dialog open={!!selectedAlbum} onOpenChange={() => setSelectedAlbum(null)}>
                <DialogContent className="max-w-[500px] rounded-xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-base">{selectedAlbum?.name}</DialogTitle>
                            {isActiveSession && selectedAlbum && (
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => selectedAlbum && handleLockAlbum(selectedAlbum)}
                                        className="h-7 text-xs"
                                    >
                                        {selectedAlbum?.locked ? <Lock size={12} className="mr-1" /> : <Unlock size={12} className="mr-1" />}
                                        {selectedAlbum?.locked ? 'Unlock' : 'Lock'}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => selectedAlbum && handleDeleteAlbum(selectedAlbum.id)}
                                        className="h-7 text-xs text-red-500 hover:text-red-600"
                                    >
                                        <Trash2 size={12} className="mr-1" />
                                        Delete
                                    </Button>
                                </div>
                            )}
                        </div>
                    </DialogHeader>
                    <ScrollArea className="flex-1">
                        {selectedAlbum?.items && selectedAlbum.items.length > 0 ? (
                            <div className="space-y-3">
                                {selectedAlbum.items.map(item => (
                                    <div key={item.id} className="flex items-start gap-3 p-2 bg-slate-50 rounded-lg">
                                        <img
                                            src={serverPort ? `http://127.0.0.1:${serverPort}/api/preview?path=${encodeURIComponent(item.file_path)}` : ''}
                                            alt={item.file_path.split('/').pop()}
                                            className="w-12 h-12 object-cover rounded"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-slate-700 truncate">
                                                {item.file_path.split('/').pop()}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                {item.cover_role === 'front' && (
                                                    <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">FRONT COVER</span>
                                                )}
                                                {item.cover_role === 'back' && (
                                                    <span className="text-[9px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">BACK COVER</span>
                                                )}
                                                {item.favorite && (
                                                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">FAVORITE</span>
                                                )}
                                            </div>
                                            {item.note && (
                                                <p className="text-[10px] text-slate-500 mt-1 italic">"{item.note}"</p>
                                            )}
                                            <p className="text-[9px] text-slate-400 mt-1">Added by {item.added_by}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-400">
                                <Image size={24} className="mx-auto mb-2 opacity-50" />
                                <p className="text-xs">No items in this album yet</p>
                                <p className="text-[10px] mt-1">Clients can add photos from the guest view</p>
                            </div>
                        )}
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Image Preview Dialog */}
            <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
                <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 border-none bg-black/90 text-white overflow-hidden flex items-center justify-center">
                    <div className="relative w-full h-full flex items-center justify-center p-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full z-50"
                            onClick={() => setPreviewImage(null)}
                        >
                            <X size={24} />
                        </Button>
                        {previewImage && (
                            <img
                                src={serverPort ? `http://127.0.0.1:${serverPort}/api/preview?path=${encodeURIComponent(previewImage)}` : ''}
                                alt="Preview"
                                className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm"
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AlbumsTab;
