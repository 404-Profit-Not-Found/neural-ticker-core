import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { AdminUser } from './UserAdminCard';
import { Crown, Sparkles, Gift, Ban, CheckCircle, Clock, Shield, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface UserDetailDialogProps {
    user: AdminUser | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpdateTier: (userId: string, tier: 'free' | 'pro' | 'whale') => void;
    onUpdateRole: (userId: string, role: string) => void;
    onRevoke: (user: AdminUser) => void;
    onUnban: (user: AdminUser) => void;
    onApprove: (email: string) => void;
    onGiftCredits: (user: AdminUser) => void;
    onResetTutorial: (userId: string) => void;
}

export function UserDetailDialog({
    user,
    open,
    onOpenChange,
    onUpdateTier,
    onUpdateRole,
    onRevoke,
    onUnban,
    onApprove,
    onGiftCredits,
    onResetTutorial
}: UserDetailDialogProps) {
    if (!user) return null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
    };

    const getTierBadge = (tier: string) => {
        switch (tier) {
            case 'whale':
                return <Badge variant="outline" className="bg-amber-500/5 text-amber-500 border-amber-500/20 gap-1 h-5 text-[10px] px-1.5"><Crown size={10} /> WHALE</Badge>;
            case 'pro':
                return <Badge variant="outline" className="bg-purple-500/5 text-purple-400 border-purple-500/20 gap-1 h-5 text-[10px] px-1.5"><Sparkles size={10} /> PRO</Badge>;
            default:
                return null; // Don't show badge for free users
        }
    };

    const formatFullTimestamp = (dateString: string | undefined) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(',', '');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground overflow-hidden ring-2 ring-border">
                            {user.avatar_url ? (
                                <img src={user.avatar_url} alt="User" className="w-full h-full object-cover" />
                            ) : (
                                (user.nickname || user.email)?.slice(0, 2).toUpperCase()
                            )}
                        </div>
                        <div className="flex flex-col">
                            <DialogTitle className="text-xl">
                                {user.nickname || user.email?.split('@')[0]}
                            </DialogTitle>
                            <DialogDescription className="text-sm">
                                {user.email}
                            </DialogDescription>
                            <div className="flex gap-2 mt-2">
                                {getTierBadge(user.tier)}
                                {(user.role === 'admin' || user.status === 'ADMIN') && <Badge variant="destructive" className="gap-1"><Shield size={10} /> ADMIN</Badge>}
                                {user.status === 'ACTIVE' && <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/5">ACTIVE</Badge>}
                                {user.status === 'WAITLIST' && <Badge variant="secondary">WAITLIST</Badge>}
                                {user.status === 'INVITED' && <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/50">INVITED</Badge>}
                                {user.status === 'BANNED' && <Badge variant="destructive">BANNED</Badge>}
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Info Row */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border/40">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock size={12} /> {user.status === 'INVITED' ? 'Invited' : 'Joined'}
                            </span>
                            <span className="font-medium font-mono text-[10px] leading-tight">
                                {formatFullTimestamp(user.created_at || user.invited_at)}
                            </span>
                        </div>
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-muted/40 border border-border/40 relative group cursor-pointer" onClick={() => user.id && copyToClipboard(user.id)}>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                ID <Copy size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </span>
                            <span className="font-medium font-mono text-[10px] truncate max-w-full">
                                {user.id || 'N/A'}
                            </span>
                        </div>
                    </div>

                    {/* Actions List */}
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Actions</p>

                        {user.id && (
                            <Button variant="outline" className="justify-start gap-2 h-10" onClick={() => onGiftCredits(user)}>
                                <Gift size={16} className="text-amber-400" />
                                Gift Credits
                            </Button>
                        )}

                        {/* Tier Selection */}
                        <div className="grid grid-cols-3 gap-2">
                            {(['free', 'pro', 'whale'] as const).map((tier) => (
                                <Button
                                    key={tier}
                                    variant={user.tier === tier ? 'default' : 'outline'}
                                    className="h-9 text-xs capitalize"
                                    onClick={() => user.id && onUpdateTier(user.id, tier)}
                                    disabled={!user.id}
                                >
                                    {tier}
                                </Button>
                            ))}
                        </div>

                        {user.status === 'WAITLIST' && (
                            <Button
                                className="justify-start gap-2 h-10 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20"
                                variant="outline"
                                onClick={() => onApprove(user.email)}
                            >
                                <CheckCircle size={16} />
                                Approve User
                            </Button>
                        )}

                        {user.role === 'admin' && (
                            <Button
                                variant="outline"
                                className="justify-start gap-2 h-10 hover:bg-amber-400/10 hover:text-amber-400 hover:border-amber-400/30"
                                onClick={() => user.id && onUpdateRole(user.id, 'user')}
                                disabled={!user.id}
                            >
                                <Shield size={16} className="text-amber-400" />
                                Remove Admin Role
                            </Button>
                        )}

                        {user.status !== 'BANNED' ? (
                            <Button
                                variant="outline"
                                className="justify-start gap-2 h-10 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                                onClick={() => onRevoke(user)}
                            >
                                <Ban size={16} />
                                Revoke Access (Ban)
                            </Button>
                        ) : (
                            <Button
                                className="justify-start gap-2 h-10 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20"
                                variant="outline"
                                onClick={() => onUnban(user)}
                            >
                                <CheckCircle size={16} />
                                Unban User
                            </Button>
                        )}

                        {user.id && (
                            <Button
                                variant="outline"
                                className="justify-start gap-2 h-10 hover:bg-orange-500/10 hover:text-orange-500 hover:border-orange-500/30"
                                onClick={() => user.id && onResetTutorial(user.id)}
                            >
                                <Clock size={16} className="text-orange-500" />
                                Reset Tutorial State
                            </Button>
                        )}
                    </div>
                </div>

                <DialogFooter className="sm:justify-start">
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} className="w-full">
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
