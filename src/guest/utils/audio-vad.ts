/**
 * Simple Voice Activity Detection (VAD) using AudioContext
 * Detects if the user is speaking based on volume threshold
 */

interface VADOptions {
    threshold?: number;   // Volume threshold (0-1), default 0.02
    interval?: number;    // Check interval in ms, default 100
    decay?: number;       // How fast to drop 'speaking' state, default 500ms
}

export interface VADInstance {
    stop: () => void;
}

export function createVAD(
    stream: MediaStream,
    onSpeakingChange: (isSpeaking: boolean) => void,
    options: VADOptions = {}
): VADInstance {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
        console.warn('AudioContext not supported');
        return { stop: () => { } };
    }

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(stream);
    const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

    analyser.smoothingTimeConstant = 0.8;
    analyser.fftSize = 1024;

    microphone.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    const { threshold = 0.05, decay = 800 } = options; // decay in ms

    let isSpeaking = false;
    let lastSpeakTime = 0;
    let speakingTimeout: any = null;

    scriptProcessor.onaudioprocess = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);

        let values = 0;
        const length = array.length;
        for (let i = 0; i < length; i++) {
            values += array[i];
        }

        const average = values / length;
        // Normalize 0-255 to 0-1
        const volume = average / 255;

        // console.log('Volume:', volume);

        if (volume > threshold) {
            lastSpeakTime = Date.now();
            if (!isSpeaking) {
                isSpeaking = true;
                onSpeakingChange(true);
            }
            if (speakingTimeout) {
                clearTimeout(speakingTimeout);
                speakingTimeout = null;
            }
        } else {
            if (isSpeaking && (Date.now() - lastSpeakTime) > decay) {
                if (!speakingTimeout) {
                    speakingTimeout = setTimeout(() => {
                        isSpeaking = false;
                        onSpeakingChange(false);
                    }, 200); // Short buffer before actually toggling off
                }
            }
        }
    };

    return {
        stop: () => {
            if (speakingTimeout) clearTimeout(speakingTimeout);
            microphone.disconnect();
            analyser.disconnect();
            scriptProcessor.disconnect();
            // Don't close context if it's shared, but here we created it active
            // Closing it is safer to stop processing
            if (audioContext.state !== 'closed') {
                audioContext.close();
            }
        }
    };
}
