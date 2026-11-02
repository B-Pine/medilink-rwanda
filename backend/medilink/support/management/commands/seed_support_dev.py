"""manage.py seed_support_dev: starter help articles, published (contract sprint-10). DEBUG only.

Idempotent: an article whose slug exists is left as it is.
"""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from medilink.accounts.models import User
from medilink.support.models import ArticleStatus, HelpArticle
from medilink.support.starter_articles import ARTICLES


class Command(BaseCommand):
    help = "Create the starter help articles (DEBUG only)."

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.DEBUG:
            raise CommandError("seed_support_dev runs only with DEBUG=True.")
        author = User.objects.filter(is_platform_admin=True).order_by("pk").first()
        if author is None:
            self.stdout.write("No platform admin yet: run seed_dev first.")
            return
        created = 0
        for data in ARTICLES:
            _, was_created = HelpArticle.objects.get_or_create(
                slug=data["slug"],
                defaults={
                    **{k: v for k, v in data.items() if k != "slug"},
                    "status": ArticleStatus.PUBLISHED,
                    "published_at": timezone.now(),
                    "created_by": author,
                    "updated_by": author,
                },
            )
            created += int(was_created)
        self.stdout.write(f"Help articles: {created} created.")
