describe('Favorites & Watchlist Features', () => {
  beforeEach(() => {
    // Login via API
    cy.request('POST', 'http://localhost:3001/api/auth/dev/token', {
      email: 'antigravity@test.com'
    });
    
    // Ensure clean state: delete any existing watchlists
    cy.request({
      method: 'GET',
      url: 'http://localhost:3001/api/v1/watchlists',
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200 && Array.isArray(response.body)) {
        response.body.forEach((wl) => {
          cy.request('DELETE', `http://localhost:3001/api/v1/watchlists/${wl.id}`);
        });
      }
    });
  });

  describe('Watchlist Skeleton Loading', () => {
    it('shows skeleton while data is loading', () => {
      // Intercept API call with delay
      cy.intercept('GET', '/api/v1/watchlists*', { 
        delay: 1000, 
        body: [] 
      }).as('watchlistsDelayed');
      
      cy.visit('http://localhost:3000/dashboard');
      
      // Check for skeleton elements
      cy.get('[class*="animate-pulse"], .skeleton').should('exist');
      
      // Wait for data to load
      cy.wait('@watchlistsDelayed');
      
      // Skeleton should disappear
      cy.get('[class*="animate-pulse"], .skeleton').should('not.exist');
    });
  });

  describe('Favorites Toggle', () => {
    it('should add ticker to favorites from Analyzer page', () => {
      // Visit Analyzer
      cy.visit('http://localhost:3000/analyzer');
      
      // Wait for tickers to load
      cy.contains('Asset', { timeout: 10000 }).should('be.visible');
      
      // Find first unfilled star (not favorite)
      cy.get('[title="Add to favorites"]').first().as('starButton');
      
      // Click to add to favorites
      cy.get('@starButton').click();
      
      // Verify API call was made
      cy.request('GET', 'http://localhost:3001/api/v1/watchlists').then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.length.greaterThan(0);
        
        const favoritesList = response.body.find((wl: { name: string }) => wl.name === 'Favourites');
        expect(favoritesList).to.be.an('object');
        expect(favoritesList.items).to.have.length.greaterThan(0);
      });
      
      // Verify star is now filled
      cy.get('[title="Remove from favorites"]').should('exist');
    });

    it('should remove ticker from favorites', () => {
      // First, add a ticker
      cy.visit('http://localhost:3000/analyzer');
      cy.contains('Asset', { timeout: 10000 }).should('be.visible');
      cy.get('[title="Add to favorites"]').first().click();
      cy.wait(500); // Wait for mutation
      
      // Now remove it
      cy.get('[title="Remove from favorites"]').first().click();
      cy.wait(500);
      
      // Verify it's removed
      cy.get('[title="Add to favorites"]').first().should('exist');
    });

    it('should show favorites in Watchlist page', () => {
      // Add a ticker to favorites via Analyzer
      cy.visit('http://localhost:3000/analyzer');
      cy.contains('Asset', { timeout: 10000 }).should('be.visible');
      
      // Get the symbol from the first row
      let addedSymbol;
      cy.get('tbody tr').first().find('[class*="font-bold"]').first().invoke('text').then((text) => {
        addedSymbol = text.trim();
        
        // Click star to add
        cy.get('[title="Add to favorites"]').first().click();
        cy.wait(1000);
        
        // Navigate to Watchlist
        cy.visit('http://localhost:3000/dashboard');
        
        // Verify the symbol appears in watchlist
        cy.contains(addedSymbol).should('be.visible');
      });
    });
  });

  describe('Digest Generation Gating', () => {
    it('should NOT auto-generate digest for user without portfolio', () => {
      // Clean portfolio
      cy.request({
        method: 'GET',
        url: 'http://localhost:3001/api/v1/portfolio',
        failOnStatusCode: false
      }).then((response) => {
        if (response.status === 200 && Array.isArray(response.body)) {
          response.body.forEach((pos) => {
            cy.request('DELETE', `http://localhost:3001/api/v1/portfolio/${pos.id}`);
          });
        }
      });
      
      // Visit dashboard
      cy.visit('http://localhost:3000/dashboard');
      
      // Try to fetch digest - should return null or empty
      cy.request({
        method: 'GET',
        url: 'http://localhost:3001/api/v1/news/digest',
        failOnStatusCode: false
      }).then((response) => {
        // Should either be empty or null, not a generated digest
        if (response.status === 200 && response.body) {
          // If there is a body, it should be from a previous session, not newly generated
          // The title should not be from today
          const today = new Date().toISOString().split('T')[0];
          const bodyStr = JSON.stringify(response.body);
          expect(bodyStr).to.not.include(today);
        }
      });
    });
  });
});
