import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { RunAnalysisDialog } from './RunAnalysisDialog';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }));

const openDialog = (props: Partial<React.ComponentProps<typeof RunAnalysisDialog>> = {}) => {
  const onTrigger = vi.fn();
  render(
    <RunAnalysisDialog
      onTrigger={onTrigger}
      isAnalyzing={false}
      defaultTicker="NVDA"
      trigger={<button type="button">Research</button>}
      {...props}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Research' }));
  return { onTrigger, dialog: screen.getByRole('dialog') };
};

describe('RunAnalysisDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as Mock).mockReturnValue({ user: { id: 'u1', tier: 'pro', role: 'user' } });
  });

  it('opens from the caller’s own button — no wrapper element with a click handler', () => {
    const { container } = render(
      <RunAnalysisDialog onTrigger={vi.fn()} isAnalyzing={false} trigger={<button type="button">Research</button>} />,
    );
    // The trigger is the only thing rendered while closed.
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
    fireEvent.click(screen.getByRole('button', { name: 'Research' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not open while an analysis is running', () => {
    render(<RunAnalysisDialog onTrigger={vi.fn()} isAnalyzing trigger={<button type="button">Research</button>} />);
    fireEvent.click(screen.getByRole('button', { name: 'Research' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers the models as a radio group with the first one selected', () => {
    const { dialog } = openDialog();
    const group = within(dialog).getByRole('radiogroup', { name: 'AI model' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('runs the selected model with its default question for the ticker', () => {
    const { onTrigger, dialog } = openDialog();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Gemini 3\.8 Flash/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Run Gemini 3.8 Flash' }));

    expect(onTrigger).toHaveBeenCalledWith({
      provider: 'gemini',
      quality: 'medium',
      question: 'Give me a concise but detailed analysis for NVDA',
      modelKey: 'gemini-3.8-flash',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends custom instructions instead of the default question', () => {
    const { onTrigger, dialog } = openDialog();
    const toggle = within(dialog).getByRole('button', { name: 'Custom instructions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Focus on guidance' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Run / }));
    expect(onTrigger).toHaveBeenCalledWith(expect.objectContaining({ question: 'Focus on guidance' }));
  });

  it('locks the deep model for free users and says why', () => {
    (useAuth as Mock).mockReturnValue({ user: { id: 'u1', tier: 'free', role: 'user' } });
    const { dialog } = openDialog();
    const pro = within(dialog).getByRole('radio', { name: /Gemini 4 Argon/ });
    expect(pro).toBeDisabled();
    expect(pro).toHaveTextContent('Available on the Pro plan.');
  });

  it('shows what each model costs', () => {
    const { dialog } = openDialog();
    expect(within(dialog).getByRole('radio', { name: /Gemini 3\.5 Flash Lite/ })).toHaveTextContent('1 credit');
    expect(within(dialog).getByRole('radio', { name: /Gemini 4 Argon/ })).toHaveTextContent('5 credits');
  });

  it('can be cancelled', () => {
    const { onTrigger, dialog } = openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
