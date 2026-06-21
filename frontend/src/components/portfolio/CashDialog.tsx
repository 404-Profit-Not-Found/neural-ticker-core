import { useState, useEffect } from 'react';
import {
  Wallet,
  Loader2,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { NativeSelect } from '../ui/select-native';
import { toast } from 'sonner';

// Mirrors the backend SUPPORTED_CURRENCIES allow-list (cash-operation.dto.ts).
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'] as const;

export interface CashBalance {
  currency: string;
  amount: number;
}

interface CashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balances: CashBalance[];
  /** Pre-select this currency (e.g. the position the user just tried to buy). */
  defaultCurrency?: string;
  onSuccess: () => void;
}

const formatCurrency = (val: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);

export function CashDialog({
  open,
  onOpenChange,
  balances,
  defaultCurrency = 'USD',
  onSuccess,
}: CashDialogProps) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode('deposit');
      setAmount('');
      setNote('');
      setError(null);
      // Only adopt the default if it's an allowed cash currency.
      setCurrency(
        (SUPPORTED_CURRENCIES as readonly string[]).includes(defaultCurrency)
          ? defaultCurrency
          : 'USD',
      );
    }
  }, [open, defaultCurrency]);

  const currentBalance =
    balances.find((b) => b.currency === currency)?.amount ?? 0;
  const amountNum = parseFloat(amount) || 0;
  const insufficient =
    mode === 'withdraw' && amountNum > currentBalance + 1e-9;
  const canSubmit = !loading && amountNum > 0 && !insufficient;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { amount: amountNum, currency };
      if (note.trim()) payload.note = note.trim();

      const { data } = await api.post(`/portfolio/cash/${mode}`, payload);
      const verb = mode === 'deposit' ? 'Deposited' : 'Withdrew';
      toast.success(`${verb} ${formatCurrency(amountNum, currency)}`, {
        description: `${currency} balance: ${formatCurrency(Number(data?.amount ?? 0), currency)}`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const e2 = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      const msg = e2.response?.data?.message || e2.message || 'Cash operation failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-sm border border-primary/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Manage Cash
              </DialogTitle>
              <DialogDescription className="text-xs">
                Simulator cash funds your buys and holds your sale proceeds.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Current balances */}
        {balances.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {balances.map((b) => (
              <button
                type="button"
                key={b.currency}
                onClick={() => setCurrency(b.currency)}
                className={
                  'px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ' +
                  (b.currency === currency
                    ? 'bg-primary/10 border-primary/40 text-foreground'
                    : 'bg-muted/30 border-border/40 text-muted-foreground hover:text-foreground')
                }
              >
                {formatCurrency(b.amount, b.currency)}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'deposit' | 'withdraw')}>
            <TabsList className="grid w-full grid-cols-2 bg-muted/30">
              <TabsTrigger value="deposit" className="flex items-center gap-2">
                <ArrowDownToLine size={14} /> Deposit
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="flex items-center gap-2">
                <ArrowUpFromLine size={14} /> Withdraw
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {error && (
            <div className="p-3 bg-red-500/10 text-red-500 rounded-md text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="cash-amount" className="text-xs font-bold text-muted-foreground">
                Amount
              </Label>
              <Input
                id="cash-amount"
                type="number"
                step="any"
                min="0"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono bg-muted/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground">Currency</Label>
              <NativeSelect
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="h-9"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground">{currency} balance</span>
            <span className="font-mono font-semibold text-foreground">
              {formatCurrency(currentBalance, currency)}
            </span>
          </div>
          {insufficient && (
            <p className="text-[11px] text-red-500 font-medium flex items-center gap-1 -mt-3 px-1">
              <AlertCircle size={11} /> Amount exceeds your {currency} balance
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cash-note" className="text-xs font-bold text-muted-foreground">
              Note <span className="font-normal text-muted-foreground/60">(optional)</span>
            </Label>
            <Input
              id="cash-note"
              type="text"
              placeholder="e.g. Initial funding"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="bg-muted/20"
            />
          </div>

          <DialogFooter className="pt-2 border-t border-border/50 flex-col sm:flex-row gap-2">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="min-w-[140px] bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : mode === 'deposit' ? (
                <ArrowDownToLine className="mr-2 h-4 w-4" />
              ) : (
                <ArrowUpFromLine className="mr-2 h-4 w-4" />
              )}
              {mode === 'deposit' ? 'Deposit' : 'Withdraw'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
