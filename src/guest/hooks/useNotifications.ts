import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';

export interface NotificationItem {
    id: string;
    title: string;
    message?: string;
    type: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
    action?: () => void;
}

export interface VoiceBannerState {
    show: boolean;
    hostName: string;
    sessionId: string;
}

export function useNotifications(socket: Socket | null, currentSessionId: string | null, currentUsername: string | null) {
    const [toasts, setToasts] = useState<NotificationItem[]>([]);
    const [voiceBanner, setVoiceBanner] = useState<VoiceBannerState | null>(null);
    const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

    // Permission state
    const permissionRef = useRef<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );

    const requestPermission = useCallback(async () => {
        if (typeof Notification !== 'undefined' && permissionRef.current === 'default') {
            const result = await Notification.requestPermission();
            permissionRef.current = result;
        }
    }, []);

    const addToast = useCallback((toast: Omit<NotificationItem, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { ...toast, id }]);
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const dismissVoiceBanner = useCallback(() => {
        setVoiceBanner(null);
    }, []);

    // Play subtle sound
    const playNotificationSound = useCallback(() => {
        try {
            const audio = new Audio('/sounds/pop.mp3'); // We might not have this, fallback to silent or generic
            // Or use oscillator if file not present, but let's stick to visual first or use simple beep logic
        } catch (e) { }
    }, []);

    // System Notification Helper
    const showSystemNotification = useCallback((title: string, body?: string, onClick?: () => void) => {
        if (document.hidden && permissionRef.current === 'granted') {
            try {
                const n = new Notification(title, {
                    body,
                    icon: '/branding/mascot-master-192.png', // Assuming this exists
                    silent: false
                });
                if (onClick) {
                    n.onclick = () => {
                        window.focus();
                        onClick();
                        n.close();
                    };
                }
            } catch (e) { console.error(e); }
        }
    }, []);

    useEffect(() => {
        if (!socket) return;

        const handleNewMessage = (data: any) => {
            // data: { sessionId, messageId, from: { username }, preview, sentAt }
            const { from, preview, sessionId } = data;

            // Filter out own messages
            if (currentUsername && from.username === currentUsername) return;

            // Increment unread if chat not open (handled by consumer usually, but we can track flag)
            // consumer logic will be: if (!isSidebarOpen) setHasUnreadMessages(true)

            // Show toast if sidebar is closed OR document hidden
            // But we don't know sidebar state here inside hook easily unless passed.
            // We usually act as the data provider.

            // Always dispatch system notification if hidden
            if (document.hidden) {
                showSystemNotification(`Message from ${from.username}`, preview);
            } else {
                // If document visible, we let the UI decide based on Sidebar state.
                // But we can trigger a "toast request" that the UI filters?
                // Or we just expose `addToast` and let the effect in Component handle logic with access to `isSidebarOpen`.
            }
        };

        const handleVoiceStarted = (data: any) => {
            const { host, sessionId, isResume } = data;

            // Filter out own voice start events
            if (currentUsername && host.username === currentUsername) return;

            // Show sticky banner
            setVoiceBanner({
                show: true,
                hostName: host.username,
                sessionId
            });

            if (document.hidden && !isResume) {
                showSystemNotification('Voice Chat Started', `${host.username} started a voice chat`, () => {
                    // Action handled by click
                });
            }
        };

        const handleVoiceEnded = () => {
            setVoiceBanner(null);
        };

        socket.on('notification:new-message', handleNewMessage);
        socket.on('notification:voice-started', handleVoiceStarted);
        socket.on('notification:voice-ended', handleVoiceEnded);

        return () => {
            socket.off('notification:new-message', handleNewMessage);
            socket.off('notification:voice-started', handleVoiceStarted);
            socket.off('notification:voice-ended', handleVoiceEnded);
        };
    }, [socket, showSystemNotification, currentUsername]);

    return {
        toasts,
        voiceBanner,
        addToast,
        dismissToast,
        dismissVoiceBanner,
        requestPermission,
        hasUnreadMessages,
        setHasUnreadMessages
    };
}
