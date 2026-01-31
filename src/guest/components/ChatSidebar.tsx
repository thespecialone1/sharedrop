import React, { useRef, useEffect, useState } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X, Users, MessageCircle, Reply, Image as ImageIcon, Smile, Plus, Trash2, MoreHorizontal, Video } from 'lucide-react';
import { getPastelColor } from '../utils/color';
import VoicePanel from './VoicePanel';
import ParticipantList from './ParticipantList';
import ReactionsBar from './ReactionsBar';
import { MediaPicker } from './MediaPicker';

const REACTION_EMOJIS = ['❤️', '😂', '😢', '😎', '😡', '👍', '👎'];

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

interface ChatSidebarProps {
    messages: ChatMessage[];
    users: string[];
    typingUser: string | null;
    onSendMessage: (data: { text: string; replyTo?: string | null; attachments?: string[] | null }) => void;
    onDeleteMessage?: (messageId: string) => void;
    isOpen: boolean;
    onToggle: () => void;
    username: string;
    chatInput: string;
    setChatInput: (val: string) => void;
    onReact: (messageId: string, emoji: string) => void;
    linkedImages?: string[];
    onClearLinkedImages?: () => void;
    onImageClick?: (path: string) => void;
    // Voice room props
    voiceRoom?: {
        isActive: boolean;
        isInVoice: boolean;
        isHost: boolean;
        participantCount: number;
        isMuted: boolean;
        isLoading: boolean;
        isReconnecting: boolean;
        hostReconnecting: boolean;
        onStart: () => void;
        onJoin: () => void;
        onLeave: () => void;
        onStop: () => void;
        onToggleMute: () => void;
        isLocked: boolean;
        isPttEnabled: boolean;
        isSpeaking: boolean;
        onToggleLock: () => void;
        onMuteAll: () => void;
        onTogglePtt: () => void;
    };
    videoRoom?: {
        isActive: boolean;
        isInVideo: boolean;
        onStart: () => void;
        onJoin: () => void;
        error: string | null;
    };
    participants?: Array<{ socketId: string, username: string, isSpeaking?: boolean }>;
    hostSocketId?: string | null;
    mySocketId?: string | null;
    onKickParticipant?: (socketId: string) => void;
    onSendReaction?: (type: string) => void;
    lastBroadcastReaction?: { username: string, color: string, type: string, socketId: string, timestamp: number } | null;
}

const ChatSidebar = ({
    messages,
    users,
    typingUser,
    onSendMessage,
    isOpen,
    onToggle,
    username,
    chatInput,
    setChatInput,
    onReact,
    linkedImages = [],
    onClearLinkedImages,
    onImageClick,
    voiceRoom,
    participants = [],
    hostSocketId,
    mySocketId,
    onKickParticipant,
    onSendReaction,
    lastBroadcastReaction,
    onDeleteMessage,
    videoRoom
}: ChatSidebarProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
    const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [pendingSticker, setPendingSticker] = useState<string | null>(null);
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    // Auto-focus input and scroll to bottom when sidebar opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => {
                inputRef.current?.focus();
                messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
            }, 100);
        }
    }, [isOpen]);

    // Auto-focus input when replying
    useEffect(() => {
        if (replyTo) {
            inputRef.current?.focus();
        }
    }, [replyTo]);

    const handleSendReaction = (type: string) => {
        onSendReaction?.(type);
        // Local animation handled by global overlay reacting to server broadcast
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(10);
    };

    const handleReplyClick = (messageId: string) => {
        const element = document.getElementById(`message-${messageId}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedMessageId(messageId);
            setTimeout(() => setHighlightedMessageId(null), 2000);
        }
    };

    const handleSubmit = () => {
        if (!chatInput.trim() && linkedImages.length === 0 && !pendingSticker) return;

        const attachments = [...linkedImages];
        if (pendingSticker) {
            attachments.push(pendingSticker);
        }

        onSendMessage({
            text: chatInput.trim(),
            replyTo: replyTo?.id || null,
            attachments: attachments.length > 0 ? attachments : null
        });
        setChatInput('');
        setReplyTo(null);
        setPendingSticker(null);
        onClearLinkedImages?.();
        // Keep focus after sending
        inputRef.current?.focus();
    };

    const getReplyMessage = (replyToId: string) => {
        return messages.find(m => m.id === replyToId);
    };

    const handleReaction = (messageId: string, emoji: string) => {
        onReact(messageId, emoji);
        setActiveReactionId(null);
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && <div className="fixed inset-0 bg-black/40 z-40" onClick={onToggle} />}

            {/* Chat Panel */}
            <div className={`
                fixed inset-y-0 left-0 z-[60] transition-transform duration-300 ease-out
                bg-bg shadow-2xl border-r border-border-custom
                w-[85vw] sm:w-[25vw] sm:min-w-[320px] sm:max-w-[400px]
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex-shrink-0 px-4 py-3 border-b border-border-custom flex items-center justify-between bg-surface-2">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={18} className="text-blue-500" />
                            <span className="font-semibold text-sm text-text-primary">Chat</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Video Control */}
                            {videoRoom && !videoRoom.isInVideo && (
                                <div className="relative">
                                    {videoRoom.isActive && (
                                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 z-10">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                        </span>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className={`h-8 px-3 rounded-lg text-xs font-semibold shadow-sm transition-all border-border-custom hover:bg-surface-2
                                            ${videoRoom.isActive
                                                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                                : 'text-text-secondary'}`}
                                        onClick={videoRoom.isActive ? videoRoom.onJoin : videoRoom.onStart}
                                        title={videoRoom.isActive ? "Join Video Call" : "Start Video Call"}
                                    >
                                        <Video size={14} className={`mr-2 ${videoRoom.isActive ? 'text-green-600' : 'text-slate-400'}`} />
                                        {videoRoom.isActive ? (videoRoom.isInVideo ? 'Active' : 'Join Video') : 'Video'}
                                    </Button>
                                </div>
                            )}
                            {voiceRoom && (
                                <VoicePanel
                                    isActive={voiceRoom.isActive}
                                    isInVoice={voiceRoom.isInVoice}
                                    isHost={voiceRoom.isHost}
                                    participantCount={voiceRoom.participantCount}
                                    isMuted={voiceRoom.isMuted}
                                    isLocked={voiceRoom.isLocked}
                                    isPttEnabled={voiceRoom.isPttEnabled}
                                    isSpeaking={voiceRoom.isSpeaking}
                                    onStart={voiceRoom.onStart}
                                    onJoin={voiceRoom.onJoin}
                                    onLeave={voiceRoom.onLeave}
                                    onStop={voiceRoom.onStop}
                                    onToggleMute={voiceRoom.onToggleMute}
                                    onToggleLock={voiceRoom.onToggleLock}
                                    onMuteAll={voiceRoom.onMuteAll}
                                    onTogglePtt={voiceRoom.onTogglePtt}
                                    isLoading={voiceRoom.isLoading}
                                    isReconnecting={voiceRoom.isReconnecting}
                                    hostReconnecting={voiceRoom.hostReconnecting}
                                    isVideoActive={videoRoom?.isActive}
                                />
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onToggle}>
                                <X size={16} className="text-slate-400" />
                            </Button>
                        </div>
                    </div>

                    {/* Debug: Check video state */}
                    {/* {console.log('ChatSidebar VideoRoom:', videoRoom)} */}

                    {/* Error Banner */}
                    {videoRoom?.error && (
                        <div className="bg-red-50 px-4 py-2 text-xs text-red-600 border-b border-red-100 flex items-center justify-between font-medium">
                            <span>{videoRoom.error}</span>
                        </div>
                    )}



                    {/* Participant List (Voice) */}
                    {voiceRoom?.isInVoice && (
                        <div className="flex-shrink-0 px-3 py-2 border-b border-border-custom bg-surface-2/50">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Users size={12} className="text-green-500" />
                                <span className="text-[10px] font-semibold text-slate-500 uppercase">Voice Call</span>
                            </div>
                            <ParticipantList
                                participants={participants}
                                hostSocketId={hostSocketId || ''}
                                currentUserId={mySocketId || ''}
                                isHost={voiceRoom.isHost}
                                onKick={onKickParticipant || (() => { })}
                            />
                        </div>
                    )}

                    {/* Online users */}
                    <div className="flex-shrink-0 px-3 py-2 border-b border-border-custom bg-bg">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Users size={12} className="text-slate-400" />
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Online · {users.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
                            {users.map((u, i) => (
                                <span
                                    key={i}
                                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                                    style={{ backgroundColor: getPastelColor(u), color: 'var(--text-primary)' }}
                                >
                                    {u === username ? 'You' : u}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Messages */}
                    <ScrollArea className="flex-1 min-h-0">
                        <div className="p-3 space-y-3">
                            {messages.map((m) => {
                                const replyMsg = m.replyTo ? getReplyMessage(m.replyTo) : null;
                                const isOwn = m.sender === username;
                                const isHighlighted = highlightedMessageId === m.id;

                                return (
                                    <div
                                        key={m.id}
                                        id={`message-${m.id}`}
                                        className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'} transition-colors duration-1000 ${isHighlighted ? 'bg-blue-50/50 -mx-3 px-3 py-1 rounded-lg' : ''}`}
                                    >
                                        {/* Sender info */}
                                        <div className="flex items-center gap-1 px-1 mb-0.5">
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getPastelColor(m.sender) }} />
                                            <span className="text-[10px] font-medium text-slate-600">{m.sender}</span>
                                            <span className="text-[9px] text-slate-400">
                                                {typeof m.timestamp === 'number' && !isNaN(m.timestamp)
                                                    ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : ''}
                                            </span>
                                        </div>

                                        {/* Reply preview - clean design */}
                                        {replyMsg && (
                                            <div
                                                className="text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded-lg mb-1 max-w-[85%] truncate border-l-2 border-blue-300 cursor-pointer hover:bg-blue-50 transition-colors"
                                                onClick={() => handleReplyClick(m.replyTo!)}
                                            >
                                                <span className="font-medium text-blue-600">{replyMsg.sender}</span>
                                                <span className="mx-1">·</span>
                                                {replyMsg.text.slice(0, 40)}{replyMsg.text.length > 40 ? '...' : ''}
                                            </div>
                                        )}

                                        {/* Message bubble */}
                                        <div className="relative w-full" style={{ maxWidth: '70%' }}>
                                            <div
                                                className={`
                                                    text-sm px-3 py-2 rounded-2xl w-fit
                                                    ${isOwn ? 'bg-blue-500 text-white rounded-br-md ml-auto' : 'bg-surface-2 text-text-primary rounded-bl-md'}
                                                `}
                                            >
                                                {m.text}

                                                {/* Attachments */}
                                                {m.attachments && m.attachments.length > 0 && (
                                                    <div className="flex gap-1 mt-2 flex-wrap">
                                                        {m.attachments.map((path, i) => (
                                                            <img
                                                                key={i}
                                                                src={path.startsWith('http') || path.startsWith('data:') ? path : `/api/preview?path=${encodeURIComponent(path)}`}
                                                                alt=""
                                                                className="w-full max-w-[200px] h-auto object-contain rounded cursor-pointer hover:opacity-90"
                                                                onClick={() => onImageClick?.(path)}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action buttons (visible on hover) */}
                                            <div
                                                className={`
                                                    absolute top-1 z-20 flex gap-0.5
                                                    ${isOwn ? 'right-full mr-1' : 'left-full ml-1'}
                                                    opacity-0 group-hover:opacity-100 transition-opacity bg-bg/80 backdrop-blur-sm rounded-lg p-0.5 shadow-sm border border-border-custom
                                                `}
                                                style={{ minWidth: 'max-content' }}
                                            >
                                                <button
                                                    className="p-1 hover:bg-surface-1 rounded hover:text-primary-blue text-text-secondary"
                                                    onClick={() => setReplyTo(m)}
                                                    title="Reply"
                                                >
                                                    <Reply size={14} />
                                                </button>
                                                <button
                                                    className="p-1 hover:bg-white rounded hover:text-yellow-600 text-slate-400"
                                                    onClick={() => setActiveReactionId(activeReactionId === m.id ? null : m.id)}
                                                    title="React"
                                                >
                                                    <Smile size={14} />
                                                </button>
                                                {isOwn && onDeleteMessage && (
                                                    <button
                                                        className="p-1 hover:bg-white rounded hover:text-red-600 text-slate-400"
                                                        onClick={() => onDeleteMessage(m.id)}
                                                        title="Delete for me"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Reaction picker - fixed positioning */}
                                            {activeReactionId === m.id && (
                                                <div
                                                    className={`absolute ${isOwn ? 'right-0' : 'left-0'} -bottom-8 bg-bg border border-border-custom rounded-full shadow-lg px-2 py-1 flex gap-1 z-50`}
                                                    onMouseLeave={() => setTimeout(() => setActiveReactionId(null), 300)}
                                                >
                                                    {REACTION_EMOJIS.map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            className="text-base hover:scale-125 transition-transform"
                                                            onClick={() => handleReaction(m.id, emoji)}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Reactions display */}
                                        {m.reactions && Object.keys(m.reactions).length > 0 && (
                                            <div className="flex gap-1 mt-1 flex-wrap">
                                                {Object.entries(m.reactions).map(([emoji, userList]) => (
                                                    <span
                                                        key={emoji}
                                                        className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-slate-200"
                                                        title={userList.join(', ')}
                                                        onClick={() => handleReaction(m.id, emoji)}
                                                    >
                                                        {emoji} {userList.length}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {typingUser && (
                                <div className="text-[10px] italic text-slate-400 animate-pulse px-1">
                                    {typingUser} is typing...
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>

                    {/* Reply indicator - clean design */}
                    {replyTo && (
                        <div className="flex-shrink-0 px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 truncate">
                                <Reply size={10} className="text-blue-500" />
                                <span>Replying to <span className="font-medium text-slate-700">{replyTo.sender}</span></span>
                            </div>
                            <button className="text-slate-400 hover:text-slate-600" onClick={() => setReplyTo(null)}>
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Linked images indicator */}
                    {linkedImages.length > 0 && (
                        <div className="flex-shrink-0 px-3 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ImageIcon size={12} className="text-blue-500" />
                                <span className="text-[10px] text-blue-600 font-medium">{linkedImages.length} image(s)</span>
                                <div className="flex gap-1">
                                    {linkedImages.slice(0, 3).map((path, i) => (
                                        <img
                                            key={i}
                                            src={`/api/preview?path=${encodeURIComponent(path)}`}
                                            alt=""
                                            className="w-6 h-6 object-cover rounded"
                                        />
                                    ))}
                                    {linkedImages.length > 3 && <span className="text-[10px] text-blue-500">+{linkedImages.length - 3}</span>}
                                </div>
                            </div>
                            <button className="text-blue-400 hover:text-blue-600" onClick={onClearLinkedImages}>
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Pending Sticker Preview */}
                    {pendingSticker && (
                        <div className="flex-shrink-0 px-3 py-2 bg-purple-50 border-t border-purple-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Smile size={12} className="text-purple-500" />
                                <span className="text-[10px] text-purple-600 font-medium">Sticker selected</span>
                                <img
                                    src={pendingSticker}
                                    alt="Sticker"
                                    className="h-8 w-auto object-contain rounded"
                                />
                            </div>
                            <button className="text-purple-400 hover:text-purple-600" onClick={() => setPendingSticker(null)}>
                                <X size={14} />
                            </button>
                        </div>
                    )}



                    {/* Input Area - Rich Media Pill */}
                    <div className="flex-shrink-0 p-3 bg-bg border-t border-border-custom relative z-50">
                        {/* Voice/Video Reactions */}
                        {(voiceRoom?.isInVoice || videoRoom?.isActive) && (
                            <div className="mb-2 flex justify-center">
                                <ReactionsBar onReact={handleSendReaction} />
                            </div>
                        )}

                        {/* Media Picker Popover */}
                        {showMediaPicker && (
                            <div className="absolute bottom-[80px] left-4 shadow-2xl z-[70]">
                                <MediaPicker
                                    onSelect={(url, type) => {
                                        setPendingSticker(url);
                                        setShowMediaPicker(false);
                                    }}
                                    onClose={() => setShowMediaPicker(false)}
                                />
                            </div>
                        )}

                        <div className="bg-surface-2/50 hover:bg-surface-2 transition-colors rounded-full p-2 pl-4 flex items-end gap-2 border border-border-custom focus-within:border-border-custom ring-0 focus-within:ring-0">
                            {/* Standard Text Input - Transparent */}
                            <div className="flex-1 min-w-0 py-1.5">
                                <input
                                    ref={inputRef}
                                    className="w-full bg-transparent border-none focus:ring-0 outline-none p-0 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 max-h-32 overflow-y-auto resize-none"
                                    placeholder={(linkedImages.length > 0 || pendingSticker) ? "Add a caption..." : "Type a message..."}
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit();
                                        }
                                    }}
                                />
                            </div>

                            {/* Right Side Tools */}
                            <div className="flex items-center gap-1 flex-shrink-0 mb-0.5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 rounded-full ${showMediaPicker ? 'bg-blue-100 text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
                                    onClick={() => setShowMediaPicker(!showMediaPicker)}
                                >
                                    <Smile size={20} />
                                </Button>
                                <Button
                                    type="button"
                                    size="icon"
                                    className={`h-8 w-8 rounded-full ${(!chatInput.trim() && linkedImages.length === 0 && !pendingSticker) ? 'bg-slate-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white transition-colors`}
                                    onClick={(e) => { e.preventDefault(); handleSubmit(); }}
                                    disabled={!chatInput.trim() && linkedImages.length === 0 && !pendingSticker}
                                >
                                    <Send size={16} className={(!chatInput.trim() && linkedImages.length === 0 && !pendingSticker) ? 'ml-0' : 'ml-0.5'} />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div >
            </div >
        </>
    );
};

export default ChatSidebar;
