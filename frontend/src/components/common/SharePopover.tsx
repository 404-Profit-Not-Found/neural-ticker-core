import React from 'react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Share2, Link as LinkIcon, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

export function SharePopover({ researchId, title }: { researchId: string; title: string }) {
    const [loading, setLoading] = React.useState(false);
    const [shareUrl, setShareUrl] = React.useState<string | null>(null);

    const getLink = async () => {
        if (shareUrl) return shareUrl;
        setLoading(true);
        try {
            const { data } = await api.get(`/research/${researchId}/share-link`);
            console.log('Share Link API Response:', data); // Debugging

            const path = data.path || (data.signature ? `/report/${researchId}/${data.signature}` : null);

            if (!path) {
                console.error('Invalid response structure:', data);
                throw new Error('Failed to retrieve share link path');
            }

            const url = `${window.location.origin}${path}`;
            setShareUrl(url);
            return url;
        } catch (err: unknown) {
            console.error('Share link generation failed:', err);
            const axiosError = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
            const status = axiosError.response?.status;
            const msg = axiosError.response?.data?.message || axiosError.message;
            alert(`Failed to generate secure link. Error: ${status ? `${status} ` : ''}${msg}`);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        const url = await getLink();
        if (url) {
            await navigator.clipboard.writeText(url);
            alert('Secure public link copied to clipboard!');
        }
    };

    const handleSocial = async (platform: 'twitter' | 'linkedin' | 'facebook', e: React.MouseEvent) => {
        e.preventDefault();
        const url = await getLink();
        if (!url) return;

        let href = '';
        if (platform === 'twitter') href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
        if (platform === 'linkedin') href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        if (platform === 'facebook') href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

        window.open(href, '_blank', 'noopener,noreferrer');
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-2 h-auto px-3 py-1.5 bg-muted/30 rounded-full border border-border/40 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
                >
                    <Share2 size={14} className="text-muted-foreground" />
                    <span className="hidden md:inline">Share</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="end">
                <div className="flex flex-col gap-1">
                    <button
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left disabled:opacity-50"
                        onClick={handleCopy}
                        disabled={loading}
                    >
                        {loading ? <Loader2 size={12} className="animate-spin" /> : <LinkIcon size={12} />}
                        Copy Public Link
                    </button>
                    <div className="h-px bg-border my-1" />
                    <button
                        onClick={(e) => handleSocial('twitter', e)}
                        disabled={loading}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left disabled:opacity-50"
                    >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        Share on X
                    </button>
                    <button
                        onClick={(e) => handleSocial('linkedin', e)}
                        disabled={loading}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left disabled:opacity-50"
                    >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                        Share on LinkedIn
                    </button>
                    <button
                        onClick={(e) => handleSocial('facebook', e)}
                        disabled={loading}
                        className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-left disabled:opacity-50"
                    >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                        Share on Facebook
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
