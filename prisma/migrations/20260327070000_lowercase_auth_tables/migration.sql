-- Rename Auth.js tables to lowercase naming convention.
RENAME TABLE
  `User` TO `users`,
  `Account` TO `accounts`,
  `Session` TO `sessions`,
  `VerificationToken` TO `verification_tokens`;
