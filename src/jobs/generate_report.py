"""
Generate Report Job: Read comments from DB -> Claude writes HTML analysis -> store in DB

Unlike analyze.py which extracts structured JSON (sentiment %, theme arrays),
this job asks Claude to write a freeform HTML report like a policy analyst would.

Run:
    python -m src.jobs.generate_report --docket-id NHTSA-2025-0491
    python -m src.jobs.generate_report --all --max-dockets 5
"""

from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List

from dotenv import load_dotenv

load_dotenv()

try:
    import anthropic
except ImportError:
    anthropic = None

from src.db import Comment, Report, get_client


def get_claude_client():
    """Get Anthropic client."""
    if anthropic is None:
        raise ImportError("Please install anthropic: pip install anthropic")
    return anthropic.Anthropic()


def detect_form_letters(comments: List[Comment], threshold: int = 5) -> Dict:
    """
    Detect form letter campaigns using text similarity.
    No LLM needed - groups near-identical comments by normalized text prefix.
    """
    def normalize(text: str) -> str:
        if not text:
            return ""
        return " ".join(text.lower().split())[:500]

    groups = defaultdict(list)
    for c in comments:
        key = normalize(c.text)
        if key:
            groups[key].append(c)

    campaigns = []
    unique = []

    for key, group in groups.items():
        if len(group) >= threshold:
            campaigns.append({
                "id": f"campaign_{len(campaigns) + 1}",
                "template": group[0].text[:500] if group[0].text else "",
                "count": len(group),
                "comment_ids": [c.id for c in group],
            })
        else:
            unique.extend(group)

    campaigns.sort(key=lambda x: -x["count"])

    return {
        "campaigns": campaigns,
        "unique_comments": unique,
        "total": len(comments),
        "form_letter_pct": round(
            (len(comments) - len(unique)) / len(comments) * 100, 1
        ) if comments else 0,
    }


def sample_comments(
    unique_comments: List[Comment], sample_size: int = 300
) -> List[Comment]:
    """
    Sample unique comments for the report prompt.

    Strategy:
    - If fewer than sample_size, use all
    - Otherwise, prioritize: org comments first, then longest comments
    """
    if len(unique_comments) <= sample_size:
        return unique_comments

    # Separate org vs individual comments
    org_comments = [c for c in unique_comments if c.organization]
    individual_comments = [c for c in unique_comments if not c.organization]

    # Sort individuals by text length (longest = most substantive)
    individual_comments.sort(key=lambda c: len(c.text or ""), reverse=True)

    # Take all org comments (up to half the budget), fill rest with longest individuals
    org_budget = min(len(org_comments), sample_size // 2)
    remaining = sample_size - org_budget

    sample = org_comments[:org_budget] + individual_comments[:remaining]
    return sample


def build_prompt(
    docket_id: str,
    docket_title: str,
    agency: str,
    total_comments: int,
    form_letter_result: Dict,
    sampled_comments: List[Comment],
) -> str:
    """Build the analysis prompt for Claude."""
    unique_count = len(form_letter_result["unique_comments"])
    form_pct = form_letter_result["form_letter_pct"]
    campaigns = form_letter_result["campaigns"]

    # Campaign summaries
    campaign_text = ""
    if campaigns:
        campaign_text = "\n\n### Form Letter Campaigns Detected\n"
        for i, c in enumerate(campaigns[:5], 1):
            snippet = c["template"][:200].replace("\n", " ")
            campaign_text += (
                f"\n**Campaign {i}** ({c['count']} copies, "
                f"{round(c['count'] / total_comments * 100, 1)}% of all comments):\n"
                f'> "{snippet}..."\n'
            )

    # Format sampled comments
    comments_text = ""
    for i, c in enumerate(sampled_comments, 1):
        author = c.author or "Anonymous"
        org = f" ({c.organization})" if c.organization else ""
        state = f", {c.state}" if c.state else ""
        text = (c.text or "")[:1500]
        comments_text += f"\n---\n**Comment {i}** by {author}{org}{state}:\n{text}\n"

    return f"""You are a senior policy analyst at a nonpartisan research institute. You have been
asked to analyze public comments submitted to {agency} on the following proposed regulation:

**Docket:** {docket_id}
**Title:** {docket_title}
**Agency:** {agency}

### Comment Statistics
- Total comments received: {total_comments:,}
- Unique/original comments: {unique_count:,}
- Form letter percentage: {form_pct}%
- Comments in this sample: {len(sampled_comments)}
{campaign_text}

### Sampled Comments
The following are {len(sampled_comments)} comments selected from the {unique_count:,} unique \
(non-form-letter) comments. Organization comments and longer substantive comments were \
prioritized in sampling.
{comments_text}

---

## Your Task

Write a comprehensive analysis report as an HTML fragment. You have full freedom to structure
this however best serves the reader. Write what is interesting and important -- do NOT follow
a rigid template. Different dockets deserve different analyses.

Output rules:
- Write ONLY the inner HTML content -- no <html>, <head>, <body>, or <doctype> tags.
- Use semantic HTML: <h2>, <h3> for sections, <p> for paragraphs, <blockquote> for quotes,
  <ul>/<ol>/<li> for lists, <strong>/<em> for emphasis.
- Do NOT add any CSS, classes, or style attributes. Styling is handled externally.
- Do NOT include a title/h1 -- one will be added automatically.

Guidelines:
- Be a policy analyst, not a summarizer. Identify what matters, what's surprising,
  where commenters disagree with each other, and what decision-makers should pay attention to.
- Quote specific comments. Use <blockquote> with attribution when they illustrate a point.
- Cite numbers. Be precise about how many commenters raised a concern, what percentages
  you're seeing, etc.
- Be transparent about methodology. Note the sample size, acknowledge what you can and
  cannot conclude from this data.
- Surface tensions and nuances. Don't just list themes -- explain where commenters
  disagree, what tradeoffs they identify, and what assumptions they challenge.
- Be concise but thorough. Aim for depth over breadth. A focused 2000-word analysis of
  the most important dynamics is better than a shallow 4000-word survey.

Begin your report directly with the analysis."""


def generate_report(docket_id: str, sample_size: int = 300) -> Dict:
    """
    Generate a freeform HTML report for a docket.

    Steps:
    1. Load docket metadata + all comments from Supabase
    2. Detect form letters locally
    3. Sample unique comments (prioritize org + longest)
    4. Single Claude call to write the report as HTML
    5. Store HTML + metadata in reports table
    """
    db = get_client()
    claude = get_claude_client()

    log_id = db.log_sync_start("generate_report", docket_id)

    try:
        print(f"[REPORT] Starting report generation for {docket_id}")

        # 1. Load docket + comments
        docket = db.get_docket(docket_id)
        if not docket:
            raise ValueError(f"Docket not found: {docket_id}")

        comments = db.get_comments(docket_id, limit=10000)
        if not comments:
            raise ValueError(f"No comments found for {docket_id}")

        print(f"[REPORT] Loaded {len(comments)} comments")

        # 2. Detect form letters
        form_result = detect_form_letters(comments)
        unique_comments = form_result["unique_comments"]
        print(
            f"[REPORT] {len(form_result['campaigns'])} campaigns, "
            f"{len(unique_comments)} unique comments"
        )

        # 3. Sample comments
        sampled = sample_comments(unique_comments, sample_size)
        print(f"[REPORT] Sampled {len(sampled)} comments for analysis")

        # 4. Build prompt and call Claude
        prompt = build_prompt(
            docket_id=docket_id,
            docket_title=docket.title,
            agency=docket.agency,
            total_comments=len(comments),
            form_letter_result=form_result,
            sampled_comments=sampled,
        )

        print(f"[REPORT] Calling Claude (prompt ~{len(prompt)} chars)...")
        response = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}],
        )

        report_html = response.content[0].text
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens

        print(
            f"[REPORT] Generated report: {len(report_html)} chars HTML "
            f"({input_tokens} in / {output_tokens} out tokens)"
        )

        # 5. Store in DB
        report = Report(
            docket_id=docket_id,
            report_html=report_html,
            report_metadata={
                "total_comments": len(comments),
                "unique_comments": len(unique_comments),
                "form_letter_pct": form_result["form_letter_pct"],
                "campaign_count": len(form_result["campaigns"]),
                "sample_size": len(sampled),
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            },
            model_used="claude-sonnet-4-20250514",
            generated_at=datetime.now(timezone.utc),
        )

        db.upsert_report(report)
        print("[REPORT] Saved report to database")

        db.log_sync_complete(log_id, records_fetched=len(comments), records_created=1)

        return report.to_dict()

    except Exception as e:
        print(f"[REPORT] Error: {e}")
        db.log_sync_error(log_id, str(e))
        raise


def run_all_reports(max_dockets: int = 5, sample_size: int = 300) -> List[Dict]:
    """Generate reports for dockets that need them."""
    db = get_client()

    print("[REPORT] Finding dockets to generate reports for...")

    # Get dockets with comments, ordered by comment count
    # Prefer dockets without existing reports
    result = db.client.table("dockets").select(
        "id, total_comments_at_sync"
    ).order(
        "total_comments_at_sync", desc=True
    ).limit(max_dockets * 2).execute()

    if not result.data:
        print("[REPORT] No dockets found")
        return []

    # Filter to those without reports (or with stale reports)
    docket_ids = []
    for row in result.data:
        did = row["id"]
        existing = db.get_report(did)
        if not existing:
            docket_ids.append(did)
        if len(docket_ids) >= max_dockets:
            break

    if not docket_ids:
        print("[REPORT] All dockets already have reports")
        return []

    print(f"[REPORT] Will generate reports for {len(docket_ids)} dockets")

    results = []
    for docket_id in docket_ids:
        print(f"\n[REPORT] === {docket_id} ===")
        try:
            result = generate_report(docket_id, sample_size)
            results.append({"docket_id": docket_id, "status": "success"})
        except Exception as e:
            print(f"[REPORT] Failed: {e}")
            results.append({"docket_id": docket_id, "status": "error", "error": str(e)})

    return results


# CLI
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate markdown analysis reports")
    parser.add_argument("--docket-id", help="Generate report for specific docket")
    parser.add_argument("--all", action="store_true", help="Generate reports for all pending dockets")
    parser.add_argument("--max-dockets", type=int, default=5)
    parser.add_argument("--sample-size", type=int, default=300)
    args = parser.parse_args()

    if args.docket_id:
        result = generate_report(args.docket_id, args.sample_size)
        print("\n[REPORT] Complete!")
        print(f"  HTML length: {len(result.get('report_html', ''))} chars")
        meta = result.get("report_metadata", {})
        print(f"  Comments sampled: {meta.get('sample_size', 0)}")
        print(f"  Tokens: {meta.get('input_tokens', 0)} in / {meta.get('output_tokens', 0)} out")
    elif args.all:
        results = run_all_reports(args.max_dockets, args.sample_size)
        success = sum(1 for r in results if r["status"] == "success")
        print(f"\n[REPORT] Generated {success}/{len(results)} reports")
    else:
        print("Specify --docket-id or --all")
