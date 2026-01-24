import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mic, Volume2 } from 'lucide-react';

interface MicTestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onJoin: (deviceId?: string) => void;
}

export const MicTestModal: React.FC<MicTestModalProps> = ({ isOpen, onClose, onJoin }) => {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>('');
    const [volume, setVolume] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const contextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationRef = useRef<number | undefined>(undefined);

    // Load devices
    useEffect(() => {
        if (!isOpen) return;

        const getDevices = async () => {
            try {
                // Request permission first to get labels
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());

                const devs = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devs.filter(d => d.kind === 'audioinput');
                setDevices(audioInputs);
                if (audioInputs.length > 0) {
                    setSelectedDevice(audioInputs[0].deviceId);
                }
            } catch (e) {
                console.error("Error listing devices", e);
            }
        };
        getDevices();

        return () => stopTest();
    }, [isOpen]);

    // Start monitoring selected device
    useEffect(() => {
        if (!isOpen) return;

        // If no device selected yet and we have devices, select first
        if (!selectedDevice && devices.length > 0) {
            setSelectedDevice(devices[0].deviceId);
            return;
        }

        const startStream = async () => {
            stopTest(); // stop previous
            try {
                // If selectedDevice is empty string (default), use standard request
                const constraints = selectedDevice ? { deviceId: { exact: selectedDevice } } : true;

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: constraints
                });
                streamRef.current = stream;

                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                contextRef.current = ctx;
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                analyserRef.current = analyser;

                const source = ctx.createMediaStreamSource(stream);
                source.connect(analyser);
                sourceRef.current = source;

                draw();
            } catch (e) {
                console.error("Error starting stream", e);
                // Fallback: if specific device failed, try default
                if (selectedDevice) {
                    setSelectedDevice('');
                }
            }
        };
        startStream();

        return () => stopTest();
    }, [selectedDevice, isOpen, devices]);

    const stopTest = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (contextRef.current) {
            contextRef.current.close();
            contextRef.current = null;
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
    };

    const draw = () => {
        if (!analyserRef.current) return;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setVolume(Math.min(100, (average / 128) * 100));

        animationRef.current = requestAnimationFrame(draw);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Audio Setup</DialogTitle>
                    <DialogDescription>Check your microphone before joining.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Microphone</label>
                        <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select microphone" />
                            </SelectTrigger>
                            <SelectContent>
                                {devices.map(d => (
                                    <SelectItem key={d.deviceId} value={d.deviceId}>
                                        {d.label || `Microphone ${d.deviceId.slice(0, 5)}...`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                            <Volume2 size={16} />
                            Input Level
                        </label>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-75 ${volume > 80 ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{ width: `${volume}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => { stopTest(); onJoin(selectedDevice); }}>
                        <Mic size={16} className="mr-2" />
                        Join Voice
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
