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
    try {
        const res = await fetch('/api/rtc-config');
        if (!res.ok) throw new Error('Failed to fetch RTC config');
        return await res.json();
    } catch (e) {
        console.error('RTC config fetch failed, using default STUN:', e);
        return {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
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
    const pc = new RTCPeerConnection({ iceServers: config.iceServers });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            onIceCandidate(event.candidate);
        }
    };

    pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            onTrack(event.streams[0]);
        }
    };

    if (onConnectionStateChange) {
        pc.onconnectionstatechange = () => {
            onConnectionStateChange(pc.connectionState);
        };
    }

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
export async function getMicrophoneStream(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

/**
 * Stop all tracks in a stream
 */
export function stopStream(stream: MediaStream | null): void {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}
