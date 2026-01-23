
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AboutPage } from '../../pages/AboutPage';

describe('AboutPage', () => {
    it('renders the branding title', () => {
        render(<AboutPage />);
        expect(screen.getByText(/Built for the/i)).toBeInTheDocument();
        expect(screen.getByText(/Autonomous Investor/i)).toBeInTheDocument();
    });

    it('renders the origin story section', () => {
        render(<AboutPage />);
        expect(screen.getByText(/The Origin Story/i)).toBeInTheDocument();
        expect(screen.getByText(/Branislav Lang/i)).toBeInTheDocument();
    });

    it('renders core value cards', () => {
        render(<AboutPage />);
        expect(screen.getByText(/Agentic Research/i)).toBeInTheDocument();
        expect(screen.getByText(/Unified Portfolio/i)).toBeInTheDocument();
        expect(screen.getByText(/High-Conviction Filters/i)).toBeInTheDocument();
    });
});
