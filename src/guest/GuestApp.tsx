import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import {
    Folder, Image as ImageIcon, FileText, ArrowLeft, Download, Maximize2,
    Search, ChevronLeft, ChevronRight, MessageCircle,
    PlayCircle, LogOut, CheckSquare, Square, X, Filter, Home, Link2
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { getPastelColor } from './utils/color';
import ChatSidebar from './components/ChatSidebar';
import SimpleVideoPlayer from './components/VideoPlayer';
import StatsTags from './components/StatsTags';
import { useVoiceRoom } from './hooks/useVoiceRoom';
import AudioElements from './components/AudioElements';

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

interface ChatMessage {
    id: string;
    sender: string;
    text: string;
    timestamp: number;
    color: string;
    replyTo?: string | null;
    attachments?: string[] | null;
    reactions?: Record<string, string[]>;
}

interface SessionItem {
    name: string;
    isDirectory: boolean;
    size: number | null;
    mtime: string;
}

interface SessionStats {
    folders: number;
    images: number;
    videos: number;
    others: number;
}

const GuestApp = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (roomId && username) localStorage.setItem(`sharedrop_username_${roomId}`, username);
    }, [roomId, username]);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (res.ok) {
            setIsAuthenticated(true);
            setError('');
        }
        else setError('Access Denied');
    };

    useEffect(() => {
        if (!isAuthenticated) return;
        let isMounted = true;
        const loadRoom = async () => {
            const res = await fetch('/api/room');
            if (res.ok) {
                const data = await res.json();
                if (isMounted) setRoomId(data.roomId);
            }
        };
        loadRoom();
        return () => { isMounted = false; };
    }, [isAuthenticated]);

    useEffect(() => {
        if (!roomId) return;
        const stored = localStorage.getItem(`sharedrop_username_${roomId}`);
        if (stored) setUsername(stored);
    }, [roomId]);

    // Password dialog - compact centered card
    if (!isAuthenticated) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
            <div className="w-[320px] bg-white shadow-2xl rounded-3xl p-8">
                <form onSubmit={handleAuth} className="space-y-5">
                    <div className="text-center space-y-1">
                        <h1 className="text-xl font-bold text-slate-900">SharedDrop</h1>
                        <p className="text-sm text-slate-500">Enter password to continue</p>
                    </div>
                    <Input
                        type="password"
                        className="h-11 rounded-xl border-slate-200 bg-slate-50 text-center text-lg tracking-[0.25em] focus-visible:ring-blue-500 focus-visible:ring-2"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoFocus
                    />
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    <Button type="submit" className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold">
                        Access
                    </Button>
                </form>
            </div>
        </div>
    );

    if (!roomId) return (
        <div className="min-h-screen bg-white flex items-center justify-center text-base text-slate-400">
            Loading session…
        </div>
    );

    if (!username) return <UsernameSelection roomId={roomId} onSelect={setUsername} />;

    return <BrowseView username={username} roomId={roomId} />;
};

const UsernameSelection = ({ roomId, onSelect }: { roomId: string, onSelect: (name: string) => void }) => {
    const [name, setName] = useState('');
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        socketRef.current = io();
        return () => { socketRef.current?.disconnect(); };
    }, []);

    useEffect(() => {
        if (!name || name.length < 2) { setIsAvailable(null); return; }
        setIsValidating(true);
        const t = setTimeout(() => {
            socketRef.current?.emit('check-username', { name, roomId }, (res: { available: boolean }) => {
                setIsAvailable(res.available);
                setIsValidating(false);
            });
        }, 500);
        return () => clearTimeout(t);
    }, [name, roomId]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
            <div className="w-[320px] bg-white shadow-2xl rounded-3xl p-8 space-y-5">
                <div className="text-center space-y-1">
                    <h1 className="text-xl font-bold text-slate-900">Pick a Username</h1>
                    <p className="text-sm text-slate-500">Choose your display name</p>
                </div>
                <Input
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 text-center text-base focus-visible:ring-blue-500 focus-visible:ring-2"
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12))}
                    onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
                        setName(pasted);
                    }}
                    placeholder="Username"
                    maxLength={12}
                    autoFocus
                />
                {name.length >= 2 && (
                    <p className={`text-sm text-center ${isAvailable ? 'text-green-600' : 'text-red-500'}`}>
                        {isValidating ? 'Checking...' : isAvailable ? '✓ Available' : '✕ Taken'}
                    </p>
                )}
                <Button
                    className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold disabled:opacity-50"
                    disabled={!isAvailable || isValidating}
                    onClick={() => onSelect(name)}
                >
                    Continue
                </Button>
            </div>
        </div>
    );
};

const BrowseView = ({ username, roomId }: { username: string, roomId: string }) => {
    const [currentPath, setCurrentPath] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('name_asc');
    const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
    const [items, setItems] = useState<SessionItem[]>([]);
    const [stats, setStats] = useState<SessionStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [previewPath, setPreviewPath] = useState<string | null>(null);

    const [users, setUsers] = useState<string[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [typingUser, setTypingUser] = useState<string | null>(null);
    const [linkedImages, setLinkedImages] = useState<string[]>([]);
    const socketRef = useRef<Socket | null>(null);
    const [mySocketId, setMySocketId] = useState<string | null>(null);

    // Voice room hook
    const voiceRoom = useVoiceRoom(socketRef.current, mySocketId);

    const debouncedSearch = useDebounce(searchTerm, 300);

    const filteredItems = activeFilters.size > 0 ? items.filter(i => {
        const { isImage, isVideo } = isImageOrVideo(i.name);
        return (
            (activeFilters.has('folders') && i.isDirectory) ||
            (activeFilters.has('images') && isImage) ||
            (activeFilters.has('videos') && isVideo) ||
            (activeFilters.has('others') && !i.isDirectory && !isImage && !isVideo)
        );
    }) : items;

    const handleNavigate = useCallback((direction: number) => {
        if (!previewPath) return;
        const previewableItems = filteredItems.filter(i => !i.isDirectory);
        const currentIndex = previewableItems.findIndex(i =>
            (currentPath ? `${currentPath}/${i.name}` : i.name) === previewPath
        );
        if (currentIndex === -1) return;

        let nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = previewableItems.length - 1;
        if (nextIndex >= previewableItems.length) nextIndex = 0;

        const next = previewableItems[nextIndex];
        setPreviewPath(currentPath ? `${currentPath}/${next.name}` : next.name);
    }, [previewPath, filteredItems, currentPath]);

    const onFilterToggle = (key: string) => {
        setActiveFilters(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    useEffect(() => {
        const socket = io({
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 20000
        });
        socketRef.current = socket;

        // Join session on connect/reconnect
        const joinSession = () => {
            socket.emit('join-session', { username, color: getPastelColor(username), roomId });
        };

        socket.on('connect', () => {
            setMySocketId(socket.id || null);
            joinSession();
        });

        socket.on('chat-history', (history: ChatMessage[]) => {
            const normalized = history.map(m => ({
                ...m,
                timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now()
            }));
            setMessages(normalized);
        });
        socket.on('presence-update', (list: string[]) => setUsers(list));
        socket.on('chat-message', (msg: ChatMessage) => setMessages(prev => [...prev, msg]));
        socket.on('typing-update', ({ username: u, isTyping }: { username: string, isTyping: boolean }) => setTypingUser(isTyping ? u : null));
        socket.on('history-cleared', () => setMessages([]));
        socket.on('reaction-update', ({ messageId, reactions }: { messageId: string, reactions: Record<string, string[]> }) => {
            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions } : m));
        });

        // Handle disconnect/reconnect for presence sync
        socket.on('disconnect', () => {
            console.log('Socket disconnected, will reconnect...');
        });
        socket.on('reconnect', () => {
            console.log('Socket reconnected');
        });
        socket.on('connect_error', (err) => {
            console.error('Socket connection error:', err.message);
        });

        return () => { socket.disconnect(); };
    }, [username, roomId]);

    const fetchItems = async () => {
        setIsLoading(true);
        const res = await fetch(`/api/browse?path=${encodeURIComponent(currentPath)}&search=${encodeURIComponent(debouncedSearch)}&sort=${sortBy}`);
        const data = await res.json();
        setItems(data.items || []);
        setStats(data.stats);
        setIsLoading(false);
    };

    useEffect(() => { fetchItems(); setSelectedPaths([]); }, [currentPath, debouncedSearch, sortBy]);

    const handleSendMessage = (data: { text: string; replyTo?: string | null; attachments?: string[] | null }) => {
        if (!data.text?.trim() && (!data.attachments || data.attachments.length === 0)) return;
        socketRef.current?.emit('send-message', data, (res: { success: boolean, id: string }) => {
            if (res.success) {
                setMessages(prev => [...prev, {
                    id: res.id,
                    sender: username!,
                    text: data.text,
                    timestamp: Date.now(),
                    color: getPastelColor(username!),
                    replyTo: data.replyTo,
                    attachments: data.attachments,
                    reactions: {}
                }]);
                setChatInput('');
                setLinkedImages([]);
                socketRef.current?.emit('typing', false);
            }
        });
    };

    const handleReact = (messageId: string, emoji: string) => {
        socketRef.current?.emit('react-message', { messageId, emoji });
    };

    const handleLinkImage = (path: string) => {
        if (linkedImages.length < 5 && !linkedImages.includes(path)) {
            setLinkedImages(prev => [...prev, path]);
        }
    };

    const toggleSelect = (name: string) => {
        const p = currentPath ? `${currentPath}/${name}` : name;
        setSelectedPaths(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    };

    const downloadSelection = async () => {
        if (selectedPaths.length === 0) return;
        if (selectedPaths.length === 1) {
            window.open(`/api/file?path=${encodeURIComponent(selectedPaths[0])}`);
            return;
        }
        const res = await fetch('/api/download-zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths: selectedPaths })
        });
        if (res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sharedrop-bundle.zip';
            a.click();
        }
    };

    const [focusedIndex, setFocusedIndex] = useState(-1);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

            if (previewPath) {
                if (e.key === 'Escape') { e.preventDefault(); setPreviewPath(null); }
                else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'n') { e.preventDefault(); handleNavigate(1); }
                else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'p') { e.preventDefault(); handleNavigate(-1); }
                return;
            }

            if (e.key === 'ArrowRight') { e.preventDefault(); setFocusedIndex(prev => Math.min(prev + 1, filteredItems.length - 1)); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); setFocusedIndex(prev => Math.max(prev - 1, 0)); }
            else if (e.key === 'Enter' && focusedIndex >= 0) {
                e.preventDefault();
                const item = filteredItems[focusedIndex];
                if (item) {
                    if (item.isDirectory) setCurrentPath(currentPath ? `${currentPath}/${item.name}` : item.name);
                    else setPreviewPath(currentPath ? `${currentPath}/${item.name}` : item.name);
                }
            }
            else if (e.key === 'Escape') setFocusedIndex(-1);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [filteredItems, focusedIndex, currentPath, previewPath, handleNavigate]);

    useEffect(() => { setFocusedIndex(-1); }, [currentPath]);

    return (
        <div className="h-screen w-screen bg-slate-50 flex overflow-hidden">
            {/* Chat Sidebar */}
            <ChatSidebar
                isOpen={isSidebarOpen}
                onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
                messages={messages}
                users={users}
                username={username || 'Guest'}
                typingUser={typingUser}
                onSendMessage={handleSendMessage}
                chatInput={chatInput}
                setChatInput={(val: string) => { setChatInput(val); socketRef.current?.emit('typing', val.length > 0); }}
                onReact={handleReact}
                linkedImages={linkedImages}
                onClearLinkedImages={() => setLinkedImages([])}
                onImageClick={(path) => setPreviewPath(path)}
                voiceRoom={{
                    isActive: voiceRoom.isActive,
                    isInVoice: voiceRoom.isInVoice,
                    isHost: voiceRoom.isHost,
                    participantCount: voiceRoom.participantCount,
                    isMuted: voiceRoom.isMuted,
                    isLoading: voiceRoom.isLoading,
                    onStart: voiceRoom.startVoice,
                    onJoin: voiceRoom.joinVoice,
                    onLeave: voiceRoom.leaveVoice,
                    onStop: voiceRoom.stopVoice,
                    onToggleMute: voiceRoom.toggleMute
                }}
            />

            {/* Audio elements for remote voice streams */}
            <AudioElements streams={voiceRoom.remoteStreams} />

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">
                {/* Header */}
                <header className="flex-shrink-0 bg-white border-b border-slate-100 px-4 py-3">
                    <div className="max-w-6xl mx-auto">
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                size="icon"
                                className="rounded-xl h-10 w-10 border-slate-200 hover:bg-slate-50"
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            >
                                <MessageCircle size={18} className="text-slate-600" />
                            </Button>

                            {currentPath && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-xl h-10 w-10 hover:bg-slate-100"
                                    onClick={() => {
                                        const p = currentPath.split('/');
                                        p.pop();
                                        setCurrentPath(p.join('/'));
                                    }}
                                >
                                    <ArrowLeft size={18} />
                                </Button>
                            )}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <Home size={16} className="text-slate-400 flex-shrink-0" />
                                    <p className="text-base font-semibold text-slate-800 truncate">
                                        {currentPath ? currentPath.split('/').pop() : 'Gallery'}
                                    </p>
                                </div>
                                <p className="text-xs text-slate-400 truncate">/{currentPath || ''}</p>
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-xl h-10 w-10 text-slate-400 hover:text-slate-600"
                                onClick={() => window.location.reload()}
                            >
                                <LogOut size={16} />
                            </Button>
                        </div>

                        {/* Search and filters */}
                        <div className="flex items-center gap-3 mt-4">
                            <div className="relative flex-1 max-w-lg">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <Input
                                    className="h-10 pl-10 rounded-xl border-slate-200 bg-slate-50 text-sm focus-visible:ring-blue-500 focus-visible:ring-2"
                                    placeholder="Search files..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <StatsTags
                                stats={stats}
                                activeFilters={Array.from(activeFilters)}
                                onFilterToggle={onFilterToggle}
                                totalItems={filteredItems.filter(i => !i.isDirectory).length}
                                selectedCount={selectedPaths.length}
                                onSelectAll={() => {
                                    const allPaths = filteredItems
                                        .filter(i => !i.isDirectory)
                                        .map(i => currentPath ? `${currentPath}/${i.name}` : i.name);
                                    setSelectedPaths(allPaths);
                                }}
                                onDeselectAll={() => setSelectedPaths([])}
                            />
                        </div>
                    </div>
                </header>

                {/* Gallery grid */}
                <main className="flex-1 overflow-auto p-4">
                    <div className="max-w-6xl mx-auto">
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                            {isLoading ? <SkeletonFeed /> : filteredItems.length > 0 ? (
                                filteredItems.map((item, i) => (
                                    <FileCard
                                        key={i}
                                        item={item}
                                        currentPath={currentPath}
                                        isFocused={i === focusedIndex}
                                        selected={selectedPaths.includes(currentPath ? `${currentPath}/${item.name}` : item.name)}
                                        onToggle={(e: React.MouseEvent) => { e.stopPropagation(); toggleSelect(item.name); }}
                                        onLongPress={() => toggleSelect(item.name)}
                                        onNavigate={() => item.isDirectory && setCurrentPath(currentPath ? `${currentPath}/${item.name}` : item.name)}
                                        onPreview={(path: string) => setPreviewPath(path)}
                                        onLink={(path: string) => handleLinkImage(path)}
                                        linkedImages={linkedImages}
                                    />
                                ))
                            ) : <EmptyState />}
                        </div>
                    </div>
                </main>

                {/* Selection toolbar */}
                {selectedPaths.length > 0 && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl z-50 flex items-center gap-4 animate-in slide-in-from-bottom-4">
                        <span className="text-sm"><strong>{selectedPaths.length}</strong> selected</span>
                        {/* Attach to Chat - only for images, max 5 */}
                        {selectedPaths.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p)).length > 0 && (
                            <Button
                                className="bg-blue-500 text-white hover:bg-blue-600 rounded-xl h-9 px-4 text-sm font-medium"
                                onClick={() => {
                                    const imagePaths = selectedPaths.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p)).slice(0, 5);
                                    setLinkedImages(imagePaths);
                                    setIsSidebarOpen(true);
                                    setSelectedPaths([]);
                                }}
                            >
                                <Link2 size={14} className="mr-2" />
                                Attach to Chat ({Math.min(selectedPaths.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p)).length, 5)})
                            </Button>
                        )}
                        <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-xl h-9 px-4 text-sm font-medium" onClick={downloadSelection}>
                            <Download size={14} className="mr-2" />
                            {selectedPaths.length === 1 ? 'Download' : 'ZIP'}
                        </Button>
                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white h-8 w-8" onClick={() => setSelectedPaths([])}>
                            <X size={16} />
                        </Button>
                    </div>
                )}

                {/* Preview Modal */}
                <Dialog open={!!previewPath} onOpenChange={(open) => !open && setPreviewPath(null)}>
                    <DialogContent
                        className="max-w-[95vw] w-full max-h-[95vh] p-0 border-0 bg-black/95 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl flex flex-col focus:outline-none"
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowRight') { e.preventDefault(); handleNavigate(1); }
                            if (e.key === 'ArrowLeft') { e.preventDefault(); handleNavigate(-1); }
                            if (e.key === 'Escape') { e.preventDefault(); setPreviewPath(null); }
                        }}
                    >
                        <DialogTitle className="sr-only">Preview</DialogTitle>
                        <DialogDescription className="sr-only">Media Preview</DialogDescription>

                        {/* Image action buttons */}
                        {previewPath && /\.(jpg|jpeg|png|webp|heic|dng|raw|arw|gif|svg|bmp)$/i.test(previewPath) && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="rounded-xl bg-white/20 hover:bg-white/40 text-white h-10 w-10"
                                    onClick={() => window.open(`/api/file?path=${encodeURIComponent(previewPath!)}`)}
                                    title="Download"
                                >
                                    <Download size={18} />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="rounded-xl bg-white/20 hover:bg-white/40 text-white h-10 w-10"
                                    onClick={() => window.open(`/api/stream?path=${encodeURIComponent(previewPath!)}`)}
                                    title="Full size"
                                >
                                    <Maximize2 size={18} />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className={`rounded-xl h-10 w-10 ${linkedImages.includes(previewPath!) ? 'bg-blue-500 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
                                    onClick={() => handleLinkImage(previewPath!)}
                                    title={linkedImages.includes(previewPath!) ? 'Linked' : 'Link to chat'}
                                    disabled={linkedImages.length >= 5 && !linkedImages.includes(previewPath!)}
                                >
                                    <Link2 size={18} />
                                </Button>
                            </div>
                        )}

                        {/* Navigation arrows */}
                        <div className="absolute inset-y-0 left-0 flex items-center pl-2 z-40 opacity-0 hover:opacity-100 transition-opacity">
                            <Button variant="secondary" size="icon" className="rounded-xl bg-black/40 hover:bg-black/70 text-white h-12 w-12" onClick={() => handleNavigate(-1)}>
                                <ChevronLeft size={28} />
                            </Button>
                        </div>
                        <div className="absolute inset-y-0 right-0 flex items-center pr-2 z-40 opacity-0 hover:opacity-100 transition-opacity">
                            <Button variant="secondary" size="icon" className="rounded-xl bg-black/40 hover:bg-black/70 text-white h-12 w-12" onClick={() => handleNavigate(1)}>
                                <ChevronRight size={28} />
                            </Button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 flex items-center justify-center p-4">
                            {previewPath && (() => {
                                const isVid = /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(previewPath);
                                const isImg = /\.(jpg|jpeg|png|webp|heic|dng|raw|arw|gif|svg|bmp)$/i.test(previewPath);

                                if (isVid) return (
                                    <div className="w-full max-w-4xl h-full flex items-center justify-center">
                                        <SimpleVideoPlayer
                                            src={`/api/stream?path=${encodeURIComponent(previewPath)}`}
                                            poster={`/api/preview?path=${encodeURIComponent(previewPath)}`}
                                            onNext={() => handleNavigate(1)}
                                            onPrev={() => handleNavigate(-1)}
                                            onClose={() => setPreviewPath(null)}
                                        />
                                    </div>
                                );
                                if (isImg) return (
                                    <img
                                        src={`/api/stream?path=${encodeURIComponent(previewPath)}`}
                                        className="max-w-full max-h-[85vh] object-contain rounded-lg"
                                        alt=""
                                    />
                                );
                                return (
                                    <div className="text-white/50 flex flex-col items-center gap-3">
                                        <FileText size={48} />
                                        <p className="text-base font-medium">Preview unavailable</p>
                                        <Button variant="outline" onClick={() => window.open(`/api/file?path=${encodeURIComponent(previewPath)}`)}>
                                            Download
                                        </Button>
                                    </div>
                                );
                            })()}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

// File card component
const FileCard = ({ item, currentPath, onNavigate, selected, onToggle, onLongPress, isFocused, onPreview, onLink, linkedImages }: any) => {
    const { isImage, isVideo, canPreview, ext } = isImageOrVideo(item.name);
    const p = currentPath ? `${currentPath}/${item.name}` : item.name;
    const longPressRef = useRef<number | null>(null);

    const handleTouchStart = () => { longPressRef.current = window.setTimeout(() => onLongPress?.(), 450); };
    const handleTouchEnd = () => { if (longPressRef.current) window.clearTimeout(longPressRef.current); longPressRef.current = null; };

    const handleClick = () => {
        if (item.isDirectory) onNavigate();
        else onPreview?.(p);
    };

    return (
        <div
            className={`group rounded-2xl bg-white border overflow-hidden cursor-pointer transition-all shadow-sm hover:shadow-md ${isFocused ? 'ring-2 ring-blue-500' : 'border-slate-100'}`}
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        >
            {/* Thumbnail */}
            <div className="aspect-square relative bg-slate-50 overflow-hidden">
                {item.isDirectory ? (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50">
                        <Folder size={48} className="text-amber-500 fill-amber-200" />
                    </div>
                ) : (canPreview || isVideo) ? (
                    <>
                        <img
                            src={`/api/preview?path=${encodeURIComponent(p)}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            alt=""
                            onError={(e: any) => { e.target.style.display = 'none'; }}
                        />
                        {isVideo && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-black/50 rounded-full p-2">
                                    <PlayCircle size={24} className="text-white" />
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-1 bg-slate-50">
                        <FileText size={32} />
                        <span className="text-xs font-bold uppercase">.{ext}</span>
                    </div>
                )}

                {/* Hover overlay */}
                {!item.isDirectory && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg" onClick={(e) => { e.stopPropagation(); onPreview?.(p); }}>
                            <Maximize2 size={14} />
                        </Button>
                        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg" onClick={(e) => { e.stopPropagation(); window.open(`/api/file?path=${encodeURIComponent(p)}`); }}>
                            <Download size={14} />
                        </Button>
                        {isImage && (
                            <Button
                                variant="secondary"
                                size="icon"
                                className={`h-8 w-8 rounded-lg ${linkedImages?.includes(p) ? 'bg-blue-500 text-white' : ''}`}
                                onClick={(e) => { e.stopPropagation(); onLink?.(p); }}
                            >
                                <Link2 size={14} />
                            </Button>
                        )}
                    </div>
                )}

                {/* Selection checkbox */}
                <button
                    onClick={onToggle}
                    className={`absolute top-2 right-2 p-1 rounded-lg transition-all ${selected ? 'bg-blue-500 text-white' : 'bg-white/80 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-white'}`}
                >
                    {selected ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>
            </div>

            {/* Info */}
            <div className="px-3 py-2">
                <p className={`text-sm font-medium text-slate-800 truncate ${item.isDirectory ? 'font-semibold' : ''}`}>{item.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{new Date(item.mtime).toLocaleDateString()}</p>
            </div>
        </div>
    );
};

const isImageOrVideo = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const allImages = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'dng', 'gif', 'bmp', 'tiff', 'raw', 'cr2', 'nef', 'arw'];
    const supportedImages = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'dng', 'raw', 'arw'];
    const allVideos = ['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'];

    return { isImage: allImages.includes(ext), isVideo: allVideos.includes(ext), canPreview: supportedImages.includes(ext), ext };
};

const SkeletonFeed = () => [...Array(12)].map((_, i) => (
    <div key={i} className="rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-sm">
        <Skeleton className="aspect-square" />
        <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
        </div>
    </div>
));

const EmptyState = () => (
    <div className="col-span-full py-16 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Filter size={24} className="text-slate-300" />
        </div>
        <p className="text-base text-slate-400">No files found</p>
    </div>
);

export default GuestApp;
