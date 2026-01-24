/**
 * WebRTC utilities for Voice Room feature
 * Mesh topology: each peer connects directly to all other peers
 */

export interface IceServer {
    urls: string;
    username?: string;
    credential?: string;
}

export interface RtcConfig {
    iceServers: IceServer[];
}

/**
 * Fetch ICE server configuration from backend
 */
export async function fetchRtcConfig(): Promise<RtcConfig> {
    const defaultServers = [
        { urls: 'stun:stun.l.google.com:19302' }
    ];

    try {
        const res = await fetch('/api/rtc-config');
        if (!res.ok) throw new Error('Failed to fetch RTC config');

        const config = await res.json();

        // Strict validation: must be array of objects with urls
        const servers = Array.isArray(config?.iceServers) ? config.iceServers : [];
        const validServers = servers.filter((s: any) => s && (s.urls || s.url));

        if (!validServers.length) {
            console.warn('[WebRTC] Invalid remote config, using defaults');
            return { iceServers: defaultServers };
        }

        // Warning removed per user preference
        console.log('[WebRTC] Using remote ICE config', { iceServers: validServers });
        return { iceServers: validServers };
    } catch (e) {
        console.warn('RTC config fetch failed, using default STUN:', e);
        console.log('[WebRTC] Using default Google STUN servers');
        return {
            iceServers: defaultServers
        };
    }
}

/**
 * Create a new RTCPeerConnection with the given config
 */
export function createPeerConnection(
    config: RtcConfig,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onTrack: (stream: MediaStream) => void,
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void
): RTCPeerConnection {
    const pc = new RTCPeerConnection({
        iceServers: config.iceServers,
        iceCandidatePoolSize: 2,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`[WebRTC] ICE candidate generated for peer`);
            onIceCandidate(event.candidate);
        } else {
            console.log(`[WebRTC] ICE gathering complete`);
        }
    };

    pc.ontrack = (event) => {
        console.log(`[WebRTC] Track received: ${event.streams[0]?.id}`);
        if (event.streams && event.streams[0]) {
            onTrack(event.streams[0]);
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state changed: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
            console.error('[WebRTC] ICE/Connection failed! Check STUN/TURN or Firewall.');
        }
        if (onConnectionStateChange) {
            onConnectionStateChange(pc.connectionState);
        }
    };

    return pc;
}

/**
 * Add local audio stream to peer connection
 */
export function addLocalStreamToPeer(pc: RTCPeerConnection, stream: MediaStream): void {
    stream.getAudioTracks().forEach(track => {
        pc.addTrack(track, stream);
    });
}

/**
 * Create and send an offer
 */
export async function createOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
}

/**
 * Handle incoming offer and create answer
 */
export async function handleOffer(
    pc: RTCPeerConnection,
    offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit> {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
}

/**
 * Handle incoming answer
 */
export async function handleAnswer(
    pc: RTCPeerConnection,
    answer: RTCSessionDescriptionInit
): Promise<void> {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
}

/**
 * Handle incoming ICE candidate
 */
export async function handleIceCandidate(
    pc: RTCPeerConnection,
    candidate: RTCIceCandidateInit
): Promise<void> {
    try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
        console.error('Error adding ICE candidate:', e);
    }
}

/**
 * Request microphone access
 */
export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
    const audioConstraints: any = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    };

    if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
    }

    return navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
    });
}

/**
 * Stop all tracks in a stream
 */
export function stopStream(stream: MediaStream | null): void {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}
