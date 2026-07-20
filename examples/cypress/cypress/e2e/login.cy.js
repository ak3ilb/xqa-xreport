describe('Auth', () => {
  it('logs in @smoke', () => {
    cy.xreportMeta({ owner: 'identity', severity: 'critical' });
    cy.visit('https://example.cypress.io');
    cy.contains('type').click();
    cy.xreportNote({ url: '/commands/actions' }, 'nav');
    cy.url().should('include', '/commands/actions');
  });

  it('rejects bad assertion @smoke', () => {
    cy.xreportMeta({ owner: 'identity', severity: 'high', labels: { jira: 'CY-1' } });
    cy.visit('https://example.cypress.io');
    cy.get('h1').should('contain', 'ThisWillFailOnPurpose');
  });
});
