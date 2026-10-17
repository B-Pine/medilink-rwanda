"""Page-number pagination: ?page=2&page_size=50 (default 25, max 100), architecture 02 §3."""

from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
