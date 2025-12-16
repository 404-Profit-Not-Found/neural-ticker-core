
/// <reference types="cypress" />
describe('Analyzer Feature', () => {
  beforeEach(() => {
    // Mock Backend APIs if needed or assume running dev server
    // For this test we will rely on real backend if available, or just check frontend routing/state
    cy.viewport(1280, 800);
  });

  it('navigates from Dashboard Strong Buy tile to Analyzer', () => {
    cy.visit('/dashboard');
    
    // Find "Strong Buy" tile (assuming text content or data-testid)
    // We might need to add data-testid to dashboard tile in a future step if selector is brittle
    cy.contains('Strong Buy').click();

    // Verify URL
    cy.url().should('include', '/analyzer');
    cy.url().should('include', 'filter=strong_buy');

    // Verify Filter State reflects url
    // Assuming UI shows "Strong Buy" selected in filter dropdown or badge
    cy.contains('Strong Buy').should('exist');
  });

  it('persists view mode and filters in URL', () => {
    cy.visit('/analyzer');

    // Toggle Grid View
    cy.get('button[title="Grid View"]').click();
    cy.url().should('include', 'view=grid');

    // Reload page
    cy.reload();
    cy.url().should('include', 'view=grid');
    // Verify Grid view is active (check for grid specific class or element)
    // This depends on implementation details, checking button active state often easiest
    cy.get('button[title="Grid View"]').should('have.class', 'bg-primary');

    // Apply Filter (Mocking interaction)
    // Providing a robust selector here requires us to know the FilterBar structure intimately
    // For now we check that if we visit URL directly, filters apply
  });

  it('loads state from URL directly', () => {
    cy.visit('/analyzer?view=table&aiRating=Buy');
    
    // Check View Mode
    cy.get('button[title="Table View"]').should('have.class', 'bg-primary');
    
    // Check Filter
    // FilterBar shows "1 selected" or similar
    cy.contains('1 selected').should('exist'); 
  });
});
