"""S10 part 1 audit actions (contract sprint-10 §2.6), registered in the [S10] block of
audit/actions.py."""

ARTICLE_CREATED = "help.article.created"
ARTICLE_UPDATED = "help.article.updated"
ARTICLE_PUBLISHED = "help.article.published"
ARTICLE_UNPUBLISHED = "help.article.unpublished"
REQUEST_CREATED = "support.request.created"
REQUEST_MESSAGE_ADDED = "support.request.message_added"
REQUEST_REPLIED = "support.request.replied"
REQUEST_TRIAGED = "support.request.triaged"
REQUEST_CLOSED = "support.request.closed"
CONTACT_RECEIVED = "support.contact.received"
CONTACT_HANDLED = "support.contact.handled"

ACTIONS: frozenset[str] = frozenset(
    {
        ARTICLE_CREATED,
        ARTICLE_UPDATED,
        ARTICLE_PUBLISHED,
        ARTICLE_UNPUBLISHED,
        REQUEST_CREATED,
        REQUEST_MESSAGE_ADDED,
        REQUEST_REPLIED,
        REQUEST_TRIAGED,
        REQUEST_CLOSED,
        CONTACT_RECEIVED,
        CONTACT_HANDLED,
    }
)
