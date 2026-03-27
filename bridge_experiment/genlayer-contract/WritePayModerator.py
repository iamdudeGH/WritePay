import json
from dataclasses import dataclass
from genlayer import *

@allow_storage
@dataclass
class ModerationResult:
    approved: bool
    reason: str
    severity: str

class WritePayModerator(gl.Contract):
    """
    Intelligent Contract for WritePay Content Moderation
    This contract uses GenLayer's AI validators to analyze article excerpts 
    and maintain the safety guidelines of the decentralized publishing platform.
    """
    
    # Store history of moderations: article_id -> moderation_result
    moderation_history: TreeMap[str, ModerationResult]
    
    def __init__(self):
        self.moderation_history = TreeMap[str, ModerationResult]()
        
    @gl.public.write
    def moderate_article(self, article_id: str, content: str) -> bool:
        """
        Analyze the article content and vote on whether it passes moderation.
        Returns True if safe to publish, False if inappropriate.
        """
        if article_id in self.moderation_history:
            return self.moderation_history[article_id].approved

        # Prompt for the AI Validator Nodes
        def analyze_content() -> str:
            task = f"""
            You are a crucial content moderation AI for the WritePay decentralized publishing platform.
            Analyze the following article content:
            
            CONTENT:
            {content}
            
            Determine if this content is safe AND high-quality. 
            Reject the content (approved: false) if it contains ANY of the following:
            1. Inappropriate material (hate speech, extreme violence, illegal acts)
            2. Low-effort spam, random keyboard mashing, gibberish, or meaningless test strings (e.g. "asdf", "test").
            3. Pure promotional spam without real article substance.
            
            Return a valid JSON object strictly matching this format:
            {{"approved": true/false, "reason": "short explanation", "severity": "low/medium/high"}}
            """
            return gl.nondet.exec_prompt(task)
            
        # Execute prompt across multiple nodes and require consensus
        result = gl.eq_principle.prompt_non_comparative(
            analyze_content,
            task="Moderate content based on community safety guidelines and quality standards.",
            criteria="Fair, objective detection of spam, gibberish, hate speech, and extreme violations. Approve real content."
        )
        
        try:
            parsed_result = json.loads(result)
            is_approved = parsed_result.get("approved", False)
            
            # Save the result on the GenLayer blockchain
            self.moderation_history[article_id] = ModerationResult(
                approved=is_approved,
                reason=parsed_result.get("reason", "Unknown"),
                severity=parsed_result.get("severity", "Unknown")
            )
            return is_approved
            
        except Exception:
            # If the AI failed to produce valid JSON, fail closed
            self.moderation_history[article_id] = ModerationResult(
                approved=False,
                reason="Failed to parse AI output",
                severity="high"
            )
            return False
            
    @gl.public.view
    def get_moderation_result(self, article_id: str) -> ModerationResult:
        """Fetch the moderation history of a specific article blob ID."""
        if article_id in self.moderation_history:
            return self.moderation_history[article_id]
        return ModerationResult(approved=False, reason="Not moderated yet", severity="unknown")
