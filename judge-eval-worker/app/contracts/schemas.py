from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MetricResponse(BaseModel):
    value: float = Field(..., ge=0.0, le=1.0)
    details: Optional[Dict[str, Any]] = None
    warnings: List[str] = Field(default_factory=list)


class FaithfulnessInput(BaseModel):
    agent_output: "FaithfulnessOutput"
    reference: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class FaithfulnessOutput(BaseModel):
    text: str
    context: List[str] = Field(default_factory=list)
    claims: Optional[List[str]] = None


class FactInput(BaseModel):
    agent_output: "FactOutput"
    reference: "FactReference"
    config: Optional[Dict[str, Any]] = None


class FactOutput(BaseModel):
    text: str


class FactReference(BaseModel):
    relevant_doc_texts: List[str]


class CitationInput(BaseModel):
    agent_output: "CitationOutput"
    reference: "CitationReference"
    config: Optional[Dict[str, Any]] = None


class CitationOutput(BaseModel):
    text_with_citations: str


class CitationReference(BaseModel):
    relevant_doc_ids: List[str]


class CorrectnessInput(BaseModel):
    agent_output: "CorrectnessOutput"
    reference: "AnswerReference"
    config: Optional[Dict[str, Any]] = None


class CorrectnessOutput(BaseModel):
    text: str


class AnswerReference(BaseModel):
    answer: str


class ContraInput(BaseModel):
    agent_output: "ContraOutput"
    reference: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class ContraOutput(BaseModel):
    text: str
    context: List[str] = Field(default_factory=list)


class SimInput(BaseModel):
    agent_output: CorrectnessOutput
    reference: AnswerReference
    config: Optional[Dict[str, Any]] = None


class JudgeRefInput(BaseModel):
    agent_output: CorrectnessOutput
    reference: AnswerReference
    config: "JudgeRefConfig"


class JudgeRefConfig(BaseModel):
    rubric: str
    scale: int = 5


class SafeInput(BaseModel):
    agent_output: "SafeOutput"
    reference: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class SafeOutput(BaseModel):
    text: str


FaithfulnessInput.model_rebuild()
FactInput.model_rebuild()
CitationInput.model_rebuild()
CorrectnessInput.model_rebuild()
ContraInput.model_rebuild()
SimInput.model_rebuild()
JudgeRefInput.model_rebuild()
SafeInput.model_rebuild()
