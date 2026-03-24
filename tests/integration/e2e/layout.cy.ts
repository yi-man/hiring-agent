describe('布局', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('应该显示头部导航', () => {
    cy.get('header').should('be.visible');
    cy.contains('Next.js 16').should('be.visible');
  });

  it('应该显示导航菜单', () => {
    cy.contains('首页').should('be.visible');
    cy.contains('关于').should('be.visible');
    cy.contains('服务').should('be.visible');
    cy.contains('博客').should('be.visible');
    cy.contains('联系').should('be.visible');
  });

  it('应该显示页脚', () => {
    cy.get('footer').should('be.visible');
    cy.contains('Next.js 16 SSR Template').should('be.visible');
  });

  it('应该正确加载字体', () => {
    cy.get('body').should('have.css', 'font-family').and('include', 'Inter');
  });
});
