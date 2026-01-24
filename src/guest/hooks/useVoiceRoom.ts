import { useState, useEffect, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import {
    fetchRtcConfig,
    createPeerConnection,
    addLocalStreamToPeer,
    createOffer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    getMicrophoneStream,
    stopStream,
    RtcConfig
} from '../utils/rtc';
import { createVAD, VADInstance } from '../utils/audio-vad';

interface PeerConnection {
    socketId: string;
    username: string;
    pc: RTCPeerConnection;
    stream: MediaStream | null;
    candidatesQueue?: RTCIceCandidateInit[];
    lastRestart?: number;
}

export interface VoiceRoomState {
    isActive: boolean;
    isInVoice: boolean;
    isHost: boolean;
    hostSocketId: string | null;
    participantCount: number;
    participants: { socketId: string, username: string, isSpeaking?: boolean }[];
    isMuted: boolean;
    isLocked: boolean;
    isPttEnabled: boolean;
    isSpeaking: boolean;
    isLoading: boolean;
    lastBroadcastReaction: { username: string, color: string, type: string, socketId: string, timestamp: number } | null;
    error: string | null;
    isReconnecting: boolean;
    hostReconnecting: boolean;
}

interface UseVoiceRoomReturn extends VoiceRoomState {
    remoteStreams: Map<string, MediaStream>;
    startVoice: (deviceId?: string) => Promise<void>;
    joinVoice: (deviceId?: string) => Promise<void>;
    leaveVoice: () => void;
    stopVoice: () => void;
    toggleMute: () => void;
    toggleLock: () => void;
    muteAll: () => void;
    kickUser: (targetSocketId: string) => void;
    togglePtt: () => void;
    sendReaction: (type: string) => void;
    reconnectVoice: () => Promise<void>;
}

export function useVoiceRoom(socket: Socket | null, mySocketId: string | null): UseVoiceRoomReturn {
    const [state, setState] = useState<VoiceRoomState>({
        isActive: false,
        isInVoice: false,
        isHost: false,
        hostSocketId: null,
        participantCount: 0,
        participants: [],
        isMuted: false,
        isLocked: false,
        isPttEnabled: false,
        isSpeaking: false,
        isLoading: false,
        lastBroadcastReaction: null,
        error: null,
        isReconnecting: false,
        hostReconnecting: false
    });

    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

    const localStreamRef = useRef<MediaStream | null>(null);
    const peersRef = useRef<Map<string, PeerConnection>>(new Map());
    const rtcConfigRef = useRef<RtcConfig | null>(null);
    const vadRef = useRef<VADInstance | null>(null);
    // Track mute state separately to restore after PTT release
    const wasMutedBeforePttRef = useRef<boolean>(false);

    // Fetch RTC config once on mount
    useEffect(() => {
        fetchRtcConfig().then(config => {
            rtcConfigRef.current = config;
        });
    }, []);

    // Clean up on unmount
    useEffect(() => {
        // use cleanupVoice without args which defaults isRoomEnded=false, 
        // but component unmounting implies we just leave locally.
        return () => {
            // We can't use the stable reference easily inside cleanup return if usage changes
            // checking implementation below
        };
    }, []);

    // We need to move cleanupVoice definition above or use it carefully.
    // Actually standard useCallback approach:

    const cleanupVoice = useCallback((isRoomEnded: boolean = false) => {
        // Use ref for current state logging to avoid dependency
        console.log('[useVoiceRoom] cleanupVoice called', { isRoomEnded });

        // Stop VAD
        if (vadRef.current) {
            vadRef.current.stop();
            vadRef.current = null;
        }

        // Stop local stream
        stopStream(localStreamRef.current);
        localStreamRef.current = null;

        // Close all peer connections
        peersRef.current.forEach(peer => {
            peer.pc.close();
        });
        peersRef.current.clear();

        // Clear remote streams
        setRemoteStreams(new Map());

        setState(prev => {
            console.log('[useVoiceRoom] reset state', {
                wasActive: prev.isActive,
                setActiveTo: isRoomEnded ? false : prev.isActive,
                wasInVoice: prev.isInVoice
            });
            return {
                ...prev,
                isInVoice: false,
                isHost: false,
                isMuted: false,
                isSpeaking: false,
                hostSocketId: isRoomEnded ? null : prev.hostSocketId,
                participantCount: isRoomEnded ? 0 : Math.max(0, prev.participantCount - 1),
                participants: [], // Clear participants list locally
                isActive: isRoomEnded ? false : prev.isActive // Reset room active state if ended
            };
        });
    }, []); // Removed state.isInVoice dependency

    // Effect for unmount ONLY
    useEffect(() => {
        return () => {
            console.log('[useVoiceRoom] unmounting, cleaning up');
            cleanupVoice(false);
        };
    }, [cleanupVoice]);

    // Initialize VAD for local stream
    const initVAD = useCallback((stream: MediaStream) => {
        if (vadRef.current) vadRef.current.stop();

        vadRef.current = createVAD(stream, (isSpeaking) => {
            setState(prev => ({ ...prev, isSpeaking }));

            // Emit speaking state to server
            // Note: createVAD does internal debouncing, but we can double check here
            // Using startVoice/joinVoice closure socket, or refreshed socketRef?
            // We use socket from prop in useEffect below, but here we need access.
            // We can assume socket is stable or use a ref if needed, 
            // but effectively we can't emit from inside this closure easily if socket changes.
            // Actually, we'll emit in a useEffect that watches `state.isSpeaking`.
        });
    }, []);

    // Emit speaking state
    useEffect(() => {
        if (!socket || !state.isInVoice) return;
        // Optimization: only emit if state changed (useEffect does this)
        // But verify sessionId is available? We need roomId.
        // We don't store roomId in state, but we can assume socket knows user.roomId
        // Actually server expects { sessionId, isSpeaking }. 
        // We need roomId (sessionId) available.
        // Let's assume user.roomId is maintained on server, or pass it.
        // The server handler `socket.on('speaking', ({ sessionId, isSpeaking }))` checks `user.roomId`.
        // So we just need to send `sessionId` which is effectively `user.roomId`.
        // BUT we don't have `roomId` in `state`.
        // `GuestApp` has `roomId`. `useVoiceRoom` doesn't strictly track `roomId` but assumes active session.
        // Server checks: `if (user.roomId === sessionId)`.
        // We can pass `roomId` to `useVoiceRoom`, or just fetch it from `socket` ... no.
        // Let's rely on server validating match. We must send *some* sessionId.
        // The `voice-start` etc don't store roomId in logic here.
        // Wait, `socket.on('voice-started', ({ roomId ... }))`. We *should* store roomId.

        // Fix: we don't hold roomId in state. We should, or assume caller context.
        // But for `speaking` event we need to send it.
        // Quick fix: emit payload with placeholder/cached roomId if possible.
        // However, looking at file-server.js: `socket.on('speaking', ...)` uses `sessionId`.
        // Ideally we pass `roomId` into `useVoiceRoom`. `GuestApp` has it.
        // But for this patch, let's update `useVoiceRoom` signature to accept `roomId`.
    }, [state.isSpeaking, socket, state.isInVoice]);

    // Update signature implies breaking change.
    // Alternative: store roomId from `voice-started` / `voice-joined`.
    const roomIdRef = useRef<string | null>(null);

    const restartIce = useCallback(async (targetSocketId: string) => {
        const peer = peersRef.current.get(targetSocketId);
        if (!peer || !socket) return;

        // Prevent restart storms
        const now = Date.now();
        if (peer.lastRestart && now - peer.lastRestart < 5000) {
            console.log(`[WebRTC] Ignoring ICE restart for ${peer.username} (cooldown)`);
            return;
        }
        peer.lastRestart = now;

        console.log(`[WebRTC] Initiating ICE restart for ${peer.username}`);
        setState(prev => ({ ...prev, isReconnecting: true }));
        try {
            const offer = await peer.pc.createOffer({ iceRestart: true });
            await peer.pc.setLocalDescription(offer);
            socket.emit('voice-restart', { toSocketId: targetSocketId, sdp: offer });
        } catch (e) {
            console.error('[WebRTC] ICE Restart failed:', e);
            setState(prev => ({ ...prev, isReconnecting: false }));
        }
    }, [socket]);

    // Create peer connection for a specific remote user
    const createPeerForUser = useCallback(async (
        socketId: string,
        username: string,
        initiator: boolean
    ) => {
        if (!rtcConfigRef.current || !localStreamRef.current) return;

        const pc = createPeerConnection(
            rtcConfigRef.current,
            (candidate) => {
                socket?.emit('voice-ice-candidate', { toSocketId: socketId, candidate });
            },
            (stream) => {
                setRemoteStreams(prev => new Map(prev).set(socketId, stream));
            },
            (connectionState) => {
                if (connectionState === 'failed' || connectionState === 'disconnected') {
                    console.warn(`[WebRTC] Connection to ${username} ${connectionState}`);
                    // Trigger ICE restart on failure
                    if (initiator) {
                        restartIce(socketId);
                    }
                }
            }
        );

        addLocalStreamToPeer(pc, localStreamRef.current);
        // Init with queue for consistency
        peersRef.current.set(socketId, { socketId, username, pc, stream: null, candidatesQueue: [] });

        if (initiator) {
            try {
                const offer = await createOffer(pc);
                socket?.emit('voice-offer', { toSocketId: socketId, sdp: offer });
            } catch (e) {
                console.error('Error creating offer:', e);
            }
        }
    }, [socket, restartIce]);



    // Network Stats Monitoring
    useEffect(() => {
        if (!state.isInVoice) return;

        const interval = setInterval(async () => {
            peersRef.current.forEach(async (peer) => {
                try {
                    const stats = await peer.pc.getStats();
                    let packetsLost = 0;
                    let rtt = 0;

                    stats.forEach(report => {
                        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                            packetsLost += report.packetsLost;
                        }
                        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                            rtt = report.currentRoundTripTime;
                        }
                    });

                    // Simple log for now - in production, show indicator
                    if (rtt > 0.5 || packetsLost > 50) {
                        console.warn(`Poor connection to ${peer.username}: RTT=${rtt}, Loss=${packetsLost}`);
                        // TODO: trigger UI warning
                    }
                } catch (e) { }
            });
        }, 3000);
        return () => clearInterval(interval);
    }, [state.isInVoice]);
    useEffect(() => {
        if (!socket) return;

        // NEW: Voice State Broadcast
        // NEW: Voice State Broadcast
        socket.on('voice-state', (state) => {
            console.log('[useVoiceRoom] Received voice-state', state);
            if (!state.active) {
                // Server says inactive -> Force reset
                cleanupVoice(true);
                return;
            }

            setState(prev => ({
                ...prev,
                isActive: true,
                hostSocketId: state.hostSocketId,
                isHost: socket.id === state.hostSocketId,
                participantCount: state.participantCount,
                isLocked: state.locked,
                hostReconnecting: state.hostReconnecting || false,
                isMuted: prev.isMuted || state.mutedAll // If mutedAll, force mute? Or just track?
                // Note: user.isMuted tracks local preference primarily. 
                // But forced mute might override. 
                // Let's stick to local track for now, but UI shows lock.
            }));

            // If mutedAll is true and we are not host, ensure our track is disabled
            if (state.mutedAll && socket.id !== state.hostSocketId && localStreamRef.current) {
                localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
                setState(prev => ({ ...prev, isMuted: true }));
            }
        });

        socket.on('voice-started', ({ roomId, hostSocketId }) => {
            roomIdRef.current = roomId;
            setState(prev => ({
                ...prev,
                isActive: true,
                hostSocketId,
                participantCount: 1,
                participants: [{ socketId: hostSocketId, username: 'Host' }] // Basic init
            }));
        });

        // Unified ended event
        socket.on('voice-ended', () => {
            console.log('[useVoiceRoom] Received voice-ended event');
            cleanupVoice(true);
        });

        // Use legacy stopped as fallback
        socket.on('voice-stopped', () => {
            cleanupVoice(true);
        });

        socket.on('voice-joined', async ({ socketId, username }) => {
            setState(prev => {
                const exists = prev.participants.some(p => p.socketId === socketId);
                if (exists) return prev;
                return {
                    ...prev,
                    participantCount: prev.participantCount + 1,
                    participants: [...prev.participants, { socketId, username }]
                };
            });
        });

        socket.on('voice-left', ({ socketId }) => {
            const peer = peersRef.current.get(socketId);
            if (peer) {
                peer.pc.close();
                peersRef.current.delete(socketId);
            }

            setRemoteStreams(prev => {
                const next = new Map(prev);
                next.delete(socketId);
                return next;
            });

            setState(prev => ({
                ...prev,
                participantCount: Math.max(0, prev.participantCount - 1),
                participants: prev.participants.filter(p => p.socketId !== socketId)
            }));
        });

        socket.on('voice-offer', async ({ fromSocketId, fromUsername, sdp }) => {
            if (!rtcConfigRef.current || !localStreamRef.current) return;

            // ZOMBIE CLEANUP: If we already have a peer for this user, it's stale.
            // This happens if they reloaded/rejoined and we missed the 'leave' event.
            if (peersRef.current.has(fromSocketId)) {
                console.warn(`[WebRTC] Found zombie peer for ${fromSocketId}, cleaning up before new offer`);
                const oldPeer = peersRef.current.get(fromSocketId);
                oldPeer?.pc.close();
                peersRef.current.delete(fromSocketId);
                setRemoteStreams(prev => {
                    const next = new Map(prev);
                    next.delete(fromSocketId);
                    return next;
                });
            }

            const pc = createPeerConnection(
                rtcConfigRef.current,
                (candidate) => {
                    socket.emit('voice-ice-candidate', { toSocketId: fromSocketId, candidate });
                },
                (stream) => {
                    setRemoteStreams(prev => new Map(prev).set(fromSocketId, stream));
                },
                (state) => { }
            );

            addLocalStreamToPeer(pc, localStreamRef.current);
            // Init with queue
            peersRef.current.set(fromSocketId, { socketId: fromSocketId, username: fromUsername, pc, stream: null, candidatesQueue: [] });

            try {
                const answer = await handleOffer(pc, sdp);
                socket.emit('voice-answer', { toSocketId: fromSocketId, sdp: answer });

                // Process queued candidates
                const peer = peersRef.current.get(fromSocketId);
                if (peer && peer.candidatesQueue) {
                    console.log(`[WebRTC] Processing ${peer.candidatesQueue.length} queued candidates for ${fromSocketId}`);
                    for (const candidate of peer.candidatesQueue) {
                        await handleIceCandidate(peer.pc, candidate);
                    }
                    peer.candidatesQueue = [];
                }

                // Add to participants
                setState(prev => {
                    const exists = prev.participants.some(p => p.socketId === fromSocketId);
                    if (exists) return prev;
                    return { ...prev, participants: [...prev.participants, { socketId: fromSocketId, username: fromUsername }] };
                });
            } catch (e) { console.error(e); }
        });

        socket.on('voice-answer', async ({ fromSocketId, sdp }) => {
            const peer = peersRef.current.get(fromSocketId);
            if (peer) {
                await handleAnswer(peer.pc, sdp);
                // Process queued candidates
                if (peer.candidatesQueue) {
                    console.log(`[WebRTC] Processing ${peer.candidatesQueue.length} queued candidates for ${fromSocketId}`);
                    for (const candidate of peer.candidatesQueue) {
                        await handleIceCandidate(peer.pc, candidate);
                    }
                    peer.candidatesQueue = [];
                }
            }
        });

        socket.on('voice-ice-candidate', async ({ fromSocketId, candidate }) => {
            const peer = peersRef.current.get(fromSocketId);
            if (peer) {
                // Queue candidate if remote description not yet set
                if (!peer.pc.remoteDescription?.type) {
                    console.log(`[WebRTC] Queuing ICE candidate for ${fromSocketId} (no remote description)`);
                    if (!peer.candidatesQueue) peer.candidatesQueue = [];
                    peer.candidatesQueue.push(candidate);
                } else {
                    await handleIceCandidate(peer.pc, candidate);
                }
            }
        });

        socket.on('voice-restart', async ({ fromSocketId, sdp }) => {
            console.log(`[WebRTC] Received ICE restart offer from ${fromSocketId}`);
            const peer = peersRef.current.get(fromSocketId);
            if (peer) {
                try {
                    // Check logic for Glare/Stable state
                    if (peer.pc.signalingState !== 'stable') {
                        console.warn(`[WebRTC] Received restart offer but state is ${peer.pc.signalingState} - rolling back`);
                        await peer.pc.setLocalDescription({ type: 'rollback' });
                    }

                    const answer = await handleOffer(peer.pc, sdp);
                    socket.emit('voice-answer', { toSocketId: fromSocketId, sdp: answer });

                    // Flush any queued candidates
                    if (peer.candidatesQueue && peer.candidatesQueue.length > 0) {
                        for (const candidate of peer.candidatesQueue) {
                            await handleIceCandidate(peer.pc, candidate);
                        }
                        peer.candidatesQueue = [];
                    }
                    setState(prev => ({ ...prev, isReconnecting: false }));
                } catch (e) { console.error('[WebRTC] Error handling ICE restart:', e); }
            }
        });

        socket.on('voice-locked', () => setState(prev => ({ ...prev, isLocked: true })));
        socket.on('voice-unlocked', () => setState(prev => ({ ...prev, isLocked: false })));

        socket.on('voice-muted-all', () => {
            if (localStreamRef.current && socket.id !== state.hostSocketId) {
                localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
                setState(prev => ({ ...prev, isMuted: true }));
            }
        });

        socket.on('voice-unmuted', () => {
            // Optional: Allow unmute? Or auto-unmute?
            // Usually just lift the 'ban'. User stays muted until they click.
            // But for PTT, we might want to stay ready.
            // For now, no auto-action, just allowed.
        });

        socket.on('voice-kicked', () => {
            cleanupVoice();
            // Trigger toast in UI via error state or dedicated event?
            setState(prev => ({ ...prev, error: 'You were removed from the voice room' }));
        });

        socket.on('voice-speaking', ({ socketId, isSpeaking }) => {
            setState(prev => ({
                ...prev,
                participants: prev.participants.map(p =>
                    p.socketId === socketId ? { ...p, isSpeaking } : p
                )
            }));
        });

        socket.on('reaction-broadcast', (reaction) => {
            setState(prev => ({ ...prev, lastBroadcastReaction: { ...reaction, timestamp: Date.now() } }));
        });

        return () => {
            socket.off('voice-state');
            socket.off('voice-started');
            socket.off('voice-ended');
            socket.off('voice-stopped');
            socket.off('voice-joined');
            socket.off('voice-left');
            socket.off('voice-offer');
            socket.off('voice-answer');
            socket.off('voice-ice-candidate');
            socket.off('voice-restart');
            socket.off('voice-locked');
            socket.off('voice-unlocked');
            socket.off('voice-muted-all');
            socket.off('voice-unmuted');
            socket.off('voice-kicked');
            socket.off('voice-speaking');
            socket.off('reaction-broadcast');
        };
    }, [socket, cleanupVoice, state.hostSocketId]); // depend on hostId to correct mute logic

    // Debounced Speaking Emission
    useEffect(() => {
        if (!roomIdRef.current || !socket || !state.isInVoice) return;
        // Simple throttle/debounce or rely on VAD change frequency
        socket.emit('speaking', { isSpeaking: state.isSpeaking });
    }, [state.isSpeaking, socket, state.isInVoice]);

    const startVoice = useCallback(async (deviceId?: string) => {
        if (!socket) return;
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        try {
            const stream = await getMicrophoneStream(deviceId);
            localStreamRef.current = stream;
            initVAD(stream);

            socket.emit('voice-start', {}, (res: any) => {
                if (res.success) {
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        isActive: true, // Explicitly set active
                        isHost: true,
                        isInVoice: true,
                        hostSocketId: socket.id || null
                    }));
                } else {
                    stopStream(stream);
                    localStreamRef.current = null;
                    setState(prev => ({ ...prev, isLoading: false, error: res.error }));
                }
            });
        } catch (e: any) {
            setState(prev => ({ ...prev, isLoading: false, error: e.message || 'Mic error' }));
        }
    }, [socket, initVAD]);

    // Sync voice state with server on connect/reconnect
    useEffect(() => {
        if (!socket) return;

        const checkVoiceStatus = () => {
            fetch('/api/voice-status')
                .then(res => res.json())
                .then(data => {
                    // Update external active state
                    if (!data.active && state.isActive) {
                        // Server says inactive, but we think active -> Reset
                        cleanupVoice(true);
                    } else if (data.active && !state.isActive) {
                        setState(prev => ({
                            ...prev,
                            isActive: true,
                            hostSocketId: data.hostSocketId,
                            participantCount: data.participantCount
                        }));
                    }
                })
                .catch(err => console.error('Failed to sync voice status', err));
        };

        checkVoiceStatus();
        socket.on('connect', checkVoiceStatus);

        return () => {
            socket.off('connect', checkVoiceStatus);
        };
    }, [socket, state.isActive, cleanupVoice]);

    const joinVoice = useCallback(async (deviceId?: string) => {
        if (!socket) return;
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        try {
            const stream = await getMicrophoneStream(deviceId);
            localStreamRef.current = stream;
            initVAD(stream);

            socket.emit('voice-join', {}, async (res: any) => {
                if (res.success) {
                    setState(prev => ({
                        ...prev,
                        isActive: true, // Explicitly set active
                        isInVoice: true,
                        isHost: res.hostSocketId === socket.id,
                        hostSocketId: res.hostSocketId,
                        participantCount: (res.participants?.length || 0) + 1,
                        isLoading: false,
                        participants: res.participants || []
                    }));

                    for (const p of res.participants || []) {
                        await createPeerForUser(p.socketId, p.username, true);
                    }
                } else {
                    stopStream(stream);
                    localStreamRef.current = null;

                    // If error indicates room is gone, reset state
                    if (res.error === 'No active voice room') {
                        cleanupVoice(true);
                    }

                    setState(prev => ({ ...prev, isLoading: false, error: res.error }));
                }
            });
        } catch (e: any) {
            setState(prev => ({ ...prev, isLoading: false, error: e.message || 'Mic error' }));
        }
    }, [socket, createPeerForUser, initVAD, cleanupVoice]);

    const reconnectVoice = useCallback(async () => {
        if (!socket || !state.isInVoice) return;

        // If we still have a local stream, re-use it
        if (!localStreamRef.current) {
            // Try to acquire again
            try {
                const stream = await getMicrophoneStream();
                localStreamRef.current = stream;
                initVAD(stream);
            } catch (e) {
                console.error('Failed to re-acquire mic for reconnect', e);
                return;
            }
        }

        // Emit join again without full state reset
        socket.emit('voice-join', {}, async (res: any) => {
            if (res.success) {
                setState(prev => ({
                    ...prev,
                    isHost: res.hostSocketId === socket.id,
                    hostSocketId: res.hostSocketId,
                    participantCount: (res.participants?.length || 0) + 1,
                    participants: res.participants || []
                }));

                // Re-establish peers
                // Clear old peers first?
                peersRef.current.forEach(peer => peer.pc.close());
                peersRef.current.clear();
                setRemoteStreams(new Map());

                for (const p of res.participants || []) {
                    await createPeerForUser(p.socketId, p.username, true);
                }
            } else {
                // Failed to rejoin - maybe room gone, treat as ended locally
                cleanupVoice(true);
                setState(prev => ({ ...prev, error: 'Voice session lost' }));
            }
        });
    }, [socket, state.isInVoice, createPeerForUser, initVAD, cleanupVoice]);

    const leaveVoice = useCallback(() => {
        socket?.emit('voice-leave');
        cleanupVoice(false);
    }, [socket, cleanupVoice]);

    const stopVoice = useCallback(() => {
        console.log('[useVoiceRoom] stopVoice called (User action)');
        // Use voice-end for host
        socket?.emit('voice-end');
        cleanupVoice(true);
    }, [socket, cleanupVoice]);

    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setState(prev => ({ ...prev, isMuted: !track.enabled }));
            }
        }
    }, []);

    const toggleLock = useCallback(() => {
        if (!state.isHost) return;
        console.log('[useVoiceRoom] toggleLock called', { currentLocked: state.isLocked });
        socket?.emit(state.isLocked ? 'voice-unlock' : 'voice-lock');
    }, [socket, state.isHost, state.isLocked]);

    const muteAll = useCallback(() => {
        if (!state.isHost) return;
        console.log('[useVoiceRoom] muteAll called');
        socket?.emit('voice-mute-all');
    }, [socket, state.isHost]);

    const kickUser = useCallback((targetSocketId: string) => {
        if (!state.isHost) return;
        console.log('[useVoiceRoom] kickUser called', { targetSocketId });
        socket?.emit('voice-kick', { targetSocketId });
    }, [socket, state.isHost]);

    const sendReaction = useCallback((type: string) => {
        // No local state update!
        socket?.emit('reaction', { type });
    }, [socket]);

    const togglePtt = useCallback(() => {
        setState(prev => {
            const nextPtt = !prev.isPttEnabled;
            if (nextPtt) {
                // Determine if we should mute
                // Normal PTT behavior: mute on enable. 
                if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
                return { ...prev, isPttEnabled: true, isMuted: true };
            } else {
                if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(t => t.enabled = true);
                return { ...prev, isPttEnabled: false, isMuted: false };
            }
        });
    }, []);

    // PTT Keyboard Listener
    useEffect(() => {
        if (!state.isPttEnabled || !state.isInVoice) return;

        // Disable PTT on mobile (touch devices)
        const isMobile = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        if (isMobile) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat) {
                const target = e.target as HTMLElement;
                // Guard: check if focusing input/textarea or contentEditable
                if (target.matches('input, textarea, [contenteditable="true"]')) return;

                e.preventDefault();
                if (localStreamRef.current) {
                    localStreamRef.current.getAudioTracks().forEach(t => t.enabled = true);
                    setState(prev => ({ ...prev, isMuted: false }));
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                const target = e.target as HTMLElement;
                if (target.matches('input, textarea, [contenteditable="true"]')) return;

                if (localStreamRef.current) {
                    localStreamRef.current.getAudioTracks().forEach(t => t.enabled = false);
                    setState(prev => ({ ...prev, isMuted: true }));
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [state.isPttEnabled, state.isInVoice]);

    return {
        ...state,
        remoteStreams,
        startVoice,
        joinVoice,
        leaveVoice,
        stopVoice,
        toggleMute,
        toggleLock,
        muteAll,
        kickUser,
        togglePtt,
        sendReaction,
        reconnectVoice
    };
}


