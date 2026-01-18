import React, { useRef, useEffect, useState } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, X, Users, MessageCircle, Reply, Image as ImageIcon, Smile } from 'lucide-react';
import { getPastelColor } from '../utils/color';

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
    isOpen: boolean;
    onToggle: () => void;
    username: string;
    chatInput: string;
    setChatInput: (val: string) => void;
    onReact: (messageId: string, emoji: string) => void;
    linkedImages?: string[];
    onClearLinkedImages?: () => void;
    onImageClick?: (path: string) => void;
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
    onImageClick
}: ChatSidebarProps) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
    const [activeReactionId, setActiveReactionId] = useState<string | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = () => {
        if (!chatInput.trim() && linkedImages.length === 0) return;
        onSendMessage({
            text: chatInput.trim(),
            replyTo: replyTo?.id || null,
            attachments: linkedImages.length > 0 ? linkedImages : null
        });
        setChatInput('');
        setReplyTo(null);
        onClearLinkedImages?.();
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
                fixed top-0 left-0 h-full z-50 transition-transform duration-300 ease-out
                bg-white shadow-2xl border-r border-slate-100
                w-full sm:w-[25vw] sm:min-w-[320px] sm:max-w-[400px]
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={18} className="text-blue-500" />
                            <span className="font-semibold text-sm text-slate-800">Chat</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onToggle}>
                            <X size={16} className="text-slate-400" />
                        </Button>
                    </div>

                    {/* Online users */}
                    <div className="flex-shrink-0 px-3 py-2 border-b border-slate-100 bg-white">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Users size={12} className="text-slate-400" />
                            <span className="text-[10px] font-semibold text-slate-500 uppercase">Online · {users.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-12 overflow-y-auto">
                            {users.map((u, i) => (
                                <span
                                    key={i}
                                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                                    style={{ backgroundColor: getPastelColor(u), color: '#444' }}
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

                                return (
                                    <div
                                        key={m.id}
                                        className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
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
                                            <div className="text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded-lg mb-1 max-w-[85%] truncate border-l-2 border-blue-300">
                                                <span className="font-medium text-blue-600">{replyMsg.sender}</span>
                                                <span className="mx-1">·</span>
                                                {replyMsg.text.slice(0, 40)}{replyMsg.text.length > 40 ? '...' : ''}
                                            </div>
                                        )}

                                        {/* Message bubble */}
                                        <div className="relative w-full" style={{ maxWidth: '85%' }}>
                                            <div
                                                className={`
                                                    text-sm px-3 py-2 rounded-2xl w-fit
                                                    ${isOwn ? 'bg-blue-500 text-white rounded-br-md ml-auto' : 'bg-slate-100 text-slate-800 rounded-bl-md'}
                                                `}
                                            >
                                                {m.text}

                                                {/* Attachments */}
                                                {m.attachments && m.attachments.length > 0 && (
                                                    <div className="flex gap-1 mt-2 flex-wrap">
                                                        {m.attachments.map((path, i) => (
                                                            <img
                                                                key={i}
                                                                src={`/api/preview?path=${encodeURIComponent(path)}`}
                                                                alt=""
                                                                className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80"
                                                                onClick={() => onImageClick?.(path)}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action buttons (visible on hover) - grey icons like Instagram */}
                                            <div className={`absolute top-0 ${isOwn ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} opacity-0 group-hover:opacity-100 flex gap-0.5`}>
                                                <button
                                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                                                    onClick={() => setReplyTo(m)}
                                                    title="Reply"
                                                >
                                                    <Reply size={12} />
                                                </button>
                                                <button
                                                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                                                    onClick={() => setActiveReactionId(activeReactionId === m.id ? null : m.id)}
                                                    title="React"
                                                >
                                                    <Smile size={12} />
                                                </button>
                                            </div>

                                            {/* Reaction picker - fixed positioning */}
                                            {activeReactionId === m.id && (
                                                <div
                                                    className={`absolute ${isOwn ? 'right-0' : 'left-0'} -bottom-8 bg-white border rounded-full shadow-lg px-2 py-1 flex gap-1 z-20`}
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

                    {/* Input */}
                    <div className="flex-shrink-0 p-3 border-t border-slate-100 bg-slate-50">
                        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex gap-2">
                            <Input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder={linkedImages.length > 0 ? "Add a comment..." : "Type a message..."}
                                className="flex-1 h-10 rounded-xl border-slate-200 bg-white text-sm"
                            />
                            <Button
                                type="submit"
                                size="icon"
                                disabled={!chatInput.trim() && linkedImages.length === 0}
                                className="h-10 w-10 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40"
                            >
                                <Send size={14} className="text-white" />
                            </Button>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ChatSidebar;
