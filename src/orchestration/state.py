"""
State definitions for the analysis pipeline.
"""

from dataclasses import dataclass, field
from typing import Optional, Literal
from datetime import datetime
from enum import Enum


class Status(str, Enum):
    PENDING = "pending"
    FETCHING = "fetching"
    DETECTING = "detecting"
    ANALYZING = "analyzing"
    REPORTING = "reporting"
    COMPLETE = "complete"
    ERROR = "error"


@dataclass
class Comment:
    id: str
    text: str
    author: str
    organization: Optional[str] = None
    state: Optional[str] = None
    date: str = ""


@dataclass
class Campaign:
    id: str
    template_preview: str
    count: int
    percentage: float


@dataclass 
class Theme:
    name: str
    description: str
    count: int
    is_campaign: bool = False
    quotes: list[str] = field(default_factory=list)


@dataclass
class AnalysisState:
    """
    Central state object that flows through the pipeline.
    Each agent reads from and writes to this state.
    """
    # Input
    docket_id: str
    
    # Pipeline status
    status: Status = Status.PENDING
    current_step: str = ""
    steps_completed: list[str] = field(default_factory=list)
    
    # Metadata
    docket_title: str = ""
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Data from Fetcher
    raw_comment_count: int = 0
    comments: list[Comment] = field(default_factory=list)
    
    # Data from FormLetterDetector
    campaigns: list[Campaign] = field(default_factory=list)
    unique_comments: list[Comment] = field(default_factory=list)
    form_letter_percentage: float = 0.0
    
    # Data from ThemeExtractor
    themes: list[Theme] = field(default_factory=list)
    
    # Data from SentimentAnalyzer
    sentiment: dict = field(default_factory=dict)
    
    # Data from ReportGenerator
    executive_summary: str = ""
    full_report: str = ""
    
    # Error tracking
    error: Optional[str] = None
    error_step: Optional[str] = None
    retry_count: int = 0
    
    def mark_step_complete(self, step: str):
        """Record that a step completed."""
        self.steps_completed.append(step)
        self.current_step = ""
    
    def mark_error(self, step: str, error: str):
        """Record an error."""
        self.status = Status.ERROR
        self.error = error
        self.error_step = step
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "docket_id": self.docket_id,
            "docket_title": self.docket_title,
            "status": self.status.value,
            "steps_completed": self.steps_completed,
            "raw_comment_count": self.raw_comment_count,
            "enriched_comment_count": len(self.comments),
            "unique_comment_count": len(self.unique_comments),
            "form_letter_percentage": self.form_letter_percentage,
            "campaign_count": len(self.campaigns),
            "campaigns": [
                {"id": c.id, "count": c.count, "preview": c.template_preview[:100]}
                for c in self.campaigns
            ],
            "theme_count": len(self.themes),
            "themes": [
                {"name": t.name, "description": t.description, "count": t.count}
                for t in self.themes
            ],
            "sentiment": self.sentiment,
            "executive_summary": self.executive_summary,
            "error": self.error,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }
