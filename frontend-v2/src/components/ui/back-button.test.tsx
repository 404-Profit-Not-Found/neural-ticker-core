import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { BackButton } from './back-button';

function renderAt(entries: string[]) {
    return render(
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
            <Routes>
                <Route path="/profile" element={<BackButton label="Back" />} />
                <Route path="/portfolio" element={<p>portfolio page</p>} />
                <Route path="/dashboard" element={<p>dashboard page</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('BackButton', () => {
    it('returns to the page the user came from', () => {
        renderAt(['/portfolio', '/profile']);
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByText('portfolio page')).toBeInTheDocument();
    });

    it('goes to the fallback when the page was opened directly', () => {
        renderAt(['/profile']);
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByText('dashboard page')).toBeInTheDocument();
    });
});
