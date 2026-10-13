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

const RARITY_STYLES: Record<string, string> = {
    Legendary: 'bg-yellow-500/10 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400',
    Epic: 'bg-purple-500/10 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
    Rare: 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    Uncommon: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};

/**
 * The model that produced a piece of research. The tint encodes the note's
 * research tier (rarity); the tooltip spells both out so the colour is never
 * the only carrier of meaning.
 */
export function ModelBadge({ model, rarity, className, showIcon = true }: ModelBadgeProps) {
    if (!model) return null;

    const displayRarity = rarity ? getDisplayRarity(rarity) : 'Common';
    const tint = RARITY_STYLES[displayRarity] ?? 'bg-muted/50 text-muted-foreground';
    const title = displayRarity === 'Common' ? `Model: ${model}` : `Model: ${model} · ${displayRarity} research tier`;

    return (
        <Badge
            variant="outline"
            title={title}
            className={cn(
                // Model ids are identifiers, not words: keep their own casing.
                "max-w-full gap-1.5 px-1.5 text-[11px] font-medium normal-case tracking-normal",
                tint,
                className
            )}
        >
            {showIcon && <Brain className="h-3 w-3 shrink-0" aria-hidden />}
            <span className="truncate">{model}</span>
        </Badge>
    );
}
