import { BossLikeCandidateSourceAdapter } from '@/lib/candidate-screening/adapters/boss-like';
import type { BrowserStepResult } from '@/lib/jd-publishing/types';
import type { CandidateCommunicationSkillAdapter, UnreadCandidateMessage } from '../skill-types';

const EMPTY_RAW_SNAPSHOT_ERROR =
  'boss-like unread message search returned an empty browser snapshot';

function readAttr(attrs: string, name: string): string | null {
  return attrs.match(new RegExp(`${name}="([^"]+)"`, 'i'))?.[1]?.trim() ?? null;
}

function readTag(article: string, tag: string): string {
  return (
    article
      .match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim() ?? ''
  );
}

function readField(article: string, field: string): string {
  return (
    article
      .match(new RegExp(`<[^>]+data-field="${field}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim() ?? ''
  );
}

function resolveSameOriginUrl(baseUrl: string, value: string | null): string | null {
  if (!value) return null;
  try {
    const resolved = new URL(value, `${baseUrl.replace(/\/+$/, '')}/`);
    const base = new URL(baseUrl);
    return resolved.origin === base.origin ? resolved.toString() : null;
  } catch {
    return null;
  }
}

function parseReceivedAt(value: string | null): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function requireSuccessfulStep(
  result: Promise<BrowserStepResult>,
  action: string,
): Promise<BrowserStepResult> {
  const stepResult = await result;
  if (!stepResult.success) {
    throw new Error(stepResult.error ?? `${action} failed`);
  }
  return stepResult;
}

export function extractBossLikeUnreadMessagesFromHtml(
  html: string,
  baseUrl: string,
): UnreadCandidateMessage[] {
  return Array.from(html.matchAll(/<article\b([\s\S]*?)<\/article>/gi))
    .filter((match) => /data-unread="true"/i.test(match[1] ?? ''))
    .map((match) => {
      const article = match[0];
      const attrs = match[1] ?? '';
      const profileUrl = resolveSameOriginUrl(baseUrl, readAttr(attrs, 'data-profile-url'));
      const occurredAt = article.match(/<time[^>]*datetime="([^"]+)"/i)?.[1]?.trim() ?? null;
      return {
        externalMessageId: readAttr(attrs, 'data-message-id') ?? '',
        platformCandidateId: readAttr(attrs, 'data-candidate-id'),
        candidateName: readTag(article, 'h2') || null,
        profileUrl,
        content: readField(article, 'message'),
        receivedAt: parseReceivedAt(occurredAt),
      };
    })
    .filter((message) => message.externalMessageId && message.content);
}

export class BossLikeCandidateCommunicationAdapter
  extends BossLikeCandidateSourceAdapter
  implements CandidateCommunicationSkillAdapter
{
  async listUnreadMessages(): Promise<UnreadCandidateMessage[]> {
    await requireSuccessfulStep(this.executor.navigate(this.unreadMessageUrl()), 'open messages');
    const html = await this.readRawSnapshot();
    return extractBossLikeUnreadMessagesFromHtml(html, this.baseUrl);
  }

  private unreadMessageUrl(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/employer/messages`;
  }

  private async readRawSnapshot(): Promise<string> {
    if (!this.executor.snapshot) {
      throw new Error('boss-like unread message skill requires raw browser snapshots');
    }
    const html = await this.executor.snapshot();
    if (!html.trim()) {
      throw new Error(EMPTY_RAW_SNAPSHOT_ERROR);
    }
    return html;
  }
}
