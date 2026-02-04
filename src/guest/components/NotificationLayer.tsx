import React from 'react';
import { Toast, ToastProps } from './ui/Toast';
import { VoiceBanner, VoiceBannerProps } from './ui/VoiceBanner';
import { NotificationItem, VoiceBannerState } from '../hooks/useNotifications';

interface NotificationLayerProps {
    toasts: NotificationItem[];
    voiceBanner: VoiceBannerState | null;
    onDismissToast: (id: string) => void;
    onDismissBanner: () => void;
    onJoinVoice: () => void;
}

export const NotificationLayer = ({
    toasts,
    voiceBanner,
    onDismissToast,
    onDismissBanner,
    onJoinVoice
}: NotificationLayerProps) => {
    return (
        <div className="fixed inset-0 pointer-events-none z-[100] flex flex-col items-center justify-start p-4 sm:p-6 gap-4">
            {/* Voice Banner (Top Center) */}
            {voiceBanner && (
                <div className="w-full flex justify-center pb-2">
                    <VoiceBanner
                        hostName={voiceBanner.hostName}
                        onJoin={onJoinVoice}
                        onDismiss={onDismissBanner}
                    />
                </div>
            )}

            {/* Toasts (Top Right or Center, stacking) */}
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex flex-col gap-2 w-full max-w-sm items-end pointer-events-none">
                {toasts.map(toast => (
                    <div key={toast.id} className="pointer-events-auto w-full flex justify-end">
                        <Toast
                            id={toast.id}
                            title={toast.title}
                            message={toast.message}
                            type={toast.type}
                            duration={toast.duration}
                            onDismiss={onDismissToast}
                            onClick={toast.action}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};
