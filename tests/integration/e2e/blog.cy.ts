describe('博客页面', () => {
  beforeEach(() => {
    cy.visit('/blog');
  });

  it('应该显示页面标题和描述', () => {
    cy.get('h1').should('be.visible').and('contain', '博客');
    cy.get('p')
      .should('be.visible')
      .and('contain', '分享关于 Next.js、React、TypeScript 等技术的文章和教程');
  });

  it('应该显示博客文章列表', () => {
    cy.get('a[href^="/blog/"]').should('have.length.at.least', 6);
  });

  it('应该显示文章的基本信息', () => {
    // 检查第一篇文章的信息
    cy.get('a[href="/blog/nextjs-16-new-features"]').should('be.visible');
    cy.contains('Next.js 16 新特性介绍').should('be.visible');
    cy.contains('张三').should('be.visible');
    cy.contains('2026-02-20').should('be.visible');
  });

  it('应该正确导航到博客文章详情页', () => {
    cy.contains('Next.js 16 新特性介绍').click();
    cy.url().should('include', '/blog/nextjs-16-new-features');
    cy.get('h1').should('contain', 'Next.js 16 新特性介绍');
  });

  it('应该显示文章详情页的内容', () => {
    cy.visit('/blog/nextjs-16-new-features');

    cy.get('h1').should('contain', 'Next.js 16 新特性介绍');
    cy.get('.prose').should('be.visible');
    cy.contains('App Router 的优化').should('be.visible');
    cy.contains('性能提升').should('be.visible');
    cy.contains('返回博客').should('be.visible');
  });

  it('应该显示相关文章', () => {
    cy.visit('/blog/nextjs-16-new-features');

    cy.contains('相关文章').should('be.visible');
    cy.get('.prose + .grid').should('be.visible');
    cy.get('.prose + .grid a').should('have.length', 2);
  });

  it('应该有订阅表单', () => {
    cy.contains('订阅我们的博客').should('be.visible');
    cy.get('form').should('be.visible');
    cy.get('input[type="email"]').should('be.visible');
    cy.contains('订阅').should('be.visible');
  });

  it('订阅表单应该能正常工作', () => {
    cy.get('input[type="email"]').type('test@example.com');
    cy.contains('订阅').click();
    // 这里可以添加表单提交后的验证
  });

  it('应该响应式布局', () => {
    cy.viewport(1280, 720);
    cy.get('.grid').should('be.visible');

    cy.viewport(375, 667);
    cy.get('.grid').should('be.visible');
    cy.get('a[href^="/blog/"]').should('be.visible');
  });

  it('导航应该能正常工作', () => {
    cy.get('header').should('be.visible');
    cy.contains('首页').click();
    cy.url().should('eq', Cypress.config().baseUrl + '/');
  });
});
