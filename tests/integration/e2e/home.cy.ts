describe('首页', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('应该显示页面标题', () => {
    cy.get('h1').should('be.visible');
    cy.title().should('contain', 'Next.js');
  });

  it('应该能切换主题', () => {
    cy.getByTestId('theme-toggle').click();
    cy.get('html').should('have.class', 'dark');
    cy.getByTestId('theme-toggle').click();
    cy.get('html').should('not.have.class', 'dark');
  });

  it('应该响应式布局', () => {
    cy.viewport(1280, 720);
    cy.get('header').should('be.visible');
    cy.viewport(375, 667);
    cy.get('header').should('be.visible');
  });
});
