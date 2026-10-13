import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import {
  ConfirmProvider,
  useConfirm,
  usePrompt,
  type ConfirmOptions,
  type PromptOptions,
} from './confirm';

const OPTIONS: ConfirmOptions = {
  title: 'Delete watchlist “Tech”?',
  description: 'The list and the tickers saved in it will be removed.',
  confirmLabel: 'Delete watchlist',
  destructive: true,
};

function Opener({ onResult }: { onResult: (value: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button type="button" onClick={async () => onResult(await confirm(OPTIONS))}>
      Open
    </button>
  );
}

async function openDialog() {
  const onResult = vi.fn();
  const user = userEvent.setup();
  render(
    <ConfirmProvider>
      <Opener onResult={onResult} />
    </ConfirmProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = await screen.findByRole('dialog');
  return { onResult, user, dialog };
}

describe('ConfirmProvider / useConfirm', () => {
  it('renders a dialog with an accessible name taken from the title', async () => {
    const { dialog, onResult } = await openDialog();

    expect(dialog).toHaveAccessibleName('Delete watchlist “Tech”?');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(OPTIONS.description as string)).toBeInTheDocument();
    // Still pending: nothing is resolved until the user answers.
    expect(onResult).not.toHaveBeenCalled();
  });

  it('resolves true when the confirm button is clicked', async () => {
    const { dialog, onResult, user } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Delete watchlist' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when the cancel button is clicked', async () => {
    const { dialog, onResult, user } = await openDialog();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resolves false when Escape is pressed', async () => {
    const { onResult, user } = await openDialog();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts initial focus on Cancel for destructive actions, so Enter cannot delete', async () => {
    const { dialog, onResult, user } = await openDialog();

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});

describe('ConfirmProvider / usePrompt', () => {
  const PROMPT: PromptOptions = {
    title: 'Gift credits',
    label: 'Credits',
    defaultValue: '1',
    confirmLabel: 'Send credits',
    validate: (v) => (/^[1-9]\d*$/.test(v) ? null : 'Enter a whole number greater than 0.'),
  };

  function PromptOpener({ onResult }: { onResult: (value: string | null) => void }) {
    const prompt = usePrompt();
    return (
      <button type="button" onClick={async () => onResult(await prompt(PROMPT))}>
        Open
      </button>
    );
  }

  async function openPrompt() {
    const onResult = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <PromptOpener onResult={onResult} />
      </ConfirmProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Gift credits' });
    return { onResult, user, dialog, field: within(dialog).getByLabelText('Credits') };
  }

  it('focuses the labelled field, prefilled with the default value', async () => {
    const { field } = await openPrompt();
    expect(field).toHaveFocus();
    expect(field).toHaveValue('1');
  });

  it('resolves with the trimmed text on submit (Enter)', async () => {
    const { field, onResult, user } = await openPrompt();

    await user.clear(field);
    await user.type(field, '  25 {Enter}');

    await waitFor(() => expect(onResult).toHaveBeenCalledWith('25'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('blocks invalid input with an announced error and stays open', async () => {
    const { dialog, field, onResult, user } = await openPrompt();

    await user.clear(field);
    await user.type(field, '-3');
    await user.click(within(dialog).getByRole('button', { name: 'Send credits' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/whole number/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(onResult).not.toHaveBeenCalled();
  });

  it('requires a value', async () => {
    const { dialog, field, onResult, user } = await openPrompt();

    await user.clear(field);
    await user.click(within(dialog).getByRole('button', { name: 'Send credits' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/required/i);
    expect(onResult).not.toHaveBeenCalled();
  });

  it('resolves null when cancelled', async () => {
    const { dialog, onResult, user } = await openPrompt();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(null));
  });
});
