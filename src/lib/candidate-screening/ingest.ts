import { createHash, randomUUID } from 'node:crypto';
import { embedDocuments, getConfiguredEmbeddingModel } from '@/lib/rag/embed';
import { splitMarkdownToChunks } from '@/lib/rag/markdown';
import { createCandidateIdentity } from './dedupe';
import {
  createOrReuseCandidateResume,
  findCandidateByIdentity,
  findCandidateResumeByHash,
  replaceCandidateResumeChunks,
  upsertCandidateWithIdentity,
} from './repo';
import type { CandidateScreeningPlatform } from './types';

export type RawCandidate = {
  platformCandidateId?: string | null;
  name: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  experienceYears?: number | null;
  resumeText: string;
  profileUrl?: string | null;
  lastActiveAt?: string | null;
};

export type IngestRawCandidateResult = {
  candidateId: string;
  resumeId: string;
  identityHash: string;
  chunkCount: number;
  candidateContacted: boolean;
  candidateWasExisting: boolean;
  resumeWasExisting: boolean;
  existingCandidateId: string | null;
  existingCandidateName: string | null;
  existingResumeId: string | null;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseOptionalDate(value?: string | null): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function ingestRawCandidate(params: {
  userId: string;
  sourcePlatform: CandidateScreeningPlatform;
  rawCandidate: RawCandidate;
}): Promise<IngestRawCandidateResult> {
  const rawCandidate = params.rawCandidate;
  const resumeText = rawCandidate.resumeText.trim();
  if (!resumeText) {
    throw new Error('resume text must not be empty');
  }

  const identity = createCandidateIdentity({
    sourcePlatform: params.sourcePlatform,
    platformCandidateId: rawCandidate.platformCandidateId,
    profileUrl: rawCandidate.profileUrl,
    name: rawCandidate.name,
    company: rawCandidate.company,
    title: rawCandidate.title,
  });
  const resumeHash = sha256(resumeText);
  const existingCandidate = await findCandidateByIdentity({
    userId: params.userId,
    sourcePlatform: params.sourcePlatform,
    identityHash: identity.identityHash,
  });

  const candidate = await upsertCandidateWithIdentity({
    userId: params.userId,
    sourcePlatform: params.sourcePlatform,
    displayName: rawCandidate.name,
    identityKey: identity.identityKey,
    identityHash: identity.identityHash,
    ...(rawCandidate.title !== undefined ? { currentTitle: rawCandidate.title } : {}),
    ...(rawCandidate.company !== undefined ? { currentCompany: rawCandidate.company } : {}),
    ...(rawCandidate.location !== undefined ? { location: rawCandidate.location } : {}),
    ...(rawCandidate.experienceYears !== undefined
      ? { experienceYears: rawCandidate.experienceYears }
      : {}),
    ...(rawCandidate.platformCandidateId !== undefined
      ? { platformCandidateId: rawCandidate.platformCandidateId }
      : {}),
    ...(rawCandidate.profileUrl !== undefined ? { profileUrl: rawCandidate.profileUrl } : {}),
    ...(rawCandidate.lastActiveAt !== undefined
      ? { lastActiveAt: parseOptionalDate(rawCandidate.lastActiveAt) }
      : {}),
  });
  const existingResume = await findCandidateResumeByHash({
    userId: params.userId,
    candidateId: candidate.id,
    resumeHash,
  });

  if (existingResume) {
    return {
      candidateId: candidate.id,
      resumeId: existingResume.id,
      identityHash: identity.identityHash,
      chunkCount: 0,
      candidateContacted: candidate.contacted,
      candidateWasExisting: existingCandidate !== null,
      resumeWasExisting: true,
      existingCandidateId: existingCandidate?.id ?? null,
      existingCandidateName: existingCandidate?.displayName ?? null,
      existingResumeId: existingResume.id,
    };
  }

  const resume = await createOrReuseCandidateResume({
    userId: params.userId,
    candidateId: candidate.id,
    sourcePlatform: params.sourcePlatform,
    profileUrl: rawCandidate.profileUrl ?? null,
    rawText: resumeText,
    structuredSummary: null,
    resumeHash,
    fetchedAt: new Date(),
  });

  const chunks = await splitMarkdownToChunks(resumeText);
  if (chunks.length === 0) {
    throw new Error('resume produced no indexable chunks');
  }

  const embeddings = await embedDocuments(chunks.map((chunk) => chunk.content));
  if (embeddings.length !== chunks.length) {
    throw new Error('embedding count does not match resume chunks');
  }
  const firstEmbedding = embeddings[0];
  if (!firstEmbedding || embeddings.some((embedding) => embedding.length === 0)) {
    throw new Error('embedding vectors are empty');
  }
  const vectorSize = firstEmbedding.length;
  if (embeddings.some((embedding) => embedding.length !== vectorSize)) {
    throw new Error('embedding vector dimensions do not match');
  }

  await replaceCandidateResumeChunks({
    userId: params.userId,
    candidateId: candidate.id,
    resumeId: resume.id,
    embeddingModel: getConfiguredEmbeddingModel(),
    chunks: chunks.map((chunk, index) => ({
      id: randomUUID(),
      chunkIndex: chunk.index,
      content: chunk.content,
      tokenEstimate: null,
      embedding: embeddings[index] ?? [],
    })),
  });

  return {
    candidateId: candidate.id,
    resumeId: resume.id,
    identityHash: identity.identityHash,
    chunkCount: chunks.length,
    candidateContacted: candidate.contacted,
    candidateWasExisting: existingCandidate !== null,
    resumeWasExisting: false,
    existingCandidateId: existingCandidate?.id ?? null,
    existingCandidateName: existingCandidate?.displayName ?? null,
    existingResumeId: null,
  };
}
