---
document_type: security-review
assessment_date: 2026-09-15
application: "WWW SQL Designer"
application_acronym: "WWWSQL"
overall_risk: MODERATE
total_findings: 7
critical_count: 0
high_count: 2
medium_count: 3
low_count: 1
informational_count: 1
confirmed_count: 1
probable_count: 4
owasp_categories: [A02, A03, A05, A06]
cwe_ids: [CWE-16, CWE-79, CWE-400, CWE-693, CWE-1104]
asvs_requirements: [V5.3.3]
mitre_techniques: [T1189, T1190]
sonarqube_quality_gate: NOT_RUN
coverage_baseline_gaps: 0
tech_stack: [".NET 10", "ASP.NET Core MVC", "Entity Framework Core 10", "SQL Server", "Keycloak/OIDC", "Node.js test tooling"]
---

# Application Security & Dependency Review: WWWSQL - WWW SQL Designer

This updated review covers the single ASP.NET Core application, its browser assets and tests, dependency manifests, deployment configuration, and the remediation changes in this branch.

## Revision History

| Version | Date | Author | Changes |
| :--- | :--- | :--- | :--- |
| `1.0` | `2026-09-15` | `Security Review Agent` | `Updated review and remediation baseline` |

## Executive Summary

The review found one confirmed stored DOM XSS, vulnerable .NET and Vitest dependency lines, a deployment-mode configuration problem, missing browser hardening headers, and an unbounded XML model write path. The branch remediates these items by moving rendering to `textContent`, rejecting XML markup in portable facets before exporter-specific semantic validation, upgrading to .NET 10 and current declared dependencies, setting IIS deployment to Production, removing inline script requirements from CSP, requiring strict UTF-8 and safe XML parsing, capping XML writes, and applying the per-client write rate limit after routing and authentication.

## Findings and Remediation Status

| ID | Severity | Location | Finding | Status |
| :--- | :--- | :--- | :--- | :--- |
| SEC-001 | High | `wwwroot/js/row.js`, `portabletypes.js` | Stored DOM XSS through type facets | Remediated: `textContent` sink and XML-safe facet validation |
| SEC-002 | Medium | `web.config` | Development mode and stdout logging in deployment configuration | Remediated: Production and stdout disabled |
| SEC-003 | High | Project files and transitive graph | Vulnerable .NET 8 dependency graph | Remediated: .NET 10 and package line upgraded; `dotnet list package --vulnerable` reports none |
| SEC-004 | Medium | Playwright package manifest/lock | Vulnerable Vitest graph | Remediated: Vitest 5 and refreshed lockfile; `npm audit --omit=optional` reports 0 vulnerabilities |
| SEC-005 | Medium | `WwwSqlController.Save` | Unbounded XML body and storage input | Remediated: strict UTF-8, 1 MiB cap with streaming fallback, well-formed XML/DTD rejection, rate limit |
| SEC-006 | Low | `web.config` | Partial browser security headers and unsafe inline CSP | Remediated: external bootstrap script and explicit headers |
| SEC-007 | Informational | Project target framework | .NET 8 support horizon | Remediated: target framework is .NET 10 |

## 1. Framework and Runtime Currency

| Component | Version after remediation | Evidence |
| :--- | :--- | :--- |
| Target framework | `net10.0` | `WwwSqlDesigner.csproj`, test project |
| ASP.NET Core and EF Core | `10.0.12` | Project package references |
| .NET test SDK | `18.10.1` | Test project |
| MSTest adapter/framework | `4.4.0` | Test project |
| Moq | `4.20.72` | Test project |
| coverlet collector | `10.0.1` | Test project |
| Playwright | `1.63.0` | `package.json` and lockfile |
| Vitest and coverage | `5.0.1` | `package.json` and lockfile |

## 2. Dependency and Supply-Chain Assessment

The NuGet package line is aligned to the installed .NET 10 SDK and the npm development/test dependencies are pinned to the reviewed current versions. The npm lockfile retains integrity hashes. A NuGet lock file, SBOM publication, artifact signing, and committed CI pipeline remain deployment-process gaps rather than application-code findings.

## 3. Security Controls

| Domain | Result | Evidence |
| :--- | :--- | :--- |
| Authentication | Pass with deployment dependency | Keycloak OIDC, PKCE, cookie authentication, HTTPS metadata outside development |
| Authorization | Pass | Owner/group/grant filtering before model access |
| CSRF | Pass | Antiforgery validation on state-changing routes |
| XSS | Remediated | `textContent`, portable facet allowlist, external bootstrap script |
| XML integrity | Remediated | DTD prohibition and bounded server-side XML reader |
| Resource exhaustion | Improved | 1 MiB request cap and 60 writes/minute policy |
| SQL injection | No finding | EF Core LINQ and parameterized persistence |
| SSRF/command injection | No finding | No user-controlled outbound/process execution path identified |
| Secrets | No tracked production secret found | Deployment configuration injection pattern |
| Headers | Remediated | CSP, frame, referrer, permissions, and content-type headers |

## 4. Zero Trust and Access Decisions

Protected resources are saved model XML, model versions, access grants, and account/session endpoints. Authentication is enforced by the controller filter and resource access is separately filtered by owner, global visibility, group membership, and explicit grants. Dependency failure does not intentionally grant access. Token revocation semantics, device/workload assurance, and security-decision telemetry are not documented in the repository and remain Unknown.

## 5. Validation Plan and Residual Risk

Post-remediation validation completed:

```text
dotnet restore                         # passed
dotnet test WwwSqlDesigner.sln         # 70 passed, 6 skipped
dotnet list ... --vulnerable           # no vulnerable packages
npm ci                                 # passed
npm audit --omit=optional              # 0 vulnerabilities
npm test                               # 104 browser tests and 7 unit tests passed
```

SonarQube remains `NOT_RUN` until the configured MSBuild scanner invocation is corrected; the previous attempt failed because the scanner rejected the project-name argument. External deployment configuration, backup/recovery objectives, runtime Keycloak policy, and a representative Indigenous-language test corpus remain outside repository evidence.
