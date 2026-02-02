"""
Data models for OpenRegulations.ai

These are simple dataclasses that map to database tables.
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any
from datetime import datetime, date


@dataclass
class Docket:
    """A regulatory docket from Regulations.gov"""
    
    id: str                                  # e.g., "NHTSA-2025-0491"
    title: str
    agency: str                              # e.g., "NHTSA"
    
    # Optional fields
    agency_name: Optional[str] = None
    abstract: Optional[str] = None
    document_type: Optional[str] = None
    regulations_url: Optional[str] = None
    posted_date: Optional[date] = None
    comment_start_date: Optional[date] = None
    comment_end_date: Optional[date] = None
    last_synced_at: Optional[datetime] = None
    total_comments_at_sync: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for database insertion."""
        d = {}
        for k, v in asdict(self).items():
            if v is not None:
                if isinstance(v, (datetime, date)):
                    d[k] = v.isoformat()
                else:
                    d[k] = v
        return d
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Docket":
        """Create from database row."""
        # Parse date fields
        for field_name in ["posted_date", "comment_start_date", "comment_end_date"]:
            if data.get(field_name) and isinstance(data[field_name], str):
                data[field_name] = date.fromisoformat(data[field_name])
        
        # Parse datetime fields
        for field_name in ["last_synced_at", "created_at", "updated_at"]:
            if data.get(field_name) and isinstance(data[field_name], str):
                data[field_name] = datetime.fromisoformat(
                    data[field_name].replace("Z", "+00:00")
                )
        
        # Only pass known fields
        known_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known_fields}
        
        return cls(**filtered)
    
    @classmethod
    def from_regulations_gov(cls, api_data: Dict) -> "Docket":
        """Create from Regulations.gov API response."""
        attrs = api_data.get("attributes", {})
        
        return cls(
            id=api_data.get("id") or attrs.get("docketId"),
            title=attrs.get("title", ""),
            agency=attrs.get("agencyId", ""),
            agency_name=attrs.get("agencyName"),
            abstract=attrs.get("abstract"),
            document_type=attrs.get("documentType"),
            regulations_url=f"https://www.regulations.gov/docket/{api_data.get('id')}",
            posted_date=date.fromisoformat(attrs["postedDate"][:10]) if attrs.get("postedDate") else None,
            comment_start_date=date.fromisoformat(attrs["commentStartDate"][:10]) if attrs.get("commentStartDate") else None,
            comment_end_date=date.fromisoformat(attrs["commentEndDate"][:10]) if attrs.get("commentEndDate") else None,
        )


@dataclass
class Comment:
    """A public comment on a docket"""
    
    id: str                                  # e.g., "NHTSA-2025-0491-0001"
    docket_id: str
    
    # Content
    text: Optional[str] = None
    title: Optional[str] = None
    
    # Author
    author: Optional[str] = None
    organization: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "US"
    
    # Classification (set by analysis)
    is_form_letter: bool = False
    form_letter_cluster_id: Optional[str] = None
    sentiment: Optional[str] = None          # 'oppose', 'support', 'neutral'
    quality_score: Optional[int] = None      # 1-5
    
    # Metadata
    posted_date: Optional[datetime] = None
    received_date: Optional[datetime] = None
    has_attachments: bool = False
    attachment_count: int = 0
    fetched_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for database insertion."""
        d = {}
        for k, v in asdict(self).items():
            if v is not None:
                if isinstance(v, datetime):
                    d[k] = v.isoformat()
                else:
                    d[k] = v
        return d
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Comment":
        """Create from database row."""
        # Parse datetime fields
        for field_name in ["posted_date", "received_date", "fetched_at", "created_at"]:
            if data.get(field_name) and isinstance(data[field_name], str):
                data[field_name] = datetime.fromisoformat(
                    data[field_name].replace("Z", "+00:00")
                )
        
        known_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known_fields}
        
        return cls(**filtered)
    
    @classmethod
    def from_regulations_gov(cls, api_data: Dict, docket_id: str) -> "Comment":
        """Create from Regulations.gov API response."""
        attrs = api_data.get("attributes", {})
        
        # Handle None values for names
        first = attrs.get("firstName") or ""
        last = attrs.get("lastName") or ""
        author = f"{first} {last}".strip() or None
        
        return cls(
            id=api_data.get("id"),
            docket_id=docket_id,
            text=attrs.get("comment"),
            title=attrs.get("title"),
            author=author,
            organization=attrs.get("organization"),
            city=attrs.get("city"),
            state=attrs.get("stateProvinceRegion"),
            country=attrs.get("country") or "US",
            posted_date=datetime.fromisoformat(attrs["postedDate"].replace("Z", "+00:00")) if attrs.get("postedDate") else None,
            received_date=datetime.fromisoformat(attrs["receiveDate"].replace("Z", "+00:00")) if attrs.get("receiveDate") else None,
            has_attachments=len(attrs.get("attachments") or []) > 0,
            attachment_count=len(attrs.get("attachments") or []),
            fetched_at=datetime.now(),
        )


@dataclass
class CommentEmbedding:
    """Vector embedding for a comment"""
    
    comment_id: str
    embedding: List[float]
    docket_id: str
    
    model: str = "text-embedding-3-small"
    sentiment: Optional[str] = None
    theme_ids: Optional[List[str]] = None
    created_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for database insertion."""
        return {
            "comment_id": self.comment_id,
            "embedding": self.embedding,
            "docket_id": self.docket_id,
            "model": self.model,
            "sentiment": self.sentiment,
            "theme_ids": self.theme_ids,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CommentEmbedding":
        """Create from database row."""
        return cls(
            comment_id=data["comment_id"],
            embedding=data["embedding"],
            docket_id=data["docket_id"],
            model=data.get("model", "text-embedding-3-small"),
            sentiment=data.get("sentiment"),
            theme_ids=data.get("theme_ids"),
        )


@dataclass
class Analysis:
    """AI analysis results for a docket"""
    
    docket_id: str
    
    # Statistics
    total_comments: int = 0
    unique_comments: int = 0
    form_letter_count: int = 0
    form_letter_percentage: float = 0.0
    high_quality_count: int = 0
    
    # Analysis results (stored as JSON)
    sentiment: Optional[Dict] = None          # {"oppose": 62, "support": 28, "neutral": 10}
    themes: Optional[List[Dict]] = None       # [{id, name, count, ...}, ...]
    campaigns: Optional[List[Dict]] = None    # [{id, template, count, ...}, ...]
    notable_comments: Optional[List[Dict]] = None
    
    # Generated content
    executive_summary: Optional[str] = None
    key_findings: Optional[List[str]] = None
    alerts: Optional[List[Dict]] = None
    
    # Metadata
    analyzed_at: Optional[datetime] = None
    analysis_version: str = "1.0"
    model_used: str = "claude-sonnet-4-20250514"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for database insertion."""
        d = {
            "docket_id": self.docket_id,
            "total_comments": self.total_comments,
            "unique_comments": self.unique_comments,
            "form_letter_count": self.form_letter_count,
            "form_letter_percentage": self.form_letter_percentage,
            "high_quality_count": self.high_quality_count,
            "sentiment": self.sentiment,
            "themes": self.themes,
            "campaigns": self.campaigns,
            "notable_comments": self.notable_comments,
            "executive_summary": self.executive_summary,
            "key_findings": self.key_findings,
            "alerts": self.alerts,
            "analysis_version": self.analysis_version,
            "model_used": self.model_used,
        }
        
        if self.analyzed_at:
            d["analyzed_at"] = self.analyzed_at.isoformat()
        
        return d
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Analysis":
        """Create from database row."""
        # Parse datetime fields
        for field_name in ["analyzed_at", "created_at", "updated_at"]:
            if data.get(field_name) and isinstance(data[field_name], str):
                data[field_name] = datetime.fromisoformat(
                    data[field_name].replace("Z", "+00:00")
                )
        
        known_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known_fields}
        
        return cls(**filtered)
