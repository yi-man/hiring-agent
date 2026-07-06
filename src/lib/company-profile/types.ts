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

export type CompanyProfileDto = {
  id: string;
  userId: string;
  name: string;
  locations: CompanyWorkLocationDto[];
  createdAt: string;
  updatedAt: string;
};

export type UpsertCompanyProfileParams = {
  userId: string;
  name: string;
  locations: CompanyWorkLocationInput[];
};
