import { prisma } from '@/lib/prisma';
import { normalizeCompanyWorkLocations } from './api';
import type { CompanyProfileDto, UpsertCompanyProfileParams } from './types';

type CompanyProfileRow = {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  locations: Array<{
    id: string;
    kind: string;
    label: string;
    city: string | null;
    address: string | null;
    sortOrder: number;
  }>;
};

const locationsOrderBy = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

function mapProfile(row: CompanyProfileRow | null): CompanyProfileDto | null {
  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    locations: row.locations.map((location) => ({
      id: location.id,
      kind: location.kind === 'remote' ? 'remote' : 'office',
      label: location.label,
      city: location.city,
      address: location.address,
      sortOrder: location.sortOrder,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getCompanyProfileForUser(userId: string): Promise<CompanyProfileDto | null> {
  const row = await prisma.companyProfile.findUnique({
    where: { userId },
    include: { locations: { orderBy: locationsOrderBy } },
  });

  return mapProfile(row as CompanyProfileRow | null);
}

export async function upsertCompanyProfileForUser(
  params: UpsertCompanyProfileParams,
): Promise<CompanyProfileDto> {
  const locations = normalizeCompanyWorkLocations(params.locations);
  const locationCreateData = locations.map((location) => ({
    kind: location.kind,
    label: location.label,
    city: location.city,
    address: location.address,
    sortOrder: location.sortOrder,
  }));

  const row = await prisma.companyProfile.upsert({
    where: { userId: params.userId },
    update: {
      name: params.name,
      locations: {
        deleteMany: {},
        create: locationCreateData,
      },
    },
    create: {
      userId: params.userId,
      name: params.name,
      locations: {
        create: locationCreateData,
      },
    },
    include: { locations: { orderBy: locationsOrderBy } },
  });

  return mapProfile(row as CompanyProfileRow) as CompanyProfileDto;
}
