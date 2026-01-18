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

interface PeerConnection {
    socketId: string;
    username: string;
    pc: RTCPeerConnection;
    stream: MediaStream | null;
}

interface VoiceRoomState {
    isActive: boolean;
    isInVoice: boolean;
    isHost: boolean;
    hostSocketId: string | null;
    participantCount: number;
    isMuted: boolean;
    isLoading: boolean;
    error: string | null;
}

interface UseVoiceRoomReturn extends VoiceRoomState {
    remoteStreams: Map<string, MediaStream>;
    startVoice: () => Promise<void>;
    joinVoice: () => Promise<void>;
    leaveVoice: () => void;
    stopVoice: () => void;
    toggleMute: () => void;
}

export function useVoiceRoom(socket: Socket | null, mySocketId: string | null): UseVoiceRoomReturn {
    const [state, setState] = useState<VoiceRoomState>({
        isActive: false,
        isInVoice: false,
        isHost: false,
        hostSocketId: null,
        participantCount: 0,
        isMuted: false,
        isLoading: false,
        error: null
    });

    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

    const localStreamRef = useRef<MediaStream | null>(null);
    const peersRef = useRef<Map<string, PeerConnection>>(new Map());
    const rtcConfigRef = useRef<RtcConfig | null>(null);

    // Fetch RTC config once on mount
    useEffect(() => {
        fetchRtcConfig().then(config => {
            rtcConfigRef.current = config;
        });
    }, []);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            cleanupVoice();
        };
    }, []);

    const cleanupVoice = useCallback(() => {
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

        setState(prev => ({
            ...prev,
            isInVoice: false,
            isHost: false,
            isMuted: false
        }));
    }, []);

    // Create peer connection for a specific remote user
    const createPeerForUser = useCallback(async (
        socketId: string,
        username: string,
        initiator: boolean
    ) => {
        if (!rtcConfigRef.current || !localStreamRef.current) return;

        const pc = createPeerConnection(
            rtcConfigRef.current,
            // ICE candidate callback
            (candidate) => {
                socket?.emit('voice-ice-candidate', { toSocketId: socketId, candidate });
            },
            // Track callback - remote stream received
            (stream) => {
                setRemoteStreams(prev => new Map(prev).set(socketId, stream));
            },
            // Connection state change
            (connectionState: RTCPeerConnectionState) => {
                console.log(`Peer ${socketId} connection state:`, connectionState);
                if (connectionState === 'failed' || connectionState === 'disconnected') {
                    // Try to reconnect or handle gracefully
                    console.warn(`Connection to ${username} ${connectionState}`);
                }
            }
        );

        // Add local tracks
        addLocalStreamToPeer(pc, localStreamRef.current);

        // Store peer connection
        peersRef.current.set(socketId, { socketId, username, pc, stream: null });

        // If initiator, create and send offer
        if (initiator) {
            try {
                const offer = await createOffer(pc);
                socket?.emit('voice-offer', { toSocketId: socketId, sdp: offer });
            } catch (e) {
                console.error('Error creating offer:', e);
            }
        }
    }, [socket]);

    // Handle signaling events
    useEffect(() => {
        if (!socket) return;

        // Voice room started by someone (also sent on join-session if room is active)
        socket.on('voice-started', ({ roomId, hostSocketId, hostUsername, participantCount }) => {
            setState(prev => ({
                ...prev,
                isActive: true,
                hostSocketId,
                participantCount: participantCount || 1
            }));
        });

        // Voice room stopped
        socket.on('voice-stopped', ({ roomId }) => {
            cleanupVoice();
            setState(prev => ({
                ...prev,
                isActive: false,
                isInVoice: false,
                isHost: false,
                hostSocketId: null,
                participantCount: 0
            }));
        });

        // Someone joined the voice room
        socket.on('voice-joined', async ({ socketId, username }) => {
            setState(prev => ({
                ...prev,
                participantCount: prev.participantCount + 1
            }));

            // If we're in voice, create peer connection (they will send offer)
            if (localStreamRef.current) {
                // Wait for their offer, don't initiate
            }
        });

        // Someone left the voice room
        socket.on('voice-left', ({ socketId, username }) => {
            // Close peer connection
            const peer = peersRef.current.get(socketId);
            if (peer) {
                peer.pc.close();
                peersRef.current.delete(socketId);
            }

            // Remove remote stream
            setRemoteStreams(prev => {
                const next = new Map(prev);
                next.delete(socketId);
                return next;
            });

            setState(prev => ({
                ...prev,
                participantCount: Math.max(0, prev.participantCount - 1)
            }));
        });

        // Receive offer from peer
        socket.on('voice-offer', async ({ fromSocketId, fromUsername, sdp }) => {
            if (!rtcConfigRef.current || !localStreamRef.current) return;

            // Create peer connection for this user
            const pc = createPeerConnection(
                rtcConfigRef.current,
                (candidate: RTCIceCandidate) => {
                    socket.emit('voice-ice-candidate', { toSocketId: fromSocketId, candidate });
                },
                (stream: MediaStream) => {
                    setRemoteStreams(prev => new Map(prev).set(fromSocketId, stream));
                },
                (connectionState: RTCPeerConnectionState) => {
                    console.log(`Peer ${fromSocketId} connection state:`, connectionState);
                }
            );

            addLocalStreamToPeer(pc, localStreamRef.current);
            peersRef.current.set(fromSocketId, { socketId: fromSocketId, username: fromUsername, pc, stream: null });

            try {
                const answer = await handleOffer(pc, sdp);
                socket.emit('voice-answer', { toSocketId: fromSocketId, sdp: answer });
            } catch (e) {
                console.error('Error handling offer:', e);
            }
        });

        // Receive answer from peer
        socket.on('voice-answer', async ({ fromSocketId, sdp }) => {
            const peer = peersRef.current.get(fromSocketId);
            if (peer) {
                try {
                    await handleAnswer(peer.pc, sdp);
                } catch (e) {
                    console.error('Error handling answer:', e);
                }
            }
        });

        // Receive ICE candidate from peer
        socket.on('voice-ice-candidate', async ({ fromSocketId, candidate }) => {
            const peer = peersRef.current.get(fromSocketId);
            if (peer) {
                try {
                    await handleIceCandidate(peer.pc, candidate);
                } catch (e) {
                    console.error('Error handling ICE candidate:', e);
                }
            }
        });

        return () => {
            socket.off('voice-started');
            socket.off('voice-stopped');
            socket.off('voice-joined');
            socket.off('voice-left');
            socket.off('voice-offer');
            socket.off('voice-answer');
            socket.off('voice-ice-candidate');
        };
    }, [socket, cleanupVoice]);

    // Start voice room (become host)
    const startVoice = useCallback(async () => {
        if (!socket) return;

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // Get microphone access
            const stream = await getMicrophoneStream();
            localStreamRef.current = stream;

            // Request to start voice room
            socket.emit('voice-start', {}, (res: { success: boolean; error?: string }) => {
                if (res.success) {
                    setState(prev => ({
                        ...prev,
                        isActive: true,
                        isInVoice: true,
                        isHost: true,
                        hostSocketId: mySocketId,
                        participantCount: 1,
                        isLoading: false
                    }));
                } else {
                    stopStream(stream);
                    localStreamRef.current = null;
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        error: res.error || 'Failed to start voice room'
                    }));
                }
            });
        } catch (e: any) {
            console.error('Error starting voice:', e);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: e.message || 'Microphone access denied'
            }));
        }
    }, [socket, mySocketId]);

    // Join existing voice room
    const joinVoice = useCallback(async () => {
        if (!socket) return;

        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // Get microphone access
            const stream = await getMicrophoneStream();
            localStreamRef.current = stream;

            // Request to join voice room
            socket.emit('voice-join', {}, async (res: {
                success: boolean;
                error?: string;
                participants?: Array<{ socketId: string; username: string }>;
                hostSocketId?: string;
            }) => {
                if (res.success) {
                    setState(prev => ({
                        ...prev,
                        isInVoice: true,
                        isHost: false,
                        hostSocketId: res.hostSocketId || prev.hostSocketId,
                        participantCount: (res.participants?.length || 0) + 1,
                        isLoading: false
                    }));

                    // Create peer connections to existing participants
                    for (const participant of res.participants || []) {
                        await createPeerForUser(participant.socketId, participant.username, true);
                    }
                } else {
                    stopStream(stream);
                    localStreamRef.current = null;
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        error: res.error || 'Failed to join voice room'
                    }));
                }
            });
        } catch (e: any) {
            console.error('Error joining voice:', e);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: e.message || 'Microphone access denied'
            }));
        }
    }, [socket, createPeerForUser]);

    // Leave voice room
    const leaveVoice = useCallback(() => {
        socket?.emit('voice-leave', {}, () => {
            cleanupVoice();
        });
    }, [socket, cleanupVoice]);

    // Stop voice room (host only)
    const stopVoice = useCallback(() => {
        socket?.emit('voice-stop', {}, () => {
            cleanupVoice();
            setState(prev => ({
                ...prev,
                isActive: false,
                participantCount: 0
            }));
        });
    }, [socket, cleanupVoice]);

    // Toggle mute
    const toggleMute = useCallback(() => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setState(prev => ({ ...prev, isMuted: !audioTrack.enabled }));
            }
        }
    }, []);

    return {
        ...state,
        remoteStreams,
        startVoice,
        joinVoice,
        leaveVoice,
        stopVoice,
        toggleMute
    };
}
