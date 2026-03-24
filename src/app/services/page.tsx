import { Button, Card, CardBody, CardHeader, Divider } from '@/components/ui';

export default function Services() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-4xl font-bold">我们的服务</h1>
        <p className="mb-12 text-xl text-gray-600">
          我们提供各种高质量的 Web 开发服务，帮助客户实现他们的业务目标。
        </p>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">Web 开发</h3>
              <p className="text-sm text-gray-500">定制化的 Web 应用开发</p>
            </CardHeader>
            <CardBody>
              <p>
                我们提供定制化的 Web 应用开发服务，根据客户的需求和业务目标， 开发高质量、高性能的
                Web 应用程序。
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">前端开发</h3>
              <p className="text-sm text-gray-500">现代化的前端解决方案</p>
            </CardHeader>
            <CardBody>
              <p>
                我们专注于使用最新的前端技术，开发响应式、高性能的用户界面， 提供出色的用户体验。
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">后端开发</h3>
              <p className="text-sm text-gray-500">强大的后端架构</p>
            </CardHeader>
            <CardBody>
              <p>我们设计和开发强大的后端架构，确保应用程序的可靠性、可扩展性和安全性。</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">移动应用开发</h3>
              <p className="text-sm text-gray-500">跨平台的移动应用</p>
            </CardHeader>
            <CardBody>
              <p>我们开发跨平台的移动应用，支持 iOS 和 Android 设备， 提供一致的用户体验。</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">UI/UX 设计</h3>
              <p className="text-sm text-gray-500">出色的用户界面设计</p>
            </CardHeader>
            <CardBody>
              <p>我们提供专业的 UI/UX 设计服务，帮助客户创建直观、美观和易用的用户界面。</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">技术咨询</h3>
              <p className="text-sm text-gray-500">专业的技术建议</p>
            </CardHeader>
            <CardBody>
              <p>
                我们提供专业的技术咨询服务，帮助客户选择合适的技术方案，
                优化现有系统的性能和可扩展性。
              </p>
            </CardBody>
          </Card>
        </div>

        <Divider className="my-12" />

        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold">开始您的项目</h2>
          <p className="mb-6">无论您的项目大小，我们都将为您提供最佳的技术支持和服务。</p>
          <Button color="primary" href="/contact">
            联系我们
          </Button>
        </div>
      </div>
    </div>
  );
}
