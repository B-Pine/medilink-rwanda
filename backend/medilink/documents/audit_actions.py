"""S7b audit actions (contract sprint-07 §2.3), registered in the [S7] block of audit/actions.py.
Verification checks go to `documents_verification_log`, not the audit chain."""

ACTIONS: frozenset[str] = frozenset(
    {
        "documents.generated",
        "documents.superseded",
        "documents.downloaded",
        "documents.shared",
        "documents.share_revoked",
        "documents.printed",
        "documents.source_signed",
    }
)
