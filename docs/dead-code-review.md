# Dead code review

> **Update (2026-09-30):** everything listed here was deleted in three commits:
> the dead API routes (0c21ccf), the dead source files and the tests/scripts that
> imported them (3e5bbf9), and the repo-root clutter (the commit that added this
> note). To bring anything back: `git show 0c21ccf^:<path>` or
> `git checkout 0c21ccf^ -- <path>`. The rest of this document is the review as
> it was before deletion.

Generated 2026-09-30 by tracing imports from every page, layout,
middleware and route handler, plus every `/api/...` URL mentioned in live code
(template variables treated as wildcards). **Nothing has been deleted yet.**

|                                               | Total | Live |    Dead |
| --------------------------------------------- | ----: | ---: | ------: |
| Source files (app, components, lib, contexts) |   506 |  204 | **302** |
| API routes                                    |   134 |   32 | **102** |

Of the 102 dead API routes, **12 have no auth check of their own**
(signed-in users can still call them; the middleware only blocks signed-out calls), and
**58 depend on tables that don't exist** in the database, so they fail anyway.

## How to read this

- **Dead** = no page, layout, middleware or live API route reaches it. Deleting it
  can't change what users see.
- Things the trace can't see: URLs built entirely at runtime, and callers outside
  this repo (webhooks, cron jobs, mobile apps). If anything outside this app calls
  these API routes, say so before deleting.
- Worth keeping as reference instead of deleting: nothing here is wired up, but some
  services (e.g. enrollment waitlists, role requests, integrations) may be features you still want.
  Git history keeps everything either way.

## Things that also reference dead code

- `npm run dev:realtime` runs `lib/server/realtime-server.ts` (dead in the app; a
  socket.io server can't run on Vercel anyway).
- `scripts/database-stress-test.js` and `scripts/test-data-migration.js` import app code.
- **121 of 203 test files** import dead code; they'd be deleted or rewritten along with it.
  (180 of 199 test suites already fail today.)

## Dead API routes (102)

Auth: whether the route checks the signed-in user itself.
Missing tables: tables the route (and the lib code it imports) queries that don't exist.

| Route                                                 | Methods        |  Auth  | Stub/placeholder | Missing tables                                                                                             |
| ----------------------------------------------------- | -------------- | :----: | :--------------: | ---------------------------------------------------------------------------------------------------------- |
| `/api/classes/[id]/details`                           | GET            |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/enrollment-config`                 | GET PUT        |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/enrollment-requests/batch-approve` | POST           |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/enrollment-stats`                  | GET            |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/invitations`                       | GET POST       |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/prerequisites`                     | GET POST       |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/prerequisites/[prerequisiteId]`    | PUT DELETE     |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/restrictions`                      | GET POST       |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/restrictions/[restrictionId]`      | PUT DELETE     |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/roster`                            | GET            |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/roster/export`                     | GET            |  yes   |                  |                                                                                                            |
| `/api/classes/[id]/students/[studentId]/remove`       | POST           |  yes   |                  |                                                                                                            |
| `/api/classes/available`                              | GET            |  yes   |                  |                                                                                                            |
| `/api/classes/search`                                 | GET            |  yes   |                  |                                                                                                            |
| `/api/collaboration-settings`                         | GET POST       |  yes   |                  | user_institutions, content_sharing_policies, collaboration_settings, content_attributions +1               |
| `/api/collaboration-settings/[id]`                    | PUT DELETE     |  yes   |                  | user_institutions, collaboration_settings, content_sharing_policies, content_attributions +1               |
| `/api/content-policies`                               | GET POST       |  yes   |                  | user_institutions, content_sharing_policies, collaboration_settings, content_attributions +1               |
| `/api/content-policies/[id]`                          | GET PUT DELETE |  yes   |                  | user_institutions, content_sharing_policies, collaboration_settings, content_attributions +1               |
| `/api/content-sharing-requests`                       | GET POST       |  yes   |                  | content_sharing_requests, user_institutions, content_sharing_permissions, content_sharing_policies +3      |
| `/api/content-sharing-requests/[id]`                  | GET PUT        |  yes   |                  | content_sharing_requests, user_institutions, content_sharing_permissions, content_sharing_policies +3      |
| `/api/departments/[id]`                               | GET PUT DELETE |  yes   |                  | user_departments, department_analytics, department_analytics_archive                                       |
| `/api/departments/[id]/analytics`                     | GET POST       |  yes   |                  | user_departments, department_analytics                                                                     |
| `/api/departments/[id]/collaboration-settings`        | GET POST       |  yes   |                  | user_institutions, content_sharing_policies, collaboration_settings, content_attributions +1               |
| `/api/departments/[id]/coordination`                  | GET POST       | **no** |                  | enrollment_balancing_operations                                                                            |
| `/api/departments/[id]/preferences`                   | GET PUT POST   |  yes   |                  | user_institutions, department_config_audit                                                                 |
| `/api/departments/[id]/preferences/reset`             | POST           |  yes   |                  | user_institutions, department_config_audit                                                                 |
| `/api/departments/[id]/preferences/resolve-conflicts` | POST           |  yes   |                  | user_institutions, department_config_audit                                                                 |
| `/api/departments/[id]/reports`                       | GET POST       |  yes   |                  | department_analytics                                                                                       |
| `/api/departments/[id]/users/transfer`                | POST           |  yes   |                  | user_departments, department_analytics, department_analytics_archive                                       |
| `/api/enrollment-requests`                            | GET            |  yes   |                  |                                                                                                            |
| `/api/enrollment-requests/[id]/approve`               | PUT            |  yes   |                  |                                                                                                            |
| `/api/enrollment-requests/[id]/deny`                  | PUT            |  yes   |                  |                                                                                                            |
| `/api/enrollment/analytics`                           | GET            |  yes   |                  |                                                                                                            |
| `/api/enrollment/conflicts`                           | GET POST       | **no** |                  | conflict_resolutions, enrollment_overrides, institution_policies                                           |
| `/api/enrollments`                                    | POST GET       |  yes   |                  |                                                                                                            |
| `/api/enrollments/[id]`                               | GET DELETE     |  yes   |                  |                                                                                                            |
| `/api/enrollments/bulk`                               | POST           |  yes   |                  |                                                                                                            |
| `/api/institutions`                                   | GET POST       |  yes   |                  | institution_audit_log                                                                                      |
| `/api/institutions/[id]/analytics`                    | GET POST       |  yes   |                  | institution_analytics, department_analytics                                                                |
| `/api/institutions/[id]/billing-alerts`               | GET POST       |  yes   |                  | user_institutions, subscription_plans, subscriptions, usage_metrics +3                                     |
| `/api/institutions/[id]/collaboration-settings`       | GET POST       |  yes   |                  | user_institutions, content_sharing_policies, collaboration_settings, content_attributions +1               |
| `/api/institutions/[id]/config`                       | GET PUT POST   |  yes   |                  | institution_audit_log                                                                                      |
| `/api/institutions/[id]/content-policies`             | GET POST       |  yes   |                  | user_institutions, content_sharing_policies, collaboration_settings, content_attributions +1               |
| `/api/institutions/[id]/departments/hierarchy`        | GET            |  yes   |                  | user_departments, department_analytics, department_analytics_archive                                       |
| `/api/institutions/[id]/integrations/health`          | GET            | **no** |                  | integration_health, integration_alert_rules, institution_integrations, integration_health_checks +1        |
| `/api/institutions/[id]/invitations`                  | GET POST       |  yes   |                  | user_institutions, institution_invitations                                                                 |
| `/api/institutions/[id]/invoices`                     | GET POST       |  yes   |                  | user_institutions, subscription_plans, subscriptions, usage_metrics +3                                     |
| `/api/institutions/[id]/join-requests`                | GET POST       |  yes   |                  | user_institutions, institution_join_requests, join_request_audit_log                                       |
| `/api/institutions/[id]/reports`                      | GET POST       |  yes   |                  | institution_analytics, profiles                                                                            |
| `/api/institutions/[id]/subscription`                 | GET POST PUT   |  yes   |                  | user_institutions, subscription_plans, subscriptions, usage_metrics +3                                     |
| `/api/institutions/[id]/sync-jobs`                    | GET            | **no** |                  | sync_jobs                                                                                                  |
| `/api/institutions/[id]/sync-schedules`               | GET POST       | **no** |                  | sync_schedules                                                                                             |
| `/api/institutions/[id]/usage`                        | GET POST       |  yes   |                  | user_institutions, subscription_plans, subscriptions, usage_metrics +3                                     |
| `/api/institutions/[id]/users`                        | GET POST       |  yes   |                  | user_institutions, user_audit_log, user_session_invalidations, user_permission_cache +2                    |
| `/api/institutions/create`                            | POST           |  yes   |                  |                                                                                                            |
| `/api/integrations/[id]/diagnostics`                  | POST           | **no** |       yes        | institution_integrations                                                                                   |
| `/api/integrations/[id]/health-check`                 | POST           | **no** |                  | integration_health, integration_alert_rules, institution_integrations, integration_health_checks +1        |
| `/api/integrations/[id]/sync`                         | POST           | **no** |                  | institution_integrations, sync_jobs, profiles, import_logs                                                 |
| `/api/integrations/test`                              | POST           | **no** |                  | institution_integrations                                                                                   |
| `/api/notifications/delivery-preferences`             | GET PUT        |  yes   |                  | notification_templates, institution_branding, notification_delivery_preferences, notification_campaigns +2 |
| `/api/notifications/engagement`                       | POST GET       |  yes   |                  | notification_templates, institution_branding, notification_delivery_preferences, notification_campaigns +2 |
| `/api/notifications/preferences`                      | GET PUT        |  yes   |                  |                                                                                                            |
| `/api/onboarding/analytics/metrics`                   | POST           |  yes   |                  | onboarding_step_events, onboarding_analytics                                                               |
| `/api/onboarding/analytics/steps`                     | POST           |  yes   |                  | onboarding_step_events, onboarding_analytics                                                               |
| `/api/onboarding/start`                               | POST           |  yes   |                  |                                                                                                            |
| `/api/onboarding/status`                              | GET            |  yes   |                  |                                                                                                            |
| `/api/onboarding/update`                              | PUT            |  yes   |                  |                                                                                                            |
| `/api/permissions`                                    | GET            |  yes   |                  |                                                                                                            |
| `/api/permissions/check`                              | POST GET       |  yes   |                  |                                                                                                            |
| `/api/permissions/user/[userId]`                      | GET            |  yes   |                  |                                                                                                            |
| `/api/realtime`                                       | GET POST       | **no** |                  |                                                                                                            |
| `/api/roles/assign-temporary`                         | POST           | **no** |                  | user_role_notification_preferences                                                                         |
| `/api/roles/audit`                                    | GET POST       |  yes   |                  | role_suspicious_activities, role_audit_reports, audit_logs                                                 |
| `/api/roles/audit/export`                             | GET            |  yes   |                  | role_suspicious_activities, role_audit_reports, audit_logs                                                 |
| `/api/roles/audit/suspicious`                         | GET            |  yes   |                  | role_suspicious_activities, role_audit_reports, audit_logs                                                 |
| `/api/roles/audit/suspicious/[activityId]/flag`       | POST           |  yes   |                  | role_suspicious_activities, role_audit_reports, audit_logs                                                 |
| `/api/roles/bulk-assign`                              | POST PUT       |  yes   |                  | security_events, security_alerts, security_alert_events, role_error_log +9                                 |
| `/api/roles/change`                                   | POST           |  yes   |                  | user_role_notification_preferences, security_events, security_alerts, security_alert_events +8             |
| `/api/roles/change-preview`                           | POST           |  yes   |                  |                                                                                                            |
| `/api/roles/notifications/preferences`                | GET PUT        |  yes   |                  | user_role_notification_preferences                                                                         |
| `/api/roles/notifications/process`                    | POST           |  yes   |                  | user_role_notification_preferences                                                                         |
| `/api/roles/request`                                  | POST GET       |  yes   |                  | security_events, security_alerts, security_alert_events, role_error_log +8                                 |
| `/api/roles/request-extension`                        | POST           | **no** |       yes        | user_role_notification_preferences                                                                         |
| `/api/roles/requests/[id]/approve`                    | PUT            |  yes   |                  | security_events, security_alerts, security_alert_events, role_error_log +8                                 |
| `/api/roles/requests/[id]/deny`                       | PUT            |  yes   |                  |                                                                                                            |
| `/api/roles/requests/pending`                         | GET            |  yes   |                  |                                                                                                            |
| `/api/roles/statistics`                               | GET            |  yes   |                  |                                                                                                            |
| `/api/roles/users/[id]/status`                        | PUT            |  yes   |                  |                                                                                                            |
| `/api/roles/users/search`                             | GET            |  yes   |                  |                                                                                                            |
| `/api/roles/verification/domain`                      | GET POST PUT   |  yes   |                  | verification_requests, verification_evidence, verification_reviewers, verification_status_log              |
| `/api/roles/verification/request`                     | POST GET       |  yes   |                  | verification_requests, verification_evidence, verification_reviewers, verification_status_log              |
| `/api/roles/verification/review`                      | GET POST       |  yes   |                  | verification_requests, verification_evidence, verification_reviewers, verification_status_log              |
| `/api/roles/verification/status`                      | GET DELETE     |  yes   |                  | verification_requests, verification_status_log, verification_evidence, verification_reviewers              |
| `/api/students/[id]/enrollment-dashboard`             | GET            |  yes   |                  |                                                                                                            |
| `/api/students/[id]/enrollments/[classId]/drop`       | POST           |  yes   |                  |                                                                                                            |
| `/api/students/[id]/enrollments/[classId]/withdraw`   | POST           |  yes   |                  |                                                                                                            |
| `/api/subscription-plans`                             | GET POST       |  yes   |                  | subscription_plans, subscriptions, usage_metrics, billing_alerts +2                                        |
| `/api/waitlist/[id]/promote`                          | POST           |  yes   |                  |                                                                                                            |
| `/api/waitlists`                                      | POST GET       |  yes   |                  |                                                                                                            |
| `/api/waitlists/[classId]/join`                       | POST           |  yes   |                  |                                                                                                            |
| `/api/waitlists/[classId]/position`                   | GET            |  yes   |                  |                                                                                                            |
| `/api/waitlists/[classId]/process`                    | POST           |  yes   |                  |                                                                                                            |

## Other dead files (200)

<details><summary><code>lib/services/</code> — 81 files</summary>

- `lib/services/academic-calendar-integration.ts`
- `lib/services/accommodation-service.ts`
- `lib/services/background-job-processor.ts`
- `lib/services/bulk-permission-service.ts`
- `lib/services/bulk-user-import.ts`
- `lib/services/cache-manager.ts`
- `lib/services/cache-strategy-service.ts`
- `lib/services/class-discovery.ts`
- `lib/services/communication-platform-integration.ts`
- `lib/services/compliance-manager.ts`
- `lib/services/compliance-reporting.ts`
- `lib/services/content-sharing-enforcement.ts`
- `lib/services/content-sharing-policy-manager.ts`
- `lib/services/cross-tenant-monitor.ts`
- `lib/services/data-import-export.ts`
- `lib/services/data-retention.ts`
- `lib/services/database-connection-pool.ts`
- `lib/services/database-monitoring-service.ts`
- `lib/services/database-optimizer.ts`
- `lib/services/department-analytics.ts`
- `lib/services/department-config-manager.ts`
- `lib/services/department-enrollment-coordinator.ts`
- `lib/services/department-role-manager.ts`
- `lib/services/domain-conflict-resolver.ts`
- `lib/services/domain-verification-service.ts`
- `lib/services/email-template-service.ts`
- `lib/services/enrollment-analytics.ts`
- `lib/services/enrollment-audit.ts`
- `lib/services/enrollment-balancing.ts`
- `lib/services/enrollment-config.ts`
- `lib/services/enrollment-conflict-resolver.ts`
- `lib/services/enrollment-fraud-prevention.ts`
- `lib/services/enrollment-history.ts`
- `lib/services/enrollment-identity-verification.ts`
- `lib/services/enrollment-pattern-analysis.ts`
- `lib/services/enrollment-rate-limiter.ts`
- `lib/services/enrollment-reporting.ts`
- `lib/services/feature-flag-manager.ts`
- `lib/services/ferpa-compliance.ts`
- `lib/services/gdpr-compliance.ts`
- `lib/services/gradebook-integration.ts`
- `lib/services/institution-analytics.ts`
- `lib/services/institution-approval-workflow.ts`
- `lib/services/institution-config-manager.ts`
- `lib/services/institution-health-monitor.ts`
- `lib/services/institution-invitation-manager.ts`
- `lib/services/institution-join-request-manager.ts`
- `lib/services/institution-setup-workflow.ts`
- `lib/services/institution-user-manager.ts`
- `lib/services/integration-config-manager.ts`
- `lib/services/integration-failure-detector.ts`
- `lib/services/integration-health-monitor.ts`
- `lib/services/invitation-manager.ts`
- `lib/services/onboarding-analytics.ts`
- `lib/services/performance-monitor.ts`
- `lib/services/push-notification-service.ts`
- `lib/services/realtime-enrollment.ts`
- `lib/services/redis-cache-service.ts`
- `lib/services/role-audit-service.ts`
- `lib/services/role-change-processor.ts`
- `lib/services/role-compatibility-service.ts`
- `lib/services/role-escalation-prevention.ts`
- `lib/services/role-manager.ts`
- `lib/services/role-migration-service.ts`
- `lib/services/role-notification-service.ts`
- `lib/services/role-request-rate-limiter.ts`
- `lib/services/role-rollback-service.ts`
- `lib/services/role-security-logger.ts`
- `lib/services/role-validation-service.ts`
- `lib/services/role-verification-service.ts`
- `lib/services/section-planning.ts`
- `lib/services/sso-provider.ts`
- `lib/services/student-enrollment.ts`
- `lib/services/student-information-system.ts`
- `lib/services/subscription-manager.ts`
- `lib/services/teacher-roster.ts`
- `lib/services/temporary-role-processor.ts`
- `lib/services/tenant-security.ts`
- `lib/services/usage-monitor.ts`
- `lib/services/usage-quota-monitor.ts`
- `lib/services/waitlist-manager.ts`

</details>
<details><summary><code>components/institution/</code> — 19 files</summary>

- `components/institution/admin-onboarding-flow.tsx`
- `components/institution/billing-dashboard.tsx`
- `components/institution/branding-config-interface.tsx`
- `components/institution/content-sharing-policy-manager.tsx`
- `components/institution/custom-domain-setup.tsx`
- `components/institution/department-admin-dashboard.tsx`
- `components/institution/department-preference-manager.tsx`
- `components/institution/email-template-customization.tsx`
- `components/institution/feature-flag-manager.tsx`
- `components/institution/institution-admin-interface.tsx`
- `components/institution/institution-analytics-dashboard.tsx`
- `components/institution/institution-policy-config.tsx`
- `components/institution/institution-setup-wizard.tsx`
- `components/institution/institution-user-manager.tsx`
- `components/institution/integration-health-dashboard.tsx`
- `components/institution/integration-setup-wizard.tsx`
- `components/institution/integration-sync-manager.tsx`
- `components/institution/integration-troubleshooting.tsx`
- `components/institution/mobile-app-branding.tsx`

</details>
<details><summary><code>components/role-management/</code> — 19 files</summary>

- `components/role-management/admin-approval-interface.tsx`
- `components/role-management/admin-role-dashboard.tsx`
- `components/role-management/bulk-assignment-results.tsx`
- `components/role-management/bulk-role-assignment-interface.tsx`
- `components/role-management/department-role-management-interface.tsx`
- `components/role-management/domain-management-interface.tsx`
- `components/role-management/manual-verification-form.tsx`
- `components/role-management/permission-tooltip.tsx`
- `components/role-management/role-audit-log-viewer.tsx`
- `components/role-management/role-change-request-form.tsx`
- `components/role-management/role-extension-request-form.tsx`
- `components/role-management/role-notification-preferences.tsx`
- `components/role-management/role-statistics-dashboard.tsx`
- `components/role-management/security-monitoring-dashboard.tsx`
- `components/role-management/temporary-role-assignment-interface.tsx`
- `components/role-management/user-search-management.tsx`
- `components/role-management/verification-dashboard.tsx`
- `components/role-management/verification-review-interface.tsx`
- `components/role-management/verification-status-tracker.tsx`

</details>
<details><summary><code>components/enrollment/</code> — 18 files</summary>

- `components/enrollment/accessibility-indicators.tsx`
- `components/enrollment/accommodation-communication.tsx`
- `components/enrollment/class-browser.tsx`
- `components/enrollment/class-invitation-manager.tsx`
- `components/enrollment/department-admin-interface.tsx`
- `components/enrollment/enrollment-config-interface.tsx`
- `components/enrollment/enrollment-request-form.tsx`
- `components/enrollment/institution-admin-dashboard.tsx`
- `components/enrollment/mobile-class-browser.tsx`
- `components/enrollment/mobile-enrollment-dashboard.tsx`
- `components/enrollment/notification-preferences.tsx`
- `components/enrollment/priority-enrollment-form.tsx`
- `components/enrollment/push-notification-setup.tsx`
- `components/enrollment/realtime-enrollment-display.tsx`
- `components/enrollment/realtime-enrollment-example.tsx`
- `components/enrollment/student-enrollment-dashboard.tsx`
- `components/enrollment/teacher-approval-interface.tsx`
- `components/enrollment/waitlist-interface.tsx`

</details>
<details><summary><code>components/onboarding/</code> — 12 files</summary>

- `components/onboarding/admin-institution-setup-step.tsx`
- `components/onboarding/department-selection-step.tsx`
- `components/onboarding/error-message.tsx`
- `components/onboarding/institution-selection-step.tsx`
- `components/onboarding/onboarding-analytics-dashboard.tsx`
- `components/onboarding/onboarding-error-boundary.tsx`
- `components/onboarding/onboarding-layout.tsx`
- `components/onboarding/profile-setup-step.tsx`
- `components/onboarding/role-selection-step.tsx`
- `components/onboarding/student-class-join-step.tsx`
- `components/onboarding/teacher-class-guide-step.tsx`
- `components/onboarding/welcome-step.tsx`

</details>
<details><summary><code>lib/utils/</code> — 9 files</summary>

- `lib/utils/content-sharing-middleware.ts`
- `lib/utils/error-handling.ts`
- `lib/utils/export.ts`
- `lib/utils/manual-joins.ts`
- `lib/utils/onboarding-status.ts`
- `lib/utils/retry-query.ts`
- `lib/utils/role-error-handling.ts`
- `lib/utils/safe-query.ts`
- `lib/utils/tenant-context.ts`

</details>
<details><summary><code>components/analytics/</code> — 5 files</summary>

- `components/analytics/chart-container.tsx`
- `components/analytics/empty-state.tsx`
- `components/analytics/error-state.tsx`
- `components/analytics/loading-state.tsx`
- `components/analytics/metric-card.tsx`

</details>
<details><summary><code>components/tutorial/</code> — 5 files</summary>

- `components/tutorial/code-block.tsx`
- `components/tutorial/connect-supabase-steps.tsx`
- `components/tutorial/fetch-data-steps.tsx`
- `components/tutorial/sign-up-user-steps.tsx`
- `components/tutorial/tutorial-step.tsx`

</details>
<details><summary><code>lib/hooks/</code> — 5 files</summary>

- `lib/hooks/useDebounce.ts`
- `lib/hooks/useMobileDetection.ts`
- `lib/hooks/useOfflineStorage.ts`
- `lib/hooks/useOnboarding.ts`
- `lib/hooks/useRealtimeEnrollment.ts`

</details>
<details><summary><code>lib/middleware/</code> — 5 files</summary>

- `lib/middleware/api-permission-middleware.ts`
- `lib/middleware/auth-security.ts`
- `lib/middleware/permission-middleware.ts`
- `lib/middleware/role-security-middleware.ts`
- `lib/middleware/tenant-middleware.ts`

</details>
<details><summary><code>lib/types/</code> — 5 files</summary>

- `lib/types/accommodation.ts`
- `lib/types/billing.ts`
- `lib/types/content-sharing.ts`
- `lib/types/integration.ts`
- `lib/types/onboarding-analytics.ts`

</details>
<details><summary><code>components/ui/</code> — 3 files</summary>

- `components/ui/NavLink.tsx`
- `components/ui/role-visibility.tsx`
- `components/ui/tooltip.tsx`

</details>
<details><summary><code>app/dashboard/</code> — 2 files</summary>

- `app/dashboard/student/assignments/[id]/submit/page-new.tsx`
- `app/dashboard/teacher/analytics/page-simple.tsx`

</details>
<details><summary><code>components/admin/</code> — 1 file</summary>

- `components/admin/system-admin-dashboard.tsx`

</details>
<details><summary><code>components/hero.tsx/</code> — 1 file</summary>

- `components/hero.tsx`

</details>
<details><summary><code>components/navigation/</code> — 1 file</summary>

- `components/navigation/permission-aware-nav.tsx`

</details>
<details><summary><code>components/next-logo.tsx/</code> — 1 file</summary>

- `components/next-logo.tsx`

</details>
<details><summary><code>components/no-ssr.tsx/</code> — 1 file</summary>

- `components/no-ssr.tsx`

</details>
<details><summary><code>components/notifications/</code> — 1 file</summary>

- `components/notifications/delivery-preferences.tsx`

</details>
<details><summary><code>components/role-assignment-tool.tsx/</code> — 1 file</summary>

- `components/role-assignment-tool.tsx`

</details>
<details><summary><code>components/role-switcher.tsx/</code> — 1 file</summary>

- `components/role-switcher.tsx`

</details>
<details><summary><code>components/supabase-logo.tsx/</code> — 1 file</summary>

- `components/supabase-logo.tsx`

</details>
<details><summary><code>components/theme-provider.tsx/</code> — 1 file</summary>

- `components/theme-provider.tsx`

</details>
<details><summary><code>contexts/onboarding-context.tsx/</code> — 1 file</summary>

- `contexts/onboarding-context.tsx`

</details>
<details><summary><code>lib/server/</code> — 1 file</summary>

- `lib/server/realtime-server.ts`

</details>

## Repo-root clutter (210 files)

One-off fix scripts, SQL patches run by hand, and "FIXED" notes. None are imported by
the app. The SQL files conflict with each other and with the live database; the
migrations in `supabase/migrations/` are now the source of truth for policies.

- 81 Markdown notes (`*_FIXED.md`, `*_IMPLEMENTED.md`, …)
- 56 SQL scripts (`fix-*.sql`, `create-*.sql`, …)
- 72 JS/TS/PowerShell/batch scripts (`fix-*.js`, `test-*.js`, `restart-dev.*`)
- 1 other

<details><summary>Full list</summary>

- `ACCESS_DENIED_ISSUE_FIXED.md`
- `ALL_CONSOLE_ERRORS_FIXED.md`
- `ANALYTICS_AND_REPORTS_IMPLEMENTED.md`
- `ANALYTICS_DATABASE_ERRORS_FIXED.md`
- `ANALYTICS_FEATURES_REMOVED.md`
- `ANALYTICS_JSON_ERROR_FIXED.md`
- `ANALYTICS_REAL_DATA_IMPLEMENTATION.md`
- `ANALYTICS_SYSTEM_FIXED.md`
- `ASSIGNMENTS_COLUMN_FIX.md`
- `ASSIGNMENT_404_ROUTING_FIXED.md`
- `ASSIGNMENT_ROUTING_404_FIX.md`
- `AUTH_SESSION_ERRORS_FIXED.md`
- `BULK_IMPORT_IMPLEMENTATION_COMPLETE.md`
- `BULK_ROLE_ASSIGNMENT_ACCESS_RESTRICTION.md`
- `BULK_ROLE_ASSIGNMENT_IMPLEMENTATION_COMPLETE.md`
- `CLASS_CODE_GENERATION_FIX.md`
- `CLASS_CODE_VISIBILITY_FIX.md`
- `COMPLETE_DUAL_GRADING_WITH_RUBRIC_MANAGEMENT.md`
- `COMPLETE_TEACHER_DASHBOARD_FIX_SUMMARY.md`
- `COMPLETE_TEACHER_STUDENT_WORKFLOW_FIXED.md`
- `COMPREHENSIVE_ANALYTICS_IMPLEMENTED.md`
- `COMPREHENSIVE_GRADING_SYSTEM_FIX.md`
- `CONSOLE_ERRORS_AND_NOTIFICATIONS_FIXED.md`
- `CONSOLE_ERRORS_COMPLETELY_FIXED.md`
- `CONSOLE_ERRORS_FIXED.md`
- `CONSOLE_ERROR_ASSIGNMENT_QUERY_FIXED.md`
- `CREATE_ASSIGNMENT_ERROR_FIXED.md`
- `CREATE_CLASS_ACCESS_FIXED.md`
- `CREATE_CLASS_ERROR_FIXED.md`
- `DATABASE_ERRORS_FIXED.md`
- `DATABASE_PERFORMANCE_OPTIMIZATION.md`
- `DATABASE_SETUP_COMPLETE.md`
- `DEMO_DATA_REMOVAL_COMPLETE.md`
- `DUAL_GRADING_SYSTEM_IMPLEMENTED.md`
- `ENROLLMENT_CONSTRAINT_FIX.md`
- `ENROLLMENT_DEBUGGING_STEPS.md`
- `ENROLLMENT_ERROR_FIX.md`
- `ENROLLMENT_TABLE_ISSUE_FIXED.md`
- `FINAL_CONSOLE_ERRORS_COMPLETELY_FIXED.md`
- `FINAL_ENROLLMENT_FIX.md`
- `GRADING_SYSTEM_EXPLANATION.md`
- `HOOK_FIXES_COMPLETED.md`
- `HOOK_ISSUES_FIXED.md`
- `IMPORT_ERRORS_FIXED.md`
- `INSTITUTION_ACCESS_FIXED.md`
- `INSTITUTION_DATABASE_ERRORS_FIXED.md`
- `INSTITUTION_NAVIGATION_FIXED.md`
- `ONBOARDING_AND_USER_ADDRESSING_FIXES.md`
- `PEER_REVIEW_ERRORS_FIXED.md`
- `PEER_REVIEW_MOCK_DATA_REMOVED.md`
- `PEER_REVIEW_SYSTEM_IMPLEMENTED.md`
- `QUICK_TEST.md`
- `REPORTS_BLANK_PAGE_FIXED.md`
- `REPORTS_CLEAN_REWRITE_COMPLETE.md`
- `REPORTS_DEBUGGING_APPROACH.md`
- `REPORTS_DEBUG_CLEANUP_COMPLETE.md`
- `REPORTS_SYNTAX_ERROR_FIXED.md`
- `ROLE_ACCESS_DEBUG_TOOLS.md`
- `ROLE_SPECIFIC_ONBOARDING_IMPLEMENTED.md`
- `ROLE_SWITCHING_FIXED.md`
- `ROUTING_CONFLICT_FIXED.md`
- `RUBRIC_SYSTEM_REVAMPED.md`
- `RUBRIC_SYSTEM_SELECT_FIX.md`
- `RUBRIC_SYSTEM_STATUS.md`
- `SEAMLESS_GRADING_SYSTEM_COMPLETE.md`
- `SIMPLE_CONSOLE_ERROR_FIXES.md`
- `SINGLE_ROLE_SYSTEM_IMPLEMENTED.md`
- `SINGLE_ROLE_SYSTEM_REQUIREMENTS.md`
- `STUDENT_ASSIGNMENTS_FIX.md`
- `STUDENT_CLASSES_FIX.md`
- `STUDENT_DASHBOARD_FIXES.md`
- `STUDENT_GRADES_FIX.md`
- `STUDENT_PERFORMANCE_ANALYTICS_ENHANCED.md`
- `SUBMISSIONS_SYSTEM_FIX.md`
- `TEACHER_ANALYTICS_ERRORS_FIXED.md`
- `TEACHER_ANALYTICS_REAL_DATA_FIX.md`
- `TEACHER_DASHBOARD_FIXED.md`
- `TEACHER_DASHBOARD_ISSUES_FIXED.md`
- `TEACHER_GRADING_ACCESS_FIXED.md`
- `TEACHER_GRADING_REAL_DATA_FIX.md`
- `add-indexes-triggers.sql`
- `add-missing-user.sql`
- `add-rls-policies.sql`
- `add-rubric-scores-column.js`
- `add-rubric-scores-column.sql`
- `analyze-complete-teacher-student-workflow.js`
- `analyze-complete-workflow.js`
- `apply-clean-rubric-schema.js`
- `apply-rubric-fix.js`
- `check-assignment-rubric-content.js`
- `check-assignment-rubric-field.js`
- `check-database-setup.sql`
- `check-enrollment-table.sql`
- `check-rubric-system.js`
- `check-rubric-tables.js`
- `check-submissions-table-structure.js`
- `check-supabase-status.sql`
- `check-table-structures.js`
- `check-triggers.js`
- `check-user-status.sql`
- `complete-database-schema.sql`
- `create-classes-assignments-tables-safe.sql`
- `create-classes-assignments-tables.sql`
- `create-enrollments-table-minimal.sql`
- `create-submissions-table-fixed.sql`
- `create-submissions-table.sql`
- `create-test-rubric.js`
- `create-test-submissions.js`
- `create-user-profile-trigger.sql`
- `debug-analytics-issues.js`
- `debug-assignment-routing.js`
- `debug-class-codes.sql`
- `debug-database-errors.sql`
- `debug-existing-schema.sql`
- `debug-user-registration.sql`
- `disable-rubric-triggers.js`
- `disable-trigger-test.sql`
- `find-notification-types.js`
- `fix-all-database-issues.sql`
- `fix-api-routes.js`
- `fix-assignment-columns.js`
- `fix-assignment-grading-access.sql`
- `fix-assignment-teacher-relationship.js`
- `fix-assignments-table-structure.sql`
- `fix-assignments-table.sql`
- `fix-classes-access-simple.sql`
- `fix-classes-rls-for-students.sql`
- `fix-classes-table-code-unique.sql`
- `fix-complete-teacher-student-workflow-manual.js`
- `fix-complete-workflow.js`
- `fix-console-errors-comprehensive.js`
- `fix-console-errors-simple.js`
- `fix-createclient-await.js`
- `fix-critical-auth-security.js`
- `fix-current-user.sql`
- `fix-enrollment-clean.sql`
- `fix-enrollment-complete.sql`
- `fix-enrollment-constraint.sql`
- `fix-enrollment-final.sql`
- `fix-enrollment-table-inconsistency.sql`
- `fix-enrollment-table-simple.sql`
- `fix-grading-access-simple.sql`
- `fix-grading-policies.js`
- `fix-onboarding-rls.sql`
- `fix-relationships-direct.js`
- `fix-remaining-console-errors.js`
- `fix-rubric-trigger-direct.js`
- `fix-rubric-trigger.sql`
- `fix-submissions-relationships.sql`
- `fix-supabase-client.ts`
- `fix-supabase-schema-direct.js`
- `fix-supabase-schema.ps1`
- `fix-user-registration-trigger.sql`
- `fix-user-rls-policies.sql`
- `fix-workflow-with-correct-columns.js`
- `force-schema-refresh.sql`
- `minimal-schema-fix.sql`
- `peer-review-schema.sql`
- `recreate-classes-table.sql`
- `recreate-rubric-levels-table.js`
- `recreate-rubric-schema-clean.sql`
- `restart-dev-server.bat`
- `restart-dev.bat`
- `restart-dev.ps1`
- `rubric-system-schema.sql`
- `run-relationship-fix.js`
- `run-schema-fix.js`
- `setup-database-minimal.sql`
- `setup-database.js`
- `setup-user-trigger.sql`
- `simple-rls-fix.sql`
- `supabase-minimal.sql`
- `supabase-schema-safe.sql`
- `supabase-schema-setup.sql`
- `test-all-console-errors.js`
- `test-analytics-connection.js`
- `test-analytics-db.js`
- `test-assignment-queries.js`
- `test-assignment-routing.md`
- `test-assignment-rubric-field.js`
- `test-auth-flow.js`
- `test-auth-security-fixes.js`
- `test-class-code-generation.js`
- `test-class-join-flow.js`
- `test-classes-table.js`
- `test-complete-workflow-manual-joins.js`
- `test-dual-grading-system.js`
- `test-enrollment-access.sql`
- `test-enrollment-insert.sql`
- `test-enrollments-access.js`
- `test-enrollments-table.js`
- `test-final-console-fixes.js`
- `test-grading-access.js`
- `test-grading-interface.js`
- `test-grading-page-rubric-detection.js`
- `test-grading-page.js`
- `test-latest-console-errors.js`
- `test-minimal-registration.sql`
- `test-notification-api.js`
- `test-rubric-api-fixed.js`
- `test-rubric-api.js`
- `test-rubric-creation-detailed.js`
- `test-rubric-deletion.js`
- `test-rubric-system.js`
- `test-schema-creation.sql`
- `test-simple-rubric-level.js`
- `test-submissions-system.js`
- `test-supabase-connection.js`
- `tsconfig.tsbuildinfo`
- `update-dashboard-components-manual-joins.js`

</details>
