import React from 'react';
import { Heart, ThumbsUp, Eye, Smile, Star, LucideIcon } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface ReactionsBarProps {
    onReact: (type: string) => void;
    className?: string;
}

const REACTIONS = [
    { type: 'heart', icon: Heart, color: 'text-rose-500', label: 'Heart' },
    { type: 'like', icon: ThumbsUp, color: 'text-blue-500', label: 'Like' },
    { type: 'eyes', icon: Eye, color: 'text-emerald-500', label: 'Eyes' },
    { type: 'smile', icon: Smile, color: 'text-amber-500', label: 'Smile' },
    { type: 'star', icon: Star, color: 'text-yellow-500', label: 'Star' },
    // Mascot Reactions
    { type: 'mascot-wave', image: '/branding/mascot-wave-64.png', label: 'Wave' },
    { type: 'mascot-bounce', image: '/branding/mascot-bounce-64.png', label: 'Bounce' },
    { type: 'mascot-sad', image: '/branding/mascot-sad-64.png', label: 'Sad' },
    { type: 'mascot-laugh', image: '/branding/mascot-laugh-64.png', label: 'Laugh' }
];

const ReactionsBar: React.FC<ReactionsBarProps> = ({ onReact, className = '' }) => {
    return (
        <div className={`flex items-center gap-1 ${className}`}>
            {REACTIONS.map((reaction) => {
                if ('icon' in reaction) {
                    const Icon = reaction.icon;
                    return (
                        <Button
                            key={reaction.type}
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-slate-100 rounded-full transition-transform hover:scale-110 active:scale-95"
                            onClick={() => onReact(reaction.type)}
                            title={reaction.label}
                        >
                            <Icon size={16} className={reaction.color} />
                        </Button>
                    );
                }
                return (
                    <Button
                        key={reaction.type}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-slate-100 rounded-full transition-transform hover:scale-110 active:scale-95"
                        onClick={() => onReact(reaction.type)}
                        title={reaction.label}
                    >
                        <img src={reaction.image} alt={reaction.label} className="w-5 h-5 object-contain" />
                    </Button>
                );
            })}
        </div>
    );
};

export default ReactionsBar;
