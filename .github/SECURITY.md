# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead:

1. **Email**: Send details to [INSERT SECURITY EMAIL]
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (if you have them)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Updates**: We will provide updates on the status every 5 business days
- **Resolution**: We aim to resolve critical issues within 30 days
- **Credit**: We will credit you in the release notes (unless you prefer anonymity)

### Scope

The following are in scope for security reports:

- Authentication/authorization bypasses
- SQL injection or other injection attacks
- Cross-site scripting (XSS)
- Sensitive data exposure
- API key or credential leaks in code
- Dependency vulnerabilities

### Out of Scope

- Vulnerabilities in dependencies that have already been publicly disclosed
- Social engineering attacks
- Physical attacks
- Issues in third-party services we integrate with

## Security Best Practices for Contributors

When contributing to this project:

1. **Never commit secrets** - Use environment variables
2. **Validate input** - Never trust user input
3. **Use parameterized queries** - Prevent SQL injection
4. **Keep dependencies updated** - Run `uv sync` regularly
5. **Review security advisories** - Check GitHub's Dependabot alerts

Thank you for helping keep OpenRegulations.ai secure!
