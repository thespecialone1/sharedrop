import React from 'react';

interface VideoGridProps {
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    isCameraOff: boolean;
    isMuted: boolean;
    participants: { socketId: string, username: string }[];
}

const VideoStream = ({ stream, isLocal, username, isMuted }: { stream: MediaStream | null, isLocal: boolean, username: string, isMuted?: boolean }) => {
    const videoRef = React.useRef<HTMLVideoElement>(null);

    React.useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className="relative w-full h-full bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
            {/* Video Element */}
            {stream ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal} // Always mute local video to prevent echo
                    className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500">
                    No Signal
                </div>
            )}

            {/* Overlay Info */}
            <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white font-medium flex items-center gap-2">
                <span>{isLocal ? 'You' : username}</span>
                {isMuted && <span className="text-red-400">×</span>} {/* Mute icon placeholder */}
            </div>
        </div>
    );
};

export const VideoGrid = ({ localStream, remoteStreams, participants, isCameraOff, isMuted }: VideoGridProps) => {
    const getRemoteStream = (socketId: string) => remoteStreams.get(socketId) || null;

    // Remote participants to render
    const remotes = participants.filter(p => remoteStreams.has(p.socketId));

    return (
        <div className="w-full h-full flex flex-col gap-2 p-2 overflow-y-auto bg-black scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {/* Local User */}
            <div className="relative shrink-0 w-full aspect-video bg-slate-800 rounded-lg overflow-hidden border border-slate-700/50">
                <VideoStream stream={localStream} isLocal={true} username="You" isMuted={isMuted} />
                {isCameraOff && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl uppercase shadow-lg border-2 border-slate-800">
                                Y
                            </div>
                            <span className="text-slate-300 text-sm font-medium tracking-wide">You</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Remote Users - Vertical Stack */}
            {remotes.map((p) => {
                const stream = getRemoteStream(p.socketId);
                // Check if stream exists and has active video tracks
                const isVideoActive = stream && stream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');

                return (
                    <div key={p.socketId} className="relative shrink-0 w-full aspect-video bg-slate-800 rounded-lg overflow-hidden border border-slate-700/50">
                        <VideoStream stream={stream} isLocal={false} username={p.username} />

                        {!isVideoActive && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 z-10">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white font-bold text-2xl uppercase shadow-lg border-2 border-slate-800">
                                        {p.username.charAt(0)}
                                    </div>
                                    <span className="text-slate-300 text-sm font-medium tracking-wide">{p.username}</span>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
