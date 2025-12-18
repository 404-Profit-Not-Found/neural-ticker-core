import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { PortfolioTable } from '../components/portfolio/PortfolioTable';
import { AddPositionDialog } from '../components/portfolio/AddPositionDialog';
import { PortfolioAiWidget } from '../components/portfolio/PortfolioAiWidget';
import { api, cn } from '../lib/api';
import { PlusCircle, Wallet } from 'lucide-react';
import { useToast } from '../components/ui/toast';

export function PortfolioPage() {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { showToast } = useToast();

  const fetchPortfolio = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/portfolio');
      setPositions(data);
    } catch (error) {
      console.error(error);
      showToast('Failed to load portfolio', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this position?')) return;
    try {
        await api.delete(`/portfolio/positions/${id}`);
        setPositions(prev => prev.filter(p => p.id !== id));
        showToast('Position removed', 'success');
    } catch (e) {
        showToast('Failed to delete position', 'error');
    }
  };

  // Calculate totals
  const totalValue = positions.reduce((sum, p) => sum + (Number(p.current_value) || 0), 0);
  const totalCost = positions.reduce((sum, p) => sum + (Number(p.cost_basis) || 0), 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-[90rem] space-y-8 animate-in fade-in duration-500">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border pb-8">
            <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Wallet size={28} />
                    </div>
                    My Portfolio
                </h1>
                <p className="text-muted-foreground ml-14">Track your performance and get AI-driven insights.</p>
            </div>

            <button 
                onClick={() => setIsAddOpen(true)}
                className="flex items-center gap-2 bg-primary text-black px-5 py-2.5 rounded-lg font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95"
            >
                <PlusCircle size={20} />
                Add Position
            </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatsCard 
                label="Total Value" 
                value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalValue)} 
                isCurrency 
            />
            <StatsCard 
                label="Total Gain/Loss" 
                value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalGain)} 
                subValue={`${totalGain >= 0 ? '+' : ''}${totalGainPct.toFixed(2)}%`}
                trend={totalGain >= 0 ? 'up' : 'down'}
            />
            <StatsCard 
                label="Positions" 
                value={positions.length.toString()} 
            />
        </div>

        {/* AI Widget */}
        <PortfolioAiWidget hasPositions={positions.length > 0} />

        {/* Table */}
        <div className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">Holdings</h2>
            <PortfolioTable 
                positions={positions} 
                loading={loading} 
                onDelete={handleDelete} 
            />
        </div>

        <AddPositionDialog 
            isOpen={isAddOpen} 
            onClose={() => setIsAddOpen(false)} 
            onSuccess={fetchPortfolio} 
        />

      </main>
    </div>
  );
}

function StatsCard({ label, value, subValue, trend }: any) {
    const isUp = trend === 'up';
    // const isDown = trend === 'down'; // unused
    
    return (
        <div className="p-6 bg-card border border-border rounded-xl shadow-sm hover:border-primary/50 transition-colors">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-bold text-foreground">{value}</span>
                {subValue && (
                    <span className={cn(
                        "text-sm font-medium px-2 py-0.5 rounded-full",
                        isUp ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                    )}>
                        {subValue}
                    </span>
                )}
            </div>
        </div>
    );
}
