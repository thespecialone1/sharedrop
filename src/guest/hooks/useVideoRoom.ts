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
    stopStream,
    RtcConfig
} from '../utils/rtc';

interface PeerConnection {
    socketId: string;
    username: string;
    pc: RTCPeerConnection;
    stream: MediaStream | null;
    candidatesQueue?: RTCIceCandidateInit[];
    lastRestart?: number;
}

export interface VideoRoomState {
    isActive: boolean;
    isInVideo: boolean;
    isHost: boolean;
    hostSocketId: string | null;
    participantCount: number;
    participants: { socketId: string, username: string }[];
    isMuted: boolean;
    isCameraOff: boolean;
    isLoading: boolean;
    error: string | null;
    isReconnecting: boolean;
}

interface UseVideoRoomReturn extends VideoRoomState {
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    startVideo: (deviceId?: string) => Promise<void>;
    joinVideo: (deviceId?: string) => Promise<void>;
    leaveVideo: () => void;
    toggleMute: () => void;
    toggleCamera: () => void;
    error: string | null;
}

export function useVideoRoom(socket: Socket | null, mySocketId: string | null): UseVideoRoomReturn {
    const [state, setState] = useState<VideoRoomState>({
        isActive: false,
        isInVideo: false,
        isHost: false,
        hostSocketId: null,
        participantCount: 0,
        participants: [],
        isMuted: false,
        isCameraOff: false,
        isLoading: false,
        error: null,
        isReconnecting: false
    });

    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    // Expose local stream in state for UI rendering
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);

    const peersRef = useRef<Map<string, PeerConnection>>(new Map());
    const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const rtcConfigRef = useRef<RtcConfig | null>(null);

    // Fetch RTC config once on mount
    useEffect(() => {
        fetchRtcConfig().then(config => {
            rtcConfigRef.current = config;
        });
    }, []);

    const cleanupVideo = useCallback((isRoomEnded: boolean = false) => {
        console.log('[useVideoRoom] cleanupVideo called', { isRoomEnded });

        stopStream(localStreamRef.current);
        localStreamRef.current = null;
        setLocalStream(null);

        peersRef.current.forEach(peer => {
            peer.pc.close();
        });
        peersRef.current.clear();
        pendingCandidatesRef.current.clear();
        setRemoteStreams(new Map());

        setState(prev => ({
            ...prev,
            isInVideo: false,
            isHost: false,
            isMuted: false,
            isCameraOff: false,
            hostSocketId: isRoomEnded ? null : prev.hostSocketId,
            participantCount: isRoomEnded ? 0 : Math.max(0, prev.participantCount - 1),
            participants: [],
            isActive: isRoomEnded ? false : prev.isActive
        }));
    }, []);

    // Effect for unmount
    useEffect(() => {
        return () => {
            cleanupVideo(false);
        };
    }, [cleanupVideo]);

    const createPeerForUser = useCallback(async (
        socketId: string,
        username: string,
        initiator: boolean
    ) => {
        if (!rtcConfigRef.current || !localStreamRef.current) return;

        const pc = createPeerConnection(
            rtcConfigRef.current,
            (candidate) => {
                socket?.emit('video-ice-candidate', { toSocketId: socketId, candidate });
            },
            (stream) => {
                setRemoteStreams(prev => new Map(prev).set(socketId, stream));
            },
            (connectionState) => {
                if (connectionState === 'failed' || connectionState === 'disconnected') {
                    console.warn(`[WebRTC] Connection to ${username} ${connectionState}`);
                    // Could trigger restart logic here
                }
            }
        );

        // Add local tracks
        localStreamRef.current.getTracks().forEach(track => {
            if (localStreamRef.current) {
                pc.addTrack(track, localStreamRef.current);
            }
        });

        // Flush any pending candidates for this user
        const pending = pendingCandidatesRef.current.get(socketId);
        if (pending && pending.length > 0) {
            console.log(`[WebRTC] Flushing ${pending.length} pending candidates for ${username}`);
            pending.forEach(c => handleIceCandidate(pc, c));
            pendingCandidatesRef.current.delete(socketId);
        }

        peersRef.current.set(socketId, { socketId, username, pc, stream: null, candidatesQueue: [] });

        if (initiator) {
            try {
                const offer = await createOffer(pc);
                socket?.emit('video-offer', { toSocketId: socketId, sdp: offer });
            } catch (e) {
                console.error('Error creating offer:', e);
            }
        }
    }, [socket]);

    useEffect(() => {
        if (!socket) return;

        const handleConnect = () => {
            console.log('[useVideoRoom] Connected. Requesting video state.');
            socket.emit('video-get-state');
        };

        socket.on('connect', handleConnect);

        // Also request immediately if already connected
        if (socket.connected) {
            handleConnect();
        }

        socket.on('video-state', (data) => {
            // Sync state on join/reconnect
            if (!data.active && state.isActive) {
                cleanupVideo(true);
            } else if (data.active) {
                setState(prev => ({
                    ...prev,
                    isActive: true,
                    hostSocketId: data.hostSocketId,
                    participantCount: data.participants.length
                }));
            }
        });

        socket.on('video-started', ({ roomId, host }) => {
            setState(prev => ({
                ...prev,
                isActive: true,
                hostSocketId: host.socketId,
                participantCount: 1,
                participants: [{ socketId: host.socketId, username: host.username }]
            }));
        });

        socket.on('video-ended', () => {
            cleanupVideo(true);
        });

        socket.on('video-joined', ({ participant }) => {
            setState(prev => {
                const exists = prev.participants.some(p => p.socketId === participant.socketId);
                if (exists) return prev;
                return {
                    ...prev,
                    participantCount: prev.participantCount + 1,
                    participants: [...prev.participants, participant]
                };
            });
        });

        socket.on('video-left', ({ participant }) => {
            const peer = peersRef.current.get(participant.socketId);
            if (peer) {
                peer.pc.close();
                peersRef.current.delete(participant.socketId);
            }
            setRemoteStreams(prev => {
                const next = new Map(prev);
                next.delete(participant.socketId);
                return next;
            });
            setState(prev => ({
                ...prev,
                participantCount: Math.max(0, prev.participantCount - 1),
                participants: prev.participants.filter(p => p.socketId !== participant.socketId)
            }));
        });

        // Signaling handlers
        socket.on('video-offer', async ({ fromSocketId, fromUsername, sdp }) => {
            if (!rtcConfigRef.current || !localStreamRef.current) return;

            // Cleanup zombies
            if (peersRef.current.has(fromSocketId)) {
                peersRef.current.get(fromSocketId)?.pc.close();
                peersRef.current.delete(fromSocketId);
            }

            const pc = createPeerConnection(
                rtcConfigRef.current,
                (candidate) => socket.emit('video-ice-candidate', { toSocketId: fromSocketId, candidate }),
                (stream) => setRemoteStreams(prev => new Map(prev).set(fromSocketId, stream))
            );

            // Add local tracks
            localStreamRef.current.getTracks().forEach(track => {
                if (localStreamRef.current) pc.addTrack(track, localStreamRef.current);
            });

            peersRef.current.set(fromSocketId, { socketId: fromSocketId, username: fromUsername, pc, stream: null, candidatesQueue: [] });

            try {
                const answer = await handleOffer(pc, sdp);
                socket.emit('video-answer', { toSocketId: fromSocketId, sdp: answer });

                // FLush candidates
                const peer = peersRef.current.get(fromSocketId);
                if (peer && peer.candidatesQueue) {
                    for (const c of peer.candidatesQueue) await handleIceCandidate(pc, c);
                    peer.candidatesQueue = [];
                }

                setState(prev => {
                    const exists = prev.participants.some(p => p.socketId === fromSocketId);
                    if (exists) return prev;
                    return { ...prev, participants: [...prev.participants, { socketId: fromSocketId, username: fromUsername }] };
                });

            } catch (e) { console.error(e); }
        });

        socket.on('video-answer', async ({ fromSocketId, sdp }) => {
            const peer = peersRef.current.get(fromSocketId);
            if (peer) {
                await handleAnswer(peer.pc, sdp);
                if (peer.candidatesQueue) {
                    for (const c of peer.candidatesQueue) await handleIceCandidate(peer.pc, c);
                    peer.candidatesQueue = [];
                }
            }
        });

        socket.on('video-ice-candidate', async ({ fromSocketId, candidate }) => {
            const peer = peersRef.current.get(fromSocketId);
            if (peer) {
                if (!peer.pc.remoteDescription?.type) {
                    if (!peer.candidatesQueue) peer.candidatesQueue = [];
                    peer.candidatesQueue.push(candidate);
                } else {
                    await handleIceCandidate(peer.pc, candidate);
                }
            } else {
                // Queue candidate if peer not yet created (race condition)
                console.log(`[WebRTC] Queueing candidate for unknown peer ${fromSocketId}`);
                if (!pendingCandidatesRef.current.has(fromSocketId)) {
                    pendingCandidatesRef.current.set(fromSocketId, []);
                }
                pendingCandidatesRef.current.get(fromSocketId)?.push(candidate);
            }
        });

        return () => {
            socket.off('video-state');
            socket.off('video-started');
            socket.off('video-ended');
            socket.off('video-joined');
            socket.off('video-left');
            socket.off('video-offer');
            socket.off('video-answer');
            socket.off('video-ice-candidate');
        };
    }, [socket, createPeerForUser, cleanupVideo, state.isActive]);

    const startVideo = useCallback(async (deviceId?: string) => {
        if (!socket) return;
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: { width: 640, height: 360, frameRate: 24 }
            });
            localStreamRef.current = stream;
            setLocalStream(stream);

            socket.emit('video-start', {}, (res: any) => {
                if (res.success) {
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        isActive: true,
                        isHost: true,
                        isInVideo: true,
                        hostSocketId: socket.id || null
                    }));
                } else {
                    stopStream(stream);
                    localStreamRef.current = null;
                    setLocalStream(null);
                    setState(prev => ({ ...prev, isLoading: false, error: res.error }));
                }
            });
        } catch (e: any) {
            setState(prev => ({ ...prev, isLoading: false, error: e.message || 'Camera error' }));
        }
    }, [socket]);

    const joinVideo = useCallback(async () => {
        if (!socket) return;
        setState(prev => ({ ...prev, isLoading: true, error: null }));
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: { width: 640, height: 360, frameRate: 24 }
            });
            localStreamRef.current = stream;
            setLocalStream(stream);

            socket.emit('video-join', {}, async (res: any) => {
                if (res.success) {
                    setState(prev => ({
                        ...prev,
                        isActive: true,
                        isInVideo: true,
                        isHost: res.hostSocketId === socket.id,
                        hostSocketId: res.hostSocketId || null,
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
                    setLocalStream(null);
                    setState(prev => ({ ...prev, isLoading: false, error: res.error }));
                }
            });
        } catch (e: any) {
            setState(prev => ({ ...prev, isLoading: false, error: e.message || 'Camera error' }));
        }
    }, [socket, createPeerForUser]);

    const leaveVideo = useCallback(() => {
        socket?.emit('video-leave');
        cleanupVideo(false);
    }, [socket, cleanupVideo]);

    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setState(prev => ({ ...prev, isMuted: !track.enabled }));
            }
        }
    }, []);

    const toggleCamera = useCallback(() => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getVideoTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setState(prev => ({ ...prev, isCameraOff: !track.enabled }));
            }
        }
    }, []);

    return {
        ...state,
        localStream,
        remoteStreams,
        startVideo,
        joinVideo,
        leaveVideo,
        toggleMute,
        toggleCamera,
        error: state.error
    };
}
