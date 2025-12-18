import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { Calculator, Edit2, AlertTriangle, Trash2 } from 'lucide-react';

interface EditPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: any;
  onSuccess: () => void;
}

export function EditPositionDialog({ open, onOpenChange, position, onSuccess }: EditPositionDialogProps) {
  // Mode State
  const [activeTab, setActiveTab] = useState('transaction');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  
  // Transaction State
  const [transType, setTransType] = useState<'buy' | 'sell'>('buy');
  const [transShares, setTransShares] = useState('');
  const [transPrice, setTransPrice] = useState('');
  
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
        setActiveTab('transaction');
        setModShares(String(position.shares));
        setModPrice(String(position.buy_price));
        setModDate(position.buy_date ? new Date(position.buy_date).toISOString().split('T')[0] : '');
        
        // Transaction defaults
        setTransType('buy');
        setTransShares('');
        setTransPrice(String(position.current_price || position.buy_price)); // Default to current price for convenience
    }
  }, [position, open]);

  // Calculations for Transaction Preview
  const previewData = useMemo(() => {
      if (!position) return null;
      
      const currentShares = Number(position.shares);
      const currentAvg = Number(position.buy_price);
      
      const addShares = Number(transShares);
      const addPrice = Number(transPrice);

      if (!addShares || isNaN(addShares) || !addPrice || isNaN(addPrice)) return null;

      let newShares = currentShares;
      let newAvg = currentAvg;

      if (transType === 'buy') {
          const totalCost = (currentShares * currentAvg) + (addShares * addPrice);
          newShares = currentShares + addShares;
          newAvg = totalCost / newShares;
      } else {
          newShares = currentShares - addShares;
          // Avg cost doesn't change on sell (FIFO/Avg Cost accounting usually keeps same unit cost)
          // But for this simple implementation, let's keep it same.
          newAvg = currentAvg; 
      }
      
      return { newShares, newAvg };
  }, [position, transType, transShares, transPrice]);


  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewData) return;
    setLoading(true);

    try {
        // We update the position with the NEW calculated values
        // Ideally backend handles transactions, but for MVP we update the aggregate state
        await api.patch(`/portfolio/positions/${position.id}`, {
            shares: previewData.newShares,
            buy_price: previewData.newAvg,
            // Date is tricky for aggregates. Let's leave it as is or update to today if buying?
            // User can use Modify tab to fix date if needed.
        });
        toast.success(`Position updated: ${transType.toUpperCase()} ${transShares} shares`);
        onSuccess();
        onOpenChange(false);
    } catch (error) {
        toast.error('Failed to update position');
    } finally {
        setLoading(false);
    }
  };

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
    } catch (error) {
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
      } catch (error) {
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
                    {loading ? 'Deleting...' : 'Delete Position'}
                </Button>
            </DialogFooter>
        </Dialog>
      );
  }

  return (
    <Dialog 
      open={open} 
      onOpenChange={onOpenChange}
      className="sm:max-w-[425px] bg-card text-foreground border-border"
    >
        <DialogHeader>
          <DialogTitle>Manage Position: {position?.symbol}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="transaction" className="flex items-center gap-2">
                    <Calculator size={14} />
                    Transaction
                </TabsTrigger>
                <TabsTrigger value="modify" className="flex items-center gap-2">
                    <Edit2 size={14} />
                    Modify
                </TabsTrigger>
            </TabsList>

            {/* TRANSACTION TAB */}
            <TabsContent value="transaction" className="space-y-4 py-4">
                 <div className="flex justify-center gap-4 mb-4">
                     <Button 
                        type="button" 
                        variant={transType === 'buy' ? 'default' : 'outline'} 
                        className={transType === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                        onClick={() => setTransType('buy')}
                     >
                        Buy More
                     </Button>
                     <Button 
                        type="button" 
                        variant={transType === 'sell' ? 'default' : 'outline'}
                        className={transType === 'sell' ? 'bg-red-600 hover:bg-red-700' : ''}
                        onClick={() => setTransType('sell')}
                     >
                        Sell / Reduce
                     </Button>
                 </div>

                 <div className="grid gap-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Shares</Label>
                        <Input 
                            type="number" step="any" placeholder="0.00"
                            value={transShares} onChange={(e) => setTransShares(e.target.value)}
                            className="col-span-3 bg-background/50"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Price</Label>
                        <Input 
                            type="number" step="any"
                            value={transPrice} onChange={(e) => setTransPrice(e.target.value)}
                            className="col-span-3 bg-background/50"
                        />
                    </div>
                 </div>

                 {/* Preview Box */}
                 {previewData ? (
                     <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border text-sm space-y-2">
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">New Share Count:</span>
                            <span className="font-bold">{previewData.newShares.toFixed(2)}</span>
                         </div>
                         <div className="flex justify-between">
                            <span className="text-muted-foreground">New Avg Price:</span>
                            <span className="font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(previewData.newAvg)}</span>
                         </div>
                     </div>
                 ) : (
                     <div className="mt-4 p-3 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                         Enter transaction details to see updated position
                     </div>
                 )}

                <DialogFooter className="mt-4">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="button" onClick={handleTransactionSubmit} disabled={loading || !previewData}>
                         {loading ? 'Confirming...' : 'Confirm Transaction'}
                    </Button>
                </DialogFooter>
            </TabsContent>

            {/* MODIFY TAB */}
            <TabsContent value="modify" className="space-y-4 py-4">
                <form onSubmit={handleModifySubmit} className="grid gap-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Shares</Label>
                        <Input 
                            type="number" step="any" required
                            value={modShares} onChange={(e) => setModShares(e.target.value)}
                            className="col-span-3 bg-background/50"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Avg Price</Label>
                        <Input 
                            type="number" step="any" required
                            value={modPrice} onChange={(e) => setModPrice(e.target.value)}
                            className="col-span-3 bg-background/50"
                        />
                    </div>
                     <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Buy Date</Label>
                        <Input 
                            type="date"
                            value={modDate} onChange={(e) => setModDate(e.target.value)}
                            className="col-span-3 bg-background/50"
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
                            Delete Position
                        </Button>

                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Saving...' : 'Save Updates'}
                            </Button>
                        </div>
                    </div>
                </form>
            </TabsContent>
        </Tabs>
    </Dialog>
  );
}
