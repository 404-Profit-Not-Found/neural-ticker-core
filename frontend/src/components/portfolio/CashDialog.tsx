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
import { useCurrency } from '../../context/CurrencyContext';

// Common cash currencies. The backend accepts any ISO code (buys debit the
// ticker's native currency), so the picker also offers every currency the app
// knows (/currency/available), the default currency and any currency held.
const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD'];

// One-click virtual funding amounts for the paper-trading account.
const DEPOSIT_PRESETS = [1_000, 10_000, 100_000];

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
  /** Pre-fill the amount (e.g. the shortfall of a rejected buy). */
  defaultAmount?: number;
  onSuccess: () => void;
}

const formatCurrency = (val: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);

export function CashDialog({
  open,
  onOpenChange,
  balances,
  defaultCurrency = 'USD',
  defaultAmount,
  onSuccess,
}: CashDialogProps) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { availableCurrencies } = useCurrency();

  useEffect(() => {
    if (open) {
      setMode('deposit');
      setAmount(defaultAmount && defaultAmount > 0 ? String(Math.ceil(defaultAmount)) : '');
      setError(null);
      setCurrency(/^[A-Z]{3}$/.test(defaultCurrency) ? defaultCurrency : 'USD');
    }
  }, [open, defaultCurrency, defaultAmount]);

  const currencyOptions = Array.from(
    new Set([
      ...COMMON_CURRENCIES,
      ...(availableCurrencies ?? []).map((c) => c.code),
      currency,
      ...balances.map((b) => b.currency),
    ]),
  ).filter((c) => /^[A-Z]{3}$/.test(c));

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
      // No `note`: the backend accepts one but does not persist cash movements yet.
      const { data } = await api.post(`/portfolio/cash/${mode}`, { amount: amountNum, currency });
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
                Virtual paper-trading cash — funds your buys and holds sale proceeds. No real money.
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
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {mode === 'deposit' && (
            <div className="flex gap-2 -mt-2">
              {DEPOSIT_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setAmount(String((parseFloat(amount) || 0) + p))}
                  className="flex-1 px-2 py-1 rounded-md text-xs font-mono border border-border/40 bg-muted/30 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  +{p.toLocaleString('en-US')}
                </button>
              ))}
            </div>
          )}

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
