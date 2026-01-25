
import React, { useState, useEffect } from 'react';
import ReactJson from 'react-json-view';
import { ViewerToolbar } from './ViewerToolbar';
import { Loader2 } from 'lucide-react';

interface JsonViewerProps {
    path: string;
    onClose: () => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ path, onClose }) => {
    const [json, setJson] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsLoading(true);
        fetch(`/api/preview?path=${encodeURIComponent(path)}&format=json&pretty=true`)
            .then(async res => {
                if (res.status === 413) throw new Error('File too large to preview');
                if (!res.ok) throw new Error('Failed to load JSON');
                return res.json();
            })
            .then(data => {
                setJson(data);
                setIsLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setIsLoading(false);
            });
    }, [path]);

    const handleDownload = () => window.open(`/api/file?path=${encodeURIComponent(path)}`);

    return (
        <div className="flex flex-col h-full w-full bg-bg relative">
            <ViewerToolbar
                title={path.split('/').pop() || 'JSON Viewer'}
                onClose={onClose}
                onDownload={handleDownload}
            />

            <div className="flex-1 overflow-auto pt-16 p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full text-slate-400">
                        <Loader2 className="animate-spin mr-2" /> Loading JSON...
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-4">
                        <p>{error}</p>
                        <button onClick={handleDownload} className="px-4 py-2 bg-text-primary text-bg rounded-lg">Download File</button>
                    </div>
                ) : (
                    <div className="max-w-5xl mx-auto bg-bg p-4 rounded-xl overflow-hidden shadow-sm border border-border-custom min-h-[500px]">
                        <ReactJson
                            src={json}
                            theme="rjv-default"
                            name={false}
                            displayDataTypes={false}
                            enableClipboard={true}
                            collapsed={2}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
