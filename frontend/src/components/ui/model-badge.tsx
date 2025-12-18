import { Badge } from "./badge"
import { cn } from "../../lib/api"
import { Brain } from "lucide-react"

interface ModelBadgeProps {
    model: string;
    rarity?: string;
    className?: string;
    showIcon?: boolean;
}

const getDisplayRarity = (rarity: string) => {
    // Current backend returns 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'
    // This allows legacy support for 'White', 'Blue' etc if they still exist in DB
    const legacyMap: Record<string, string> = {
        'White': 'Common',
        'Green': 'Uncommon',
        'Blue': 'Rare',
        'Purple': 'Epic',
        'Gold': 'Legendary'
    };
    
    const normalized = rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase();
    return legacyMap[normalized] || normalized;
};

export function ModelBadge({ model, rarity, className, showIcon = true }: ModelBadgeProps) {
    if (!model) return null;

    const displayRarity = rarity ? getDisplayRarity(rarity) : 'Common';

    const getRarityStyles = (rarity: string) => {
        switch (rarity) {
            case 'Legendary':
                return 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30';
            case 'Epic':
                return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
            case 'Rare':
                return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
            case 'Uncommon':
                return 'bg-green-500/15 text-green-400 border-green-500/30';
            default:
                return 'bg-white/5 text-white/70 border-white/10';
        }
    };

    return (
        <Badge
            variant="outline"
            className={cn(
                "px-1.5 py-0 h-4 md:h-5 text-[10px] font-bold lowercase border tracking-tight transition-all duration-300 whitespace-nowrap",
                getRarityStyles(displayRarity),
                className
            )}
        >
            <div className="flex items-center gap-1.5">
                {showIcon && <Brain className={cn("w-2.5 h-2.5", displayRarity === 'Common' ? 'text-primary' : 'text-current')} />}
                <span>{model}</span>
            </div>
        </Badge>
    );
}
