# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

_Inferred from the repository and the owner's brief; the interview went unanswered._
People who need to know what the public told a federal agency about a proposed rule: reporters and
policy researchers, advocates and industry staff tracking a rulemaking, and engaged members of the public
deciding whether to comment. They usually arrive with one docket in mind.

## Product Purpose

OpenRegulations.ai reads the public comments on Regulations.gov dockets, separates organized form-letter
campaigns from original comments, and publishes plain-language AI analyses of what commenters argued.
Success: a visitor understands a docket's public record in minutes and can trace any claim back to the
source comment.

## Positioning

Counting voices, not copies. Raw comment counts mostly measure who ran the bigger campaign; this product
reports campaigns as campaigns and analyzes the original voices.

## Operating Context

- Data: Regulations.gov API (daily sync, rate-limited to 1,000 requests/hour), stored in Supabase.
- Form letters: 5+ comments sharing the same first 500 normalized characters form one campaign.
- Analysis: Claude reads up to 300 original comments per docket; organizations get up to half the sample.
- On large dockets only part of the comments are retrieved; pages must say how much was covered.

## Capabilities and Constraints

- Docket index, per-docket AI analysis, structured themes/sentiment where available, docket-scoped chat.
- Static site on Cloudflare Pages; data via a Cloudflare Worker with Supabase fallback.
- Undecided: whether to cover dockets beyond the current sync set; dark mode.

## Brand Commitments

- Name: OpenRegulations.ai.
- Look and feel: "tech + policy" (owner's words).
- Always independent and nonpartisan: never affiliated with any government, never takes a side on a rule.
- AI analyses are labeled as AI-written, with their sample size and limits.

## Evidence on Hand

Real dockets, comment counts, campaign counts, and AI reports in Supabase (project `openregulations`).
No testimonials, users, press, or usage metrics exist; never fabricate them.

## Product Principles

1. Show the copies and the voices separately, everywhere.
2. Every number states what it counts and how much of the docket it covers.
3. Every quote traces to a comment on Regulations.gov.
4. Neutral voice: describe arguments, never endorse them.

## Accessibility & Inclusion

WCAG 2.1 AA: contrast, keyboard access, and colors that differ in lightness, not hue alone.
