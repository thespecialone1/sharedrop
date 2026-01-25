import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Image as ImageIcon, Smile, ChevronRight } from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { klipy, KlipyMedia } from '../utils/klipy';

type MediaType = 'gifs' | 'stickers';

interface MediaPickerProps {
    onSelect: (url: string, type: MediaType) => void;
    onClose: () => void;
}

export const MediaPicker: React.FC<MediaPickerProps> = ({ onSelect, onClose }) => {
    const [activeTab, setActiveTab] = useState<MediaType>('gifs');
    const [searchQuery, setSearchQuery] = useState('');
    const [items, setItems] = useState<KlipyMedia[]>([]);
    const [categories, setCategories] = useState<{ id: string, label: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce Logic
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(searchQuery), 500);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Fetch Categories
    useEffect(() => {
        const loadCategories = async () => {
            const cats = await klipy.fetchCategories(activeTab === 'gifs' ? 'gifs' : 'stickers');
            setCategories(cats);
        };
        loadCategories();
    }, [activeTab]);

    // Fetch Content
    useEffect(() => {
        const fetchContent = async () => {
            setIsLoading(true);
            try {
                let formattedTab = activeTab === 'gifs' ? 'gifs' : 'stickers';
                const type = formattedTab as 'gifs' | 'stickers';

                let results: KlipyMedia[] = [];
                if (debouncedQuery.trim()) {
                    results = await klipy.search(type, debouncedQuery);
                } else {
                    results = await klipy.fetchTrending(type);
                }
                setItems(results);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        fetchContent();
    }, [activeTab, debouncedQuery]);

    return (
        <div className="w-[350px] h-[450px] bg-bg rounded-2xl shadow-xl border border-border-custom flex flex-col overflow-hidden relative font-sans">
            {/* Header Section */}
            <div className="flex-shrink-0 p-3 pb-0 space-y-3 bg-bg z-10">
                {/* Search Bar - Elevated Pill */}
                <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" size={16} />
                    <input
                        type="text"
                        placeholder={activeTab === 'gifs' ? "Search GIFs" : "Search Stickers"}
                        className="w-full h-10 bg-surface-2 rounded-full pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-bg transition-all border border-transparent focus:border-blue-200 placeholder:text-text-secondary"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                {/* Filter Chips with Gradient Mask */}
                <div className="relative">
                    <div className="overflow-x-auto scrollbar-hide flex gap-2 pb-3 px-1">
                        <button
                            className={cn(
                                "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
                                !searchQuery ? "bg-text-primary text-bg" : "bg-bg border border-border-custom text-text-secondary hover:bg-surface-2"
                            )}
                            onClick={() => setSearchQuery('')}
                        >
                            Trending
                        </button>
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-bg border border-border-custom text-text-secondary hover:bg-surface-2 hover:border-border-custom transition-colors whitespace-nowrap"
                                onClick={() => setSearchQuery(cat.id)}
                            >
                                {cat.label}
                            </button>
                        ))}
                        <div className="w-4 flex-shrink-0" />
                    </div>
                    <div className="absolute right-0 top-0 bottom-3 w-12 bg-gradient-to-l from-bg to-transparent pointer-events-none" />
                </div>
            </div>

            {/* Content Grid */}
            <ScrollArea className="flex-1 bg-bg">
                <div className="p-2 grid grid-cols-2 gap-2">
                    {isLoading ? (
                        Array(8).fill(0).map((_, i) => (
                            <div key={i} className="aspect-video bg-slate-100 rounded-lg animate-pulse" />
                        ))
                    ) : items.length > 0 ? (
                        items.map((item) => (
                            <div
                                key={item.id}
                                className="group relative aspect-video bg-surface-2 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-400/50 transition-all"
                                onClick={() => onSelect(item.url, activeTab)}
                            >
                                <img
                                    src={item.previewUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            </div>
                        ))
                    ) : (
                        <div className="col-span-2 py-10 text-center text-slate-400 text-sm">
                            No results found
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Footer Tab Switcher */}
            <div className="flex-shrink-0 p-3 bg-bg border-t border-border-custom">
                <div className="flex bg-slate-100/50 p-1 rounded-full relative">
                    <button
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition-colors relative z-10",
                            activeTab === 'gifs' ? "text-primary-blue" : "text-text-secondary hover:text-text-primary"
                        )}
                        onClick={() => setActiveTab('gifs')}
                    >
                        {activeTab === 'gifs' && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute inset-0 bg-white shadow-sm rounded-full border border-slate-200/50"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                style={{ zIndex: -1 }}
                            />
                        )}
                        <ImageIcon size={16} />
                        <span>GIFs</span>
                    </button>

                    <button
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-medium transition-colors relative z-10",
                            activeTab === 'stickers' ? "text-primary-blue" : "text-text-secondary hover:text-text-primary"
                        )}
                        onClick={() => setActiveTab('stickers')}
                    >
                        {activeTab === 'stickers' && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute inset-0 bg-white shadow-sm rounded-full border border-slate-200/50"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                style={{ zIndex: -1 }}
                            />
                        )}
                        <Smile size={16} />
                        <span>Stickers</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
