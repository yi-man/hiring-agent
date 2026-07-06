# Company Profile JD Publishing Design

## Goal

Use the logged-in user's company profile as the source of truth for JD publishing defaults, and let recruiters choose salary and work location before publishing a JD.

## Approved Approach

Implement one company profile per user. The profile stores a company name and ordered work locations. A location can be an office location or remote work. The JD publishing panel reads the current user's profile and pre-fills the company name, offers the profile locations as selectable options, and requires a salary range before publishing.

This keeps the feature scoped to the current local-account model. It does not introduce shared organizations, roles, invitations, or multi-tenant membership.

## Alternatives Considered

1. Per-user company profile, recommended and approved.
   This solves the immediate product gap with the smallest data-model change.

2. Shared organization model with user memberships.
   This is better for teams but needs roles, ownership, invitations, and migration decisions that are larger than the current request.

3. Store company defaults only in JD publishing settings.
   This is fastest, but it leaves user/company information missing and makes locations hard to reuse.

## Data Model

Add a `CompanyProfile` model owned by `User`.

Fields:

- `id`
- `userId`
- `name`
- `createdAt`
- `updatedAt`

Constraints:

- One profile per user with a unique `userId`.
- Deleting the user deletes the profile.

Add a `CompanyWorkLocation` model owned by `CompanyProfile`.

Fields:

- `id`
- `companyProfileId`
- `label`
- `kind`, either `office` or `remote`
- `city`
- `address`
- `sortOrder`
- `createdAt`
- `updatedAt`

Constraints:

- Deleting the company profile deletes its locations.
- Remote is represented as a normal location option with `kind = "remote"` and label `远程`.
- Locations are returned in `sortOrder`, then creation order.

## API

Add `/api/company-profile`.

`GET` returns the current user's profile:

```json
{
  "profile": {
    "id": "profile_1",
    "userId": "user_1",
    "name": "星河智能",
    "locations": [
      { "id": "loc_1", "label": "上海", "kind": "office", "city": "上海", "address": null },
      { "id": "loc_2", "label": "远程", "kind": "remote", "city": null, "address": null }
    ]
  }
}
```

`PUT` upserts the current user's profile. It accepts `name` and `locations`. Empty names or an empty location list are rejected. Location labels are trimmed, duplicate labels are collapsed, and remote locations are normalized to label `远程`.

The auth boundary follows existing route patterns: every request uses `requireAuth()`, and user ownership is enforced in repository functions.

## UI

Add a company settings page at `/settings/company` and link it from the sidebar as `公司设置`.

The page lets the recruiter edit:

- Company name.
- Work locations as rows.
- Location type, office or remote.
- Optional city and address for office locations.

The JD detail publishing panel changes from hard-coded defaults to profile-backed defaults:

- Company name is read from the profile and shown as the publish company field.
- Work location is a select populated from profile locations.
- Salary range becomes explicit publish input. It can remain a text field in this iteration because the downstream publishing target currently expects a string.
- The publish button is disabled until company, salary, and location are present.
- If the profile is missing, the panel shows a short action to set company information before publishing.

## Data Flow

1. User opens JD detail.
2. Client fetches the JD, publish tasks, and company profile in parallel.
3. Company profile defaults initialize the publish company and first available location.
4. User selects salary and location.
5. Publish request posts `company`, `salary`, and selected location label to the existing boss-like publishing API.
6. Publishing continues through the existing browser publishing service.

## Error Handling

Missing profile:

- The JD page keeps the content editor usable.
- Publishing is blocked with a link to `/settings/company`.

Invalid profile save:

- API returns `400` with a specific validation message.

Publishing with invalid company, salary, or location:

- Existing publish payload validation still rejects missing fields.

## Testing

Add tests before implementation:

- Repository tests for profile upsert, lookup, deduplication, remote normalization, and user ownership.
- API route tests for authenticated GET/PUT and validation failures.
- Client helper tests for fetch/save profile behavior if a helper is added.
- JD page component test that verifies profile defaults replace hard-coded `星河智能` and location selection is used in publish payload.
- Company settings page component test for editing and saving profile rows.

Run focused Jest suites first, then type-check.
