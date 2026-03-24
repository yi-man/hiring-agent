describe('联系页面', () => {
  beforeEach(() => {
    cy.visit('/contact');
  });

  it('应该显示页面标题和描述', () => {
    cy.get('h1').should('be.visible').and('contain', '联系我们');
    cy.get('p').should('be.visible').and('contain', '如有任何问题或建议，请随时联系我们');
  });

  it('应该显示联系信息卡片', () => {
    cy.contains('联系信息').should('be.visible');
    cy.contains('我们的联系方式').should('be.visible');

    // 检查联系信息
    cy.contains('contact@example.com').should('be.visible');
    cy.contains('+86 123 4567 8900').should('be.visible');
    cy.contains('北京市朝阳区建国路88号').should('be.visible');
    cy.contains('周一至周五: 9:00 - 18:00').should('be.visible');
  });

  it('应该显示发送消息表单', () => {
    cy.contains('发送消息').should('be.visible');
    cy.contains('请填写以下表单，我们会尽快回复您').should('be.visible');

    // 检查表单字段
    cy.get('#name').should('be.visible');
    cy.get('#email').should('be.visible');
    cy.get('#subject').should('be.visible');
    cy.get('#message').should('be.visible');
    cy.contains('发送消息').should('be.visible');
  });

  it('表单应该能正常输入', () => {
    cy.get('#name').type('张三');
    cy.get('#email').type('zhangsan@example.com');
    cy.get('#subject').type('关于网站的问题');
    cy.get('#message').type('我有一个关于网站功能的问题，希望得到您的帮助');

    cy.get('#name').should('have.value', '张三');
    cy.get('#email').should('have.value', 'zhangsan@example.com');
    cy.get('#subject').should('have.value', '关于网站的问题');
    cy.get('#message').should('have.value', '我有一个关于网站功能的问题，希望得到您的帮助');
  });

  it('应该有位置信息', () => {
    cy.contains('我们的位置').should('be.visible');
    cy.get('.bg-gray-100').should('be.visible');
    cy.contains('地图占位符').should('be.visible');
  });

  it('导航应该能正常工作', () => {
    cy.get('header').should('be.visible');
    cy.contains('首页').click();
    cy.url().should('eq', Cypress.config().baseUrl + '/');
  });

  it('应该响应式布局', () => {
    cy.viewport(1280, 720);
    cy.get('.grid').should('have.class', 'md:grid-cols-2');

    cy.viewport(375, 667);
    cy.get('.grid').should('not.have.class', 'md:grid-cols-2');
    cy.get('.grid').should('have.class', 'grid-cols-1');
  });

  it('应该显示页脚', () => {
    cy.get('footer').should('be.visible');
    cy.contains('Next.js 16 SSR Template').should('be.visible');
  });

  it('发送消息按钮应该能点击', () => {
    cy.get('button[type="submit"]').should('be.visible').and('contain', '发送消息');
    cy.get('button[type="submit"]').should('not.be.disabled');
  });

  it('表单验证应该正常工作', () => {
    // 这里可以添加表单验证的测试
    // 例如：空值提交、无效邮箱格式等
  });
});
