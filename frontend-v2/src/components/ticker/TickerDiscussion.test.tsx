import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { TickerDiscussion } from './TickerDiscussion';
import { useAuth } from '../../context/AuthContext';
import type { SocialComment } from '../../types/ticker';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../hooks/useUserSearch', () => ({ useUserSearch: () => ({ data: [] }) }));

const comment = (id: string, extra: Partial<SocialComment> = {}): SocialComment => ({
  id,
  user: { nickname: `User${id}` },
  created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  content: `Comment ${id}`,
  like_count: 0,
  ...extra,
});

const baseProps = {
  comments: [] as SocialComment[],
  onPostComment: vi.fn(),
  isPosting: false,
};

describe('TickerDiscussion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({ user: { id: 'u1', nickname: 'Me', role: 'user' } });
  });

  it('shows a compact empty state and a labelled composer', () => {
    render(<TickerDiscussion {...baseProps} />);
    expect(screen.getByText('No discussion yet')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post comment' })).toBeDisabled();
  });

  it('posts on Enter and clears the field once the post succeeds', async () => {
    const onPostComment = vi.fn().mockResolvedValue(undefined);
    render(<TickerDiscussion {...baseProps} onPostComment={onPostComment} />);
    const field = screen.getByRole('textbox', { name: 'Add a comment' });

    fireEvent.change(field, { target: { value: 'Nice quarter', selectionStart: 12 } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onPostComment).toHaveBeenCalledWith('Nice quarter', undefined);
    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('keeps the draft when posting fails', async () => {
    const onPostComment = vi.fn().mockRejectedValue(new Error('too long'));
    render(<TickerDiscussion {...baseProps} onPostComment={onPostComment} />);
    const field = screen.getByRole('textbox', { name: 'Add a comment' });

    fireEvent.change(field, { target: { value: 'Nice quarter', selectionStart: 12 } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(onPostComment).toHaveBeenCalled());
    // Give the rejected promise a turn; the text must still be there.
    await Promise.resolve();
    expect(field).toHaveValue('Nice quarter');
  });

  it('caps the comment at the length the API accepts', () => {
    render(<TickerDiscussion {...baseProps} />);
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toHaveAttribute('maxlength', '4000');
  });

  it('does not post an empty or whitespace-only comment', () => {
    const onPostComment = vi.fn();
    render(<TickerDiscussion {...baseProps} onPostComment={onPostComment} />);
    const field = screen.getByRole('textbox', { name: 'Add a comment' });
    fireEvent.change(field, { target: { value: '   ', selectionStart: 3 } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onPostComment).not.toHaveBeenCalled();
  });

  it('replies under the top-level comment and moves focus to the composer', () => {
    const onPostComment = vi.fn();
    const thread = comment('1', { replies: [comment('2', { parent_id: '1' })] });
    render(<TickerDiscussion {...baseProps} comments={[thread]} onPostComment={onPostComment} />);

    // Replying to a reply still threads under comment 1.
    fireEvent.click(screen.getByRole('button', { name: 'Reply to User2' }));

    const field = screen.getByRole('textbox', { name: 'Reply to User2' });
    expect(field).toHaveFocus();
    expect(screen.getByText(/Replying to/)).toHaveTextContent('@User2');

    fireEvent.change(field, { target: { value: 'Agreed', selectionStart: 6 } });
    fireEvent.click(screen.getByRole('button', { name: 'Post reply' }));
    expect(onPostComment).toHaveBeenCalledWith('Agreed', '1');
  });

  it('cancels a reply', () => {
    render(<TickerDiscussion {...baseProps} comments={[comment('1')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reply to User1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(screen.queryByText(/Replying to/)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toBeInTheDocument();
  });

  it('exposes the like state and count to assistive tech', () => {
    const onToggleLike = vi.fn();
    render(
      <TickerDiscussion
        {...baseProps}
        comments={[comment('1', { like_count: 14 }), comment('2')]}
        likedCommentIds={['1']}
        onToggleLike={onToggleLike}
      />,
    );
    const liked = screen.getByRole('button', { name: 'Unlike comment by User1, 14 likes' });
    expect(liked).toHaveAttribute('aria-pressed', 'true');
    const notLiked = screen.getByRole('button', { name: 'Like comment by User2' });
    expect(notLiked).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(notLiked);
    expect(onToggleLike).toHaveBeenCalledWith('2');
  });

  it('shows relative times and counts replies in the total', () => {
    render(<TickerDiscussion {...baseProps} comments={[comment('1', { replies: [comment('2'), comment('3')] })]} />);
    expect(screen.getAllByText('2h ago')).toHaveLength(3);
    expect(screen.getByLabelText('3 comments')).toHaveTextContent('3');
  });

  it('collapses long discussions instead of scrolling inside a box', () => {
    const comments = Array.from({ length: 8 }, (_, i) => comment(String(i + 1)));
    render(<TickerDiscussion {...baseProps} comments={comments} />);

    expect(screen.getByText('Comment 5')).toBeInTheDocument();
    expect(screen.queryByText('Comment 6')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more threads' }));
    expect(screen.getByText('Comment 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('only offers delete to admins, as a real labelled button', () => {
    const onDeleteComment = vi.fn();
    const { unmount } = render(<TickerDiscussion {...baseProps} comments={[comment('1')]} onDeleteComment={onDeleteComment} />);
    expect(screen.queryByRole('button', { name: /Delete comment/ })).toBeNull();
    unmount();

    (useAuth as Mock).mockReturnValue({ user: { id: 'a1', nickname: 'Admin', role: 'admin' } });
    render(<TickerDiscussion {...baseProps} comments={[comment('1', { moderation_status: 'flagged' })]} onDeleteComment={onDeleteComment} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment by User1' }));
    expect(onDeleteComment).toHaveBeenCalledWith('1');
    expect(screen.getByText('Flagged')).toBeInTheDocument();
  });

  it('resolves mentions to nicknames', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    render(
      <TickerDiscussion
        {...baseProps}
        comments={[comment('1', { content: `Ask <@${id}> about it` })]}
        mentionedUsers={{ [id]: { id, nickname: 'SwiftFalcon482', avatar_url: null, tier: 'pro' } }}
      />,
    );
    const body = screen.getByText(/Ask/);
    expect(within(body).getByText('SwiftFalcon482')).toBeInTheDocument();
  });
});
