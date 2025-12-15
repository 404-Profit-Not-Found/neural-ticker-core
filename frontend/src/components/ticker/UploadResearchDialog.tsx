
import { useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Upload, FileText, Loader2, Terminal, Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

interface UploadResearchDialogProps {
    defaultTicker?: string;
    trigger?: React.ReactNode;
}

export function UploadResearchDialog({ defaultTicker, trigger }: UploadResearchDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [title, setTitle] = useState('');
    const [model, setModel] = useState('');
    const [ticker, setTicker] = useState(defaultTicker || '');
    const [content, setContent] = useState('');
    const queryClient = useQueryClient();

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setContent(text);
            // Auto-set title from filename if empty
            if (!title) {
                setTitle(file.name.replace(/\.md$/, ''));
            }
        };
        reader.readAsText(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content || !ticker) return;

        try {
            setIsUploading(true);
            await api.post('/research/upload', {
                tickers: [ticker.toUpperCase()], // Standardize to uppercase array
                title: title || `Manual Upload: ${ticker}`,
                content,
                status: 'completed',
                model: model || undefined
            });

            // Refresh data
            queryClient.invalidateQueries({ queryKey: ['tickers'] });

            setIsOpen(false);
            // Reset form
            setTitle('');
            setModel('');
            setContent('');
            if (!defaultTicker) setTicker('');
        } catch (error) {
            console.error('Upload failed:', error);
            // Ideally show toast error here
            alert('Failed to upload research.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <>
            <div onClick={() => setIsOpen(true)} className="inline-flex cursor-pointer">
                {trigger || (
                    <Button variant="outline" size="sm" className="gap-2">
                        <Upload size={14} /> Upload
                    </Button>
                )}
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <div className="flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Upload Research Note</DialogTitle>
                    </DialogHeader>

                    {/* PROMPT COPY SECTION */}
                    <div className="bg-muted/30 p-4 rounded-lg border border-border space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-semibold flex items-center gap-2">
                                <Terminal size={14} className="text-primary" />
                                System Prompt
                            </span>
                            <Button
                                size="sm"
                                variant="secondary"
                                className="h-6 text-xs gap-1"
                                onClick={() => {
                                    const prompt = `ROLE: Senior Equity Research Analyst.
TASK: Deep dive due diligence on ${ticker || '[TICKER]'}.
FOCUS: Growth, Moat, Risks, Valuation.

CRITICAL DATA REQUIREMENT:
You MUST search for and explicitly include the following TTM (Trailing Twelve Month) and MRQ (Most Recent Quarter) data in your report if available:
- Revenue, Gross Margin, Operating Margin, Net Profit Margin
- ROE, ROA
- Debt-to-Equity, Debt-to-Assets, Interest Coverage
- Current Ratio, Quick Ratio
- P/E, PEG, Price-to-Book
- Free Cash Flow
- Latest Analyst Ratings (Firm, Rating, Price Target)

Present these numbers clearly in the text or a table so they can be parsed for downstream systems.

CRITICAL SECTION REQUIREMENT:
You MUST include a "Risk/Reward Profile" section at the end of your report with the following specific format:
- Overall Score: [0-10] (10 = Best Risk/Reward)
- Financial Risk: [0-10] (10 = High Risk)
- Execution Risk: [0-10] (10 = High Risk)
- Reward Target: Estimated 12m price target ($)
- Upside: % Return to target
- Scenarios:
  - Bull: $X.XX (Rationale)
  - Base: $X.XX (Rationale)
  - Bear: $X.XX (Rationale)
`;
                                    navigator.clipboard.writeText(prompt);
                                    // ideally show toast here
                                    alert("Prompt Copied to Clipboard!");
                                }}
                            >
                                <Copy size={12} /> Copy Prompt
                            </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Use this exact prompt with ChatGPT/Claude/Gemini to ensure your research is scored correctly.
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="ticker">Ticker Symbol</Label>
                            <Input
                                id="ticker"
                                value={ticker}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTicker(e.target.value)}
                                placeholder="e.g. AAPL"
                                required
                                disabled={!!defaultTicker}
                                className={defaultTicker ? 'bg-muted cursor-not-allowed' : ''}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="title">Title (Optional)</Label>
                            <Input
                                id="title"
                                value={title}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                                placeholder="Research Title"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="model">Model Used (Optional)</Label>
                            <Input
                                id="model"
                                value={model}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)}
                                placeholder="e.g. o1-preview, Claude 3.5 Sonnet"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="block">Content source</Label>
                            <div className="grid grid-cols-2 gap-4">
                                <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                                    <FileText className="w-6 h-6 mb-2 text-muted-foreground" />
                                    <span className="text-xs">Select Markdown File</span>
                                    <input type="file" accept=".md,.txt" className="hidden" onChange={handleFileUpload} />
                                </label>
                                <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-border rounded-lg bg-muted/10">
                                    <span className="text-xs text-center px-2 text-muted-foreground">
                                        Or paste text below
                                    </span>
                                </label>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="content">Research Content (Markdown)</Label>
                            <Textarea
                                id="content"
                                value={content}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                                placeholder="# Analysis..."
                                className="min-h-[150px] font-mono text-xs"
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={isUploading || !content || !ticker}>
                                {isUploading ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                                Upload Note
                            </Button>
                        </div>
                    </form>
                </div>
            </Dialog>
        </>
    );
}
