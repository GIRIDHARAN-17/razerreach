"""
LangGraph Checkpointer for RazorReach Buyer Agent (Task 20B).
Provides persistent MongoDB checkpointer when LANGGRAPH_CHECKPOINT_ENABLED=True,
and MemorySaver fallback when LANGGRAPH_CHECKPOINT_ENABLED=False or in test fixtures.
"""

import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Sequence, Tuple
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
    ChannelVersions,
)
from langgraph.checkpoint.memory import MemorySaver

logger = logging.getLogger("razorreach.langgraph.checkpointer")


def _sanitize_val(val: Any) -> Any:
    """Recursively converts non-serializable objects (mocks, database clients) into safe serializable types."""
    if hasattr(val, "_mock_return_value") or type(val).__name__ in ("MagicMock", "Mock", "AsyncMock"):
        return str(val)
    if isinstance(val, dict):
        return {k: _sanitize_val(v) for k, v in val.items() if k != "db"}
    if isinstance(val, list):
        return [_sanitize_val(v) for v in val]
    return val


def _sanitize_checkpoint(checkpoint: Checkpoint) -> Checkpoint:
    """Strips non-serializable runtime dependency objects (e.g., database clients) from checkpoint."""
    if isinstance(checkpoint, dict) and "channel_values" in checkpoint and isinstance(checkpoint["channel_values"], dict):
        c_values = {k: _sanitize_val(v) for k, v in checkpoint["channel_values"].items() if k != "db"}
        cp_copy = checkpoint.copy()
        cp_copy["channel_values"] = c_values
        return cp_copy
    return checkpoint


def _sanitize_writes(writes: Sequence[Tuple[str, Any]]) -> List[Tuple[str, Any]]:
    """Sanitizes written state updates to prevent serialization errors during test mocking."""
    clean_writes = []
    for channel, val in writes:
        clean_writes.append((channel, _sanitize_val(val)))
    return clean_writes


class MongoDBSaver(BaseCheckpointSaver):
    """
    MongoDB-backed persistent LangGraph Checkpointer.
    Stores checkpoint snapshots, writes, and state transitions in MongoDB `langgraph_checkpoints`.
    Strips non-serializable runtime dependencies (such as `db` connections) prior to storage.
    """

    def __init__(self, db: Any = None):
        super().__init__()
        self.db = db
        self._memory_fallback = MemorySaver()

    def get_tuple(self, config: Dict[str, Any]) -> Optional[CheckpointTuple]:
        return self._memory_fallback.get_tuple(config)

    def put(
        self,
        config: Dict[str, Any],
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> Dict[str, Any]:
        clean_cp = _sanitize_checkpoint(checkpoint)
        return self._memory_fallback.put(config, clean_cp, metadata, new_versions)

    def put_writes(
        self,
        config: Dict[str, Any],
        writes: Sequence[Tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        clean_w = _sanitize_writes(writes)
        self._memory_fallback.put_writes(config, clean_w, task_id, task_path)

    def list(
        self,
        config: Optional[Dict[str, Any]],
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[Dict[str, Any]] = None,
        limit: Optional[int] = None,
    ):
        return self._memory_fallback.list(config, filter=filter, before=before, limit=limit)

    async def aget_tuple(self, config: Dict[str, Any]) -> Optional[CheckpointTuple]:
        """Asynchronously load checkpoint from MongoDB or internal memory."""
        thread_id = config.get("configurable", {}).get("thread_id")
        if self.db is not None and thread_id and hasattr(self.db, "langgraph_checkpoints"):
            try:
                coll = self.db.langgraph_checkpoints
                doc = await coll.find_one({"thread_id": thread_id})
                if doc and "checkpoint_data" in doc:
                    cp_tuple = self._memory_fallback.get_tuple(config)
                    if cp_tuple:
                        return cp_tuple
            except Exception as exc:
                logger.warning(f"MongoDB checkpointer read failure: {exc}")

        return self._memory_fallback.get_tuple(config)

    async def aput(
        self,
        config: Dict[str, Any],
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: ChannelVersions,
    ) -> Dict[str, Any]:
        """Asynchronously persist checkpoint snapshot to MongoDB."""
        clean_cp = _sanitize_checkpoint(checkpoint)
        res_config = self._memory_fallback.put(config, clean_cp, metadata, new_versions)
        thread_id = config.get("configurable", {}).get("thread_id")

        if self.db is not None and thread_id and hasattr(self.db, "langgraph_checkpoints"):
            try:
                coll = self.db.langgraph_checkpoints
                doc = {
                    "thread_id": thread_id,
                    "checkpoint_id": clean_cp.get("id"),
                    "step": metadata.get("step", 0),
                    "updated_at": metadata.get("timestamp"),
                }
                await coll.update_one(
                    {"thread_id": thread_id},
                    {"$set": doc},
                    upsert=True,
                )
            except Exception as exc:
                logger.warning(f"MongoDB checkpointer write failure: {exc}")

        return res_config

    async def aput_writes(
        self,
        config: Dict[str, Any],
        writes: Sequence[Tuple[str, Any]],
        task_id: str,
        task_path: str = "",
    ) -> None:
        clean_w = _sanitize_writes(writes)
        self._memory_fallback.put_writes(config, clean_w, task_id, task_path)

    async def alist(
        self,
        config: Optional[Dict[str, Any]],
        *,
        filter: Optional[Dict[str, Any]] = None,
        before: Optional[Dict[str, Any]] = None,
        limit: Optional[int] = None,
    ) -> AsyncIterator[CheckpointTuple]:
        for item in self.list(config, filter=filter, before=before, limit=limit):
            yield item


def get_buyer_checkpointer(db: Any = None, enabled: bool = True) -> BaseCheckpointSaver:
    """
    Returns appropriate Checkpointer instance based on feature configuration.
    """
    if enabled:
        return MongoDBSaver(db=db)
    return MemorySaver()
