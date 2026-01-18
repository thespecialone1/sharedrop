import React from 'react';
import { Folder, ImageIcon, PlayCircle, File, CheckSquare, Square } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface StatsTagsProps {
    stats: { folders: number; images: number; videos: number; others: number } | null;
    activeFilters: string[];
    onFilterToggle: (key: string) => void;
    totalItems?: number;
    selectedCount?: number;
    onSelectAll?: () => void;
    onDeselectAll?: () => void;
}

const StatsTags = ({ stats, activeFilters, onFilterToggle, totalItems = 0, selectedCount = 0, onSelectAll, onDeselectAll }: StatsTagsProps) => {
    if (!stats) return null;

    const tags = [
        { key: 'folders', label: 'Folders', icon: Folder, count: stats.folders, color: 'amber' },
        { key: 'images', label: 'Images', icon: ImageIcon, count: stats.images, color: 'blue' },
        { key: 'videos', label: 'Videos', icon: PlayCircle, count: stats.videos, color: 'purple' },
        { key: 'others', label: 'Other', icon: File, count: stats.others, color: 'slate' },
    ];

    const colorStyles: Record<string, { active: string; inactive: string }> = {
        amber: { active: 'bg-amber-100 text-amber-700 ring-2 ring-amber-400', inactive: 'bg-amber-50 text-amber-600 hover:bg-amber-100' },
        blue: { active: 'bg-blue-100 text-blue-700 ring-2 ring-blue-400', inactive: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
        purple: { active: 'bg-purple-100 text-purple-700 ring-2 ring-purple-400', inactive: 'bg-purple-50 text-purple-600 hover:bg-purple-100' },
        slate: { active: 'bg-slate-200 text-slate-700 ring-2 ring-slate-400', inactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
    };

    const allSelected = selectedCount > 0 && selectedCount === totalItems;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Select All / Deselect All */}
            {totalItems > 0 && (onSelectAll || onDeselectAll) && (
                <button
                    onClick={() => allSelected ? onDeselectAll?.() : onSelectAll?.()}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all
                        ${allSelected
                            ? 'bg-green-100 text-green-700 ring-2 ring-green-400'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'}
                    `}
                >
                    {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                    {selectedCount > 0 && <span className="text-[10px] opacity-70">({selectedCount})</span>}
                </button>
            )}

            {/* Filter tags */}
            {tags.map((tag) => tag.count > 0 && (
                <button
                    key={tag.key}
                    onClick={() => onFilterToggle(tag.key)}
                    className={`
                        flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all
                        ${activeFilters.includes(tag.key) ? colorStyles[tag.color].active : colorStyles[tag.color].inactive}
                    `}
                >
                    <tag.icon size={14} />
                    <span>{tag.count}</span>
                </button>
            ))}
        </div>
    );
};

export default StatsTags;
