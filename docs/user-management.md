# Manage Users

Admins have a Manage Users sidebar tab at /users. Regular users cannot see the tab, and direct navigation redirects to the dashboard. The backend independently requires a signed-in, active admin for every /api/users endpoint.

- Add user: name, unique email, password (12-128 characters), and account type Admin or User. New accounts start active. User maps to the existing employee database role.
- Edit user: update name, email, role or active status. Password hashes are never returned or editable here.
- Activate/deactivate: a confirmation explains the access change. Deactivation blocks sign-in and the next authenticated API call from an existing session. Requests, videos and account history are kept.
- Self protection: an admin may edit their own name/email but cannot deactivate themselves or remove their own admin role. After saving their profile, the sidebar profile refreshes.

Existing accounts are not migrated, recreated or assigned new roles. The three existing admin accounts stay admins unless an authorized admin deliberately edits another account later. Existing request ownership rules remain unchanged: admins see all data; users see their own requests/responses.

The page lists accounts with pagination. All responses use private, no-store caching. The API whitelists input fields, validates roles and status, normalizes email, enforces unique emails, and uses the existing Argon2id hashing service for new passwords. There is no account deletion or password-reset action in this feature. The CLI npm run create-admin remains available.

## API

- GET /api/users?page=1&limit=10: safe user profiles and pagination.
- POST /api/users: {name, email, password, role}; role is admin or employee.
- PATCH /api/users/:id: any of {name, email, role, isActive}.

State-changing calls retain the application's trusted-origin protection. No password or passwordHash is included in response profiles.

## Verification

Backend integration: node scripts/testIntegrationLocal.js tests/integration/manageUsers.test.js tests/integration/roles.test.js tests/integration/requestsAccess.test.js (run in backend).

Browser checks: node scripts/checkManageUsers.mjs (run in frontend; uses simulated API data and its own Vite server on port 5190). It checks creation, edits, role/status controls, duplicate email errors, self protection, admin-only navigation and mobile layout. Tests use isolated fixtures and do not edit real accounts.
