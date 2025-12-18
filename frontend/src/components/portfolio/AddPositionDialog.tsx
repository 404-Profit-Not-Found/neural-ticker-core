import { useState, useEffect } from 'react';
import { Plus, Calendar } from 'lucide-react';
import { api } from '../../lib/api';
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface AddPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddPositionDialog({ open, onOpenChange, onSuccess }: AddPositionDialogProps) {
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
        setSymbol('');
        setShares('');
        setPrice('');
        setDate(new Date().toISOString().split('T')[0]);
        setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.post('/portfolio/positions', {
        symbol: symbol.toUpperCase(),
        shares: parseFloat(shares),
        buy_price: parseFloat(price),
        buy_date: date,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add position');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                    <Plus size={18} />
                </div>
                Add Position
            </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {error && (
                <div className="p-3 bg-red-500/10 text-red-500 text-sm rounded-md border border-red-500/20">
                {error}
                </div>
            )}

            <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Ticker Symbol</label>
                <Input
                    required
                    placeholder="e.g. NVDA"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="uppercase placeholder:normal-case"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Shares</label>
                <Input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                />
                </div>
                <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Buy Price ($)</label>
                <Input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                />
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Date Purchased</label>
                <div className="relative">
                <Input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="pl-10 [color-scheme:dark]"
                />
                <Calendar className="absolute left-3 top-2.5 text-muted-foreground pointer-events-none" size={16} />
                </div>
            </div>

            <DialogFooter className="pt-2">
                <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                    Cancel
                </Button>
                <Button type="submit" disabled={loading} className="bg-primary text-black hover:bg-primary/90">
                    {loading ? 'Adding...' : 'Add Position'}
                </Button>
            </DialogFooter>
        </form>
    </Dialog>
  );
}
