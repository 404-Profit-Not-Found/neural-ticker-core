import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { AlertTriangle, Trash2, Save } from 'lucide-react';

interface Position {
    id: string;
    symbol: string;
    shares: number;
    buy_price: number;
    buy_date?: string;
    current_price?: number;
}

interface EditPositionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    position: Position;
    onSuccess: () => void;
}

export function EditPositionDialog({ open, onOpenChange, position, onSuccess }: EditPositionDialogProps) {
    // Mode State
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // Modify State
    const [modShares, setModShares] = useState('');
    const [modPrice, setModPrice] = useState('');
    const [modDate, setModDate] = useState('');

    const [loading, setLoading] = useState(false);

    // Initialize Data
    useEffect(() => {
        if (position && open) {
            // Reset states
            setDeleteConfirm(false);
            setModShares(String(position.shares));
            setModPrice(String(position.buy_price));
            setModDate(position.buy_date ? new Date(position.buy_date).toISOString().split('T')[0] : '');
        }
    }, [position, open]);

    const handleModifySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await api.patch(`/portfolio/positions/${position.id}`, {
                shares: parseFloat(modShares),
                buy_price: parseFloat(modPrice),
                buy_date: modDate,
            });
            toast.success('Position modified successfully');
            onSuccess();
            onOpenChange(false);
        } catch {
            toast.error('Failed to modify position');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setLoading(true);
        try {
            await api.delete(`/portfolio/positions/${position.id}`);
            toast.success('Position removed');
            onSuccess();
            onOpenChange(false);
        } catch {
            toast.error('Failed to remove position');
        } finally {
            setLoading(false);
        }
    }

    // Render Delete Confirmation
    if (deleteConfirm) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange} className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-500">
                        <AlertTriangle size={20} />
                        Delete Position?
                    </DialogTitle>
                    <DialogDescription>
                        Are you sure you want to remove <strong>{position?.symbol}</strong> from your portfolio? This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                        {loading ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogFooter>
            </Dialog>
        );
    }

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            className="sm:max-w-[425px] bg-background text-foreground border-border"
        >
            <DialogHeader>
                <DialogTitle>Manage Position: {position?.symbol}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleModifySubmit} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Shares</Label>
                    <Input
                        type="number" step="any" required
                        value={modShares} onChange={(e) => setModShares(e.target.value)}
                        className="col-span-3 transition-all"
                    />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Avg Price</Label>
                    <Input
                        type="number" step="any" required
                        value={modPrice} onChange={(e) => setModPrice(e.target.value)}
                        className="col-span-3 transition-all"
                    />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Buy Date</Label>
                    <Input
                        type="date"
                        value={modDate} onChange={(e) => setModDate(e.target.value)}
                        className="col-span-3 transition-all"
                    />
                </div>

                <div className="flex justify-between items-center mt-6 pt-4 border-t border-border/50">
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="opacity-90 hover:opacity-100"
                        onClick={() => setDeleteConfirm(true)}
                    >
                        <Trash2 size={14} className="mr-1.5" />
                        Delete
                    </Button>

                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : (
                                <>
                                    <Save size={14} className="mr-1.5" />
                                    Save
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </form>
        </Dialog>
    );
}
