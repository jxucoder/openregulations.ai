"""
Comment Analyzer Agent

An agentic system that analyzes public comments on regulatory dockets.
Uses a pipeline of specialized sub-agents.
"""

import json
import os
from dataclasses import dataclass, asdict
from typing import Optional
from anthropic import Anthropic
import requests
import time
from collections import defaultdict
import re


# ============================================================================
# DATA MODELS
# ============================================================================

@dataclass
class Comment:
    id: str
    text: str
    author: str
    organization: Optional[str]
    state: Optional[str]
    date: str

@dataclass
class FormLetterCampaign:
    id: str
    template_preview: str
    count: int
    percentage: float

@dataclass
class Theme:
    name: str
    description: str
    count: int
    is_campaign: bool
    representative_quotes: list[str]

@dataclass
class AnalysisResult:
    docket_id: str
    docket_title: str
    total_comments: int
    unique_comments: int
    form_letter_percentage: float
    sentiment: dict
    themes: list[dict]
    campaigns: list[dict]
    notable_quotes: list[dict]
    quality_summary: str
    executive_summary: str


# ============================================================================
# AGENT: DATA FETCHER
# ============================================================================

class FetcherAgent:
    """Fetches comments from Regulations.gov API."""
    
    BASE_URL = "https://api.regulations.gov/v4"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {"X-Api-Key": api_key}
    
    def fetch_docket_info(self, docket_id: str) -> dict:
        """Get docket metadata."""
        url = f"{self.BASE_URL}/dockets/{docket_id}"
        response = requests.get(url, headers=self.headers)
        if response.status_code == 200:
            return response.json().get("data", {}).get("attributes", {})
        return {}
    
    def fetch_comments(self, docket_id: str, limit: int = 500) -> list[Comment]:
        """Fetch comments for a docket."""
        url = f"{self.BASE_URL}/comments"
        all_comments = []
        page = 1
        
        while len(all_comments) < limit and page <= 20:
            params = {
                "filter[docketId]": docket_id,
                "page[size]": 250,
                "page[number]": page,
            }
            response = requests.get(url, headers=self.headers, params=params)
            
            if response.status_code == 429:
                time.sleep(60)
                continue
            if response.status_code != 200:
                break
                
            data = response.json()
            comments = data.get("data", [])
            if not comments:
                break
                
            all_comments.extend(comments)
            page += 1
            time.sleep(0.3)
        
        return all_comments[:limit]
    
    def fetch_comment_details(self, comment_id: str) -> Optional[dict]:
        """Fetch full comment including text."""
        url = f"{self.BASE_URL}/comments/{comment_id}"
        response = requests.get(url, headers=self.headers)
        if response.status_code == 200:
            return response.json().get("data", {})
        return None
    
    def enrich_comments(self, comments: list, limit: int = 100) -> list[Comment]:
        """Fetch full text for comments."""
        enriched = []
        for c in comments[:limit]:
            details = self.fetch_comment_details(c.get("id"))
            if details:
                attrs = details.get("attributes", {})
                text = attrs.get("comment", "")
                if text and text.lower() not in ["see attached", "see attached file(s)"]:
                    enriched.append(Comment(
                        id=details.get("id"),
                        text=text,
                        author=f"{attrs.get('firstName', '')} {attrs.get('lastName', '')}".strip() or "Anonymous",
                        organization=attrs.get("organization"),
                        state=attrs.get("stateProvinceRegion"),
                        date=attrs.get("postedDate", "")[:10]
                    ))
            time.sleep(0.3)
        return enriched


# ============================================================================
# AGENT: FORM LETTER DETECTOR
# ============================================================================

class FormLetterDetectorAgent:
    """Detects form letter campaigns using text similarity."""
    
    def detect(self, comments: list[Comment]) -> tuple[list[FormLetterCampaign], list[Comment]]:
        """
        Group comments into campaigns and unique.
        Returns (campaigns, unique_comments)
        """
        # Clean and create signatures
        def clean(text):
            text = re.sub(r'<[^>]+>', ' ', text)
            text = re.sub(r'&[a-z]+;', ' ', text)
            return ' '.join(text.split()).lower()[:100]
        
        groups = defaultdict(list)
        for c in comments:
            sig = clean(c.text)
            groups[sig].append(c)
        
        campaigns = []
        unique = []
        
        for sig, group in groups.items():
            if len(group) > 1:
                campaigns.append(FormLetterCampaign(
                    id=f"campaign_{len(campaigns)+1}",
                    template_preview=group[0].text[:200],
                    count=len(group),
                    percentage=len(group) / len(comments) * 100
                ))
            else:
                unique.extend(group)
        
        # Sort campaigns by size
        campaigns.sort(key=lambda x: -x.count)
        
        return campaigns, unique


# ============================================================================
# AGENT: THEME EXTRACTOR (LLM)
# ============================================================================

class ThemeExtractorAgent:
    """Uses Claude to extract themes from comments."""
    
    def __init__(self):
        self.client = Anthropic()
    
    def extract(self, comments: list[Comment], docket_title: str) -> list[Theme]:
        """Extract themes from unique comments."""
        
        comments_text = "\n\n---\n\n".join([
            f"[{c.author}, {c.state or 'Unknown'}]: {c.text[:800]}"
            for c in comments[:50]  # Limit for token budget
        ])
        
        prompt = f"""Analyze these public comments on: {docket_title}

COMMENTS:
{comments_text}

Extract 5-8 distinct THEMES/ARGUMENTS being made. For each:
1. Name (concise, 5-10 words)
2. Description (1 sentence)
3. Approximate count/percentage
4. One representative quote

Return as JSON array:
[{{"name": "...", "description": "...", "percentage": N, "quote": "..."}}]

Only return the JSON, no other text."""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}]
        )
        
        try:
            # Extract JSON from response
            text = response.content[0].text
            # Find JSON array in response
            start = text.find('[')
            end = text.rfind(']') + 1
            if start >= 0 and end > start:
                themes_data = json.loads(text[start:end])
                return [Theme(
                    name=t.get("name", ""),
                    description=t.get("description", ""),
                    count=t.get("percentage", 0),
                    is_campaign=False,
                    representative_quotes=[t.get("quote", "")]
                ) for t in themes_data]
        except:
            pass
        return []


# ============================================================================
# AGENT: SENTIMENT ANALYZER (LLM)
# ============================================================================

class SentimentAnalyzerAgent:
    """Analyzes overall sentiment distribution."""
    
    def __init__(self):
        self.client = Anthropic()
    
    def analyze(self, comments: list[Comment], docket_title: str) -> dict:
        """Get sentiment breakdown."""
        
        sample = comments[:30]
        comments_text = "\n".join([f"- {c.text[:200]}" for c in sample])
        
        prompt = f"""Based on these comments about "{docket_title}", estimate the sentiment:

{comments_text}

Return JSON only:
{{"support": N, "oppose": N, "neutral": N}}

Where N is percentage (should sum to 100). Support means they support the proposed change.
Only return JSON."""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        
        try:
            text = response.content[0].text
            start = text.find('{')
            end = text.rfind('}') + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except:
            pass
        return {"support": 0, "oppose": 0, "neutral": 0}


# ============================================================================
# AGENT: REPORT GENERATOR (LLM)
# ============================================================================

class ReportGeneratorAgent:
    """Generates executive summary and report."""
    
    def __init__(self):
        self.client = Anthropic()
    
    def generate_summary(self, analysis: dict) -> str:
        """Generate executive summary."""
        
        prompt = f"""Generate a 3-4 sentence executive summary of this comment analysis:

Docket: {analysis['docket_id']} - {analysis['docket_title']}
Total comments: {analysis['total_comments']}
Form letter percentage: {analysis['form_letter_percentage']:.0f}%
Sentiment: {analysis['sentiment']}
Top themes: {[t['name'] for t in analysis['themes'][:3]]}

Write as if briefing a busy executive. Focus on key insight."""

        response = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}]
        )
        
        return response.content[0].text


# ============================================================================
# ORCHESTRATOR: MAIN ANALYSIS PIPELINE
# ============================================================================

class CommentAnalyzerOrchestrator:
    """
    Orchestrates the full analysis pipeline.
    
    Pipeline:
    1. Fetch comments from API
    2. Detect form letter campaigns
    3. Extract themes from unique comments
    4. Analyze sentiment
    5. Generate report
    """
    
    def __init__(self, api_key: str):
        self.fetcher = FetcherAgent(api_key)
        self.form_detector = FormLetterDetectorAgent()
        self.theme_extractor = ThemeExtractorAgent()
        self.sentiment_analyzer = SentimentAnalyzerAgent()
        self.report_generator = ReportGeneratorAgent()
    
    def analyze(self, docket_id: str, comment_limit: int = 200) -> AnalysisResult:
        """Run full analysis pipeline."""
        
        print(f"🔍 Analyzing docket: {docket_id}")
        
        # Step 1: Fetch
        print("  📥 Fetching comments...")
        docket_info = self.fetcher.fetch_docket_info(docket_id)
        docket_title = docket_info.get("title", docket_id)
        
        raw_comments = self.fetcher.fetch_comments(docket_id, limit=comment_limit * 3)
        comments = self.fetcher.enrich_comments(raw_comments, limit=comment_limit)
        print(f"     Got {len(comments)} comments with full text")
        
        # Step 2: Detect form letters
        print("  🔄 Detecting form letters...")
        campaigns, unique = self.form_detector.detect(comments)
        form_pct = (len(comments) - len(unique)) / len(comments) * 100 if comments else 0
        print(f"     Found {len(campaigns)} campaigns, {len(unique)} unique")
        
        # Step 3: Extract themes
        print("  🎯 Extracting themes...")
        themes = self.theme_extractor.extract(unique, docket_title)
        print(f"     Found {len(themes)} themes")
        
        # Step 4: Analyze sentiment
        print("  📊 Analyzing sentiment...")
        sentiment = self.sentiment_analyzer.analyze(comments, docket_title)
        print(f"     Sentiment: {sentiment}")
        
        # Step 5: Build result
        analysis = {
            "docket_id": docket_id,
            "docket_title": docket_title,
            "total_comments": len(raw_comments),
            "unique_comments": len(unique),
            "form_letter_percentage": form_pct,
            "sentiment": sentiment,
            "themes": [asdict(t) for t in themes],
            "campaigns": [asdict(c) for c in campaigns],
        }
        
        # Step 6: Generate summary
        print("  📝 Generating summary...")
        summary = self.report_generator.generate_summary(analysis)
        analysis["executive_summary"] = summary
        
        print("✅ Analysis complete!")
        
        return analysis


# ============================================================================
# CLI
# ============================================================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Analyze regulatory comments")
    parser.add_argument("--docket", required=True, help="Docket ID")
    parser.add_argument("--limit", type=int, default=100, help="Max comments to analyze")
    parser.add_argument("--output", default="analysis.json", help="Output file")
    args = parser.parse_args()
    
    api_key = os.environ.get("REGULATIONS_API_KEY")
    if not api_key:
        raise ValueError(
            "REGULATIONS_API_KEY environment variable is required. "
            "Get your key at https://api.data.gov/signup/"
        )
    
    orchestrator = CommentAnalyzerOrchestrator(api_key)
    result = orchestrator.analyze(args.docket, args.limit)
    
    # Save result
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\n📄 Saved to {args.output}")
    
    # Print summary
    print("\n" + "="*60)
    print("EXECUTIVE SUMMARY")
    print("="*60)
    print(result["executive_summary"])


if __name__ == "__main__":
    main()
