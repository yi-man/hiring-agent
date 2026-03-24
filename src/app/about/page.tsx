import { Button, Card, CardBody, CardHeader } from '@/components/ui';
import { Divider } from '@heroui/react';

export default function About() {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-4xl font-bold">关于我们</h1>
        <p className="mb-12 text-xl text-gray-600">
          我们是一个专注于现代 Web 开发的团队，致力于提供高质量的技术解决方案。
        </p>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">我们的使命</h3>
              <p className="text-sm text-gray-500">提供出色的 Web 开发体验</p>
            </CardHeader>
            <CardBody>
              <p>
                我们的使命是通过使用最新的技术和最佳实践，为用户提供出色的 Web 开发体验。
                我们相信，优秀的技术应该是简单、直观且强大的。
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">我们的愿景</h3>
              <p className="text-sm text-gray-500">成为领先的 Web 开发团队</p>
            </CardHeader>
            <CardBody>
              <p>
                我们的愿景是成为领先的 Web 开发团队，通过创新和卓越的技术能力，
                帮助客户实现他们的业务目标。
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">我们的价值观</h3>
              <p className="text-sm text-gray-500">指导我们工作的原则</p>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2">
                <li>• 质量第一</li>
                <li>• 持续学习</li>
                <li>• 团队合作</li>
                <li>• 创新思维</li>
                <li>• 客户导向</li>
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-xl font-bold">我们的团队</h3>
              <p className="text-sm text-gray-500">专业的开发人员</p>
            </CardHeader>
            <CardBody>
              <p>
                我们的团队由经验丰富的开发人员组成，他们在各种技术领域拥有深厚的专业知识。
                我们致力于为用户提供最佳的技术支持和服务。
              </p>
            </CardBody>
          </Card>
        </div>

        <Divider className="my-12" />

        <div className="text-center">
          <h2 className="mb-4 text-2xl font-bold">联系我们</h2>
          <p className="mb-6">如有任何问题或建议，请随时联系我们。我们将竭诚为您服务。</p>
          <Button color="primary" href="/contact">
            联系我们
          </Button>
        </div>
      </div>
    </div>
  );
}
