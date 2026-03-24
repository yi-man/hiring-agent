Cypress.Commands.add('getByTestId', (testId: string) => {
  return cy.get(`[data-testid="${testId}"]`);
});

Cypress.Commands.add('checkHydration', () => {
  return cy.window().should('have.property', '__NEXT_DATA__');
});
