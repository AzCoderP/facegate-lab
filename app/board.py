"""Bounded, session-local shared drawing document. No OS input or text execution."""

import secrets
from collections import deque
from typing import Annotated, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

Coordinate = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]


class DrawPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    generation: str = Field(min_length=10, max_length=80)
    seq: int = Field(ge=1, le=1_000_000)
    op: Literal["begin", "append", "end", "undo", "clear"]
    stroke: str = Field(default="", pattern=r"^[a-zA-Z0-9_-]{0,40}$")
    points: list[tuple[Coordinate, Coordinate]] = Field(default_factory=list, max_length=48)
    color: str = Field(default="#35b7ff", pattern=r"^#[0-9a-fA-F]{6}$")
    width: float = Field(default=4, ge=1, le=16, allow_inf_nan=False)


class SharedBoard:
    def __init__(self):
        self.revision = 0
        self.reset()

    def reset(self):
        self.generation = secrets.token_urlsafe(18)
        self.strokes = []
        self.events = deque(maxlen=256)
        self.revision += 1

    def read(self, after=-1, generation=""):
        if (
            generation != self.generation
            or after > self.revision
            or after < 0
            or self.events
            and after < self.events[0]["revision"] - 1
        ):
            return {
                "generation": self.generation,
                "revision": self.revision,
                "strokes": [dict(s, points=list(s["points"])) for s in self.strokes],
            }
        return {
            "generation": self.generation,
            "revision": self.revision,
            "events": [e for e in self.events if e["revision"] > after],
        }

    def apply(self, patch):
        if patch.generation != self.generation:
            raise HTTPException(409, "BOARD_CHANGED")
        active = self.strokes[-1] if self.strokes and not self.strokes[-1]["ended"] else None
        if patch.op == "clear":
            self.reset()
            return self.read()
        if patch.op == "begin":
            if active or not patch.stroke or not patch.points:
                raise HTTPException(409, "STROKE_NOT_READY")
            if len(self.strokes) >= 128:
                raise HTTPException(409, "BOARD_FULL")
            if any(s["id"] == patch.stroke for s in self.strokes):
                raise HTTPException(409, "STROKE_EXISTS")
            self.strokes.append(
                {
                    "id": patch.stroke,
                    "color": patch.color,
                    "width": patch.width,
                    "points": list(patch.points),
                    "ended": False,
                }
            )
            event = {"op": "begin", "stroke": dict(self.strokes[-1], points=list(patch.points))}
        elif patch.op in ("append", "end"):
            if not active or active["id"] != patch.stroke:
                raise HTTPException(409, "STROKE_NOT_ACTIVE")
            if len(active["points"]) + len(patch.points) > 1024:
                raise HTTPException(409, "STROKE_FULL")
            active["points"].extend(patch.points)
            active["ended"] = patch.op == "end"
            event = {"op": patch.op, "id": patch.stroke, "points": list(patch.points)}
        else:
            if active:
                raise HTTPException(409, "FINISH_STROKE_FIRST")
            event = {"op": "undo", "id": self.strokes.pop()["id"] if self.strokes else ""}
        self.revision += 1
        self.events.append(dict(event, revision=self.revision))
        return {"generation": self.generation, "revision": self.revision}
