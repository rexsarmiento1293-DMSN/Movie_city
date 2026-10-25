# Security Specification — Movie City AI Drama Studio

## 1. Data Invariants

1. **Global Default Deny**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false`).
2. **Verified Identity Requirement**: All write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) validates document IDs via `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **PII Isolation (`UserProfile` at `/users/{userId}`)**:
   - No PII (`email`, `phone`, `address`) is permitted in `/users/{userId}`.
   - Document ID `userId` must equal `request.auth.uid` and `incoming().uid == userId`.
   - Only exact keys `['uid', 'displayName', 'studioRole', 'createdAt', 'updatedAt']` are allowed.
   - `get` is restricted to the profile owner (`request.auth.uid == userId`); `list` and `delete` are denied.
5. **Project Ownership & Relational Integrity (`StudioProject` at `/projects/{projectId}`)**:
   - A project can only be created if `incoming().ownerId == request.auth.uid` and the owner's `/users/$(request.auth.uid)` profile document exists (`exists(...)`).
   - Only exact keys `['ownerId', 'title', 'category', 'genre', 'prompt', 'scriptText', 'status', 'createdAt', 'updatedAt']` are permitted.
   - `createdAt` and `updatedAt` must equal `request.time` on creation; `createdAt` and `ownerId` are immutable on update, and `updatedAt` must equal `request.time`.
   - Terminal State Locking: Once `existing().status == 'archived'`, no further updates are allowed.
   - Secure List Queries: `allow list` enforces `isSignedIn() && resource.data.ownerId == request.auth.uid`.

## 2. The "Dirty Dozen" Payloads

1. **Shadow Field Injection on Create**: Creating `/projects/proj_1` with an extra field `isAdmin: true`.
2. **Owner Spoofing on Create**: Creating `/projects/proj_1` where `ownerId` is another user's UID.
3. **Unverified Email Write**: Creating `/users/user_1` when `request.auth.token.email_verified == false`.
4. **Orphaned Project Creation**: Creating `/projects/proj_1` when `/users/$(request.auth.uid)` does not exist.
5. **ID Poisoning Attack**: Creating a project with a 500-character or special-character document ID.
6. **Denial-of-Wallet Oversized Prompt**: Creating a project with a `prompt` string exceeding 2000 characters.
7. **Timestamp Forgery on Create**: Creating a project with a forged past/future `createdAt` instead of `request.time`.
8. **Immutable Field Mutation on Update**: Updating `ownerId` or `createdAt` on an existing project.
9. **Terminal State Bypass**: Updating `title` on a project whose `existing().status == 'archived'`.
10. **Value Poisoning on Update**: Updating `status` to an invalid enum value `"hacked"` via `affectedKeys()`.
11. **Unauthorized Profile Read**: Authenticated user `user_B` attempting `get` on `/users/user_A`.
12. **Unfiltered Collection Scraping**: Authenticated user running an unfiltered `list` query on `/projects` without `where('ownerId', '==', uid)`.
