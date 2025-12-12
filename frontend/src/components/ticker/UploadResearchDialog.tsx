
import { useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Upload, FileText, Loader2 } from 'lucide-react';
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
                status: 'completed'
            });

            // Refresh data
            queryClient.invalidateQueries({ queryKey: ['tickers'] });

            setIsOpen(false);
            // Reset form
            setTitle('');
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
                <div className="flex flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>Upload Research Note</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="ticker">Ticker Symbol</Label>
                            <Input
                                id="ticker"
                                value={ticker}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTicker(e.target.value)}
                                placeholder="e.g. AAPL"
                                required
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
