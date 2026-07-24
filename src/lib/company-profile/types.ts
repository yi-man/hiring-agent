import type { InterviewProcess } from '@/lib/interviews/types';
import type { RecruitmentPlatform } from '@/lib/recruitment-platforms';

export type CompanyWorkLocationKind = 'office' | 'remote';

export type CompanyWorkLocationInput = {
  kind: CompanyWorkLocationKind;
  label: string;
  city: string | null;
  address: string | null;
};

export type NormalizedCompanyWorkLocationInput = CompanyWorkLocationInput & {
  sortOrder: number;
};

export type CompanyWorkLocationDto = NormalizedCompanyWorkLocationInput & {
  id: string;
};

export type CompanyRecruitmentPlatformInput = {
  platformId: RecruitmentPlatform;
  baseUrl: string;
  username: string;
  password?: string;
  clearPassword?: boolean;
  variables: Record<string, string>;
};

export type CompanyRecruitmentPlatformDto = {
  id: string;
  platformId: RecruitmentPlatform;
  baseUrl: string;
  username: string;
  hasPassword: boolean;
  variables: Record<string, string>;
};

export type CompanyProfileDto = {
  id: string;
  userId: string;
  name: string;
  supportedPlatforms: RecruitmentPlatform[];
  platformConfigs?: CompanyRecruitmentPlatformDto[];
  locations: CompanyWorkLocationDto[];
  interviewProcesses?: InterviewProcess[];
  createdAt: string;
  updatedAt: string;
};

export type UpsertCompanyProfileParams = {
  userId: string;
  name: string;
  supportedPlatforms: RecruitmentPlatform[];
  platformConfigs?: CompanyRecruitmentPlatformInput[];
  locations: CompanyWorkLocationInput[];
  interviewProcesses?: InterviewProcess[];
};

export type UpdateCompanyRecruitmentPlatformsParams = {
  userId: string;
  platformConfigs: CompanyRecruitmentPlatformInput[];
};
