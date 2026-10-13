
import { cloneElement, isValidElement, useId, useState, type MouseEvent, type ReactElement } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Upload, FileText, Loader2, Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dashboardKeys } from '../../hooks/useDashboardData';

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
    const formId = useId();
    const [fileName, setFileName] = useState('');

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setContent(text);
            setFileName(file.name);
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
            queryClient.invalidateQueries({ queryKey: dashboardKeys.recentResearch });

            setIsOpen(false);
            // Reset form
            setTitle('');
            setModel('');
            setContent('');
            setFileName('');
            if (!defaultTicker) setTicker('');
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error('Failed to upload research');
        } finally {
            setIsUploading(false);
        }
    };

    const copyPrompt = async () => {
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
        try {
            await navigator.clipboard.writeText(prompt);
            toast.success('Prompt copied to clipboard');
        } catch {
            toast.error('Could not copy the prompt');
        }
    };

    const open = () => setIsOpen(true);
    // The trigger stays the caller's own button: we only attach the click.
    const triggerNode = isValidElement(trigger) ? (
        cloneElement(trigger as ReactElement<{ onClick?: (e: MouseEvent<HTMLElement>) => void }>, {
            onClick: (e: MouseEvent<HTMLElement>) => {
                (trigger as ReactElement<{ onClick?: (e: MouseEvent<HTMLElement>) => void }>).props.onClick?.(e);
                open();
            },
        })
    ) : (
        <Button variant="outline" size="sm" className="gap-2" onClick={open}>
            <Upload size={14} aria-hidden /> Upload
        </Button>
    );

    return (
        <>
            {triggerNode}

            {/* The dialog panel is the only scroll container; the actions stay
                pinned to its bottom edge so they are always reachable. */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogHeader>
                    <DialogTitle>Upload research note</DialogTitle>
                    <DialogDescription>
                        Add research written elsewhere. It is scored like any other note.
                    </DialogDescription>
                </DialogHeader>

                <div className="mb-4 flex items-start justify-between gap-3 rounded-md bg-muted p-3">
                    <p className="min-w-0 text-[13px] leading-snug text-muted-foreground">
                        <span className="font-semibold text-foreground">Tip.</span> Generate the note with our system prompt
                        (ChatGPT, Claude, Gemini) so its figures and risk scores can be read.
                    </p>
                    <Button type="button" size="sm" variant="secondary" className="h-11 shrink-0 gap-1.5 bg-background lg:h-9" onClick={copyPrompt}>
                        <Copy size={14} aria-hidden /> Copy prompt
                    </Button>
                </div>

                <form id={formId} onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="ticker">Ticker symbol</Label>
                            <Input
                                id="ticker"
                                value={ticker}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTicker(e.target.value)}
                                placeholder="e.g. AAPL"
                                required
                                disabled={!!defaultTicker}
                                className={defaultTicker ? 'cursor-not-allowed bg-muted' : ''}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="model">Model used <span className="font-normal text-muted-foreground">(optional)</span></Label>
                            <Input
                                id="model"
                                value={model}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)}
                                placeholder="e.g. Claude, GPT"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="title">Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                            placeholder="Research title"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <Label htmlFor="content">Research content (Markdown)</Label>
                            <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring lg:min-h-9">
                                <FileText size={15} aria-hidden />
                                <span className="max-w-[12rem] truncate">{fileName || 'Choose a .md file'}</span>
                                <input type="file" accept=".md,.txt" className="sr-only" onChange={handleFileUpload} />
                            </label>
                        </div>
                        <Textarea
                            id="content"
                            value={content}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                            placeholder="# Analysis… (paste the note here, or choose a file)"
                            className="min-h-[150px] font-mono text-sm"
                            required
                        />
                    </div>
                </form>

                <DialogFooter sticky>
                    <Button type="button" variant="ghost" className="h-11 lg:h-10" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button type="submit" form={formId} className="h-11 gap-2 lg:h-10" disabled={isUploading || !content || !ticker}>
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                        Upload note
                    </Button>
                </DialogFooter>
            </Dialog>
        </>
    );
}
