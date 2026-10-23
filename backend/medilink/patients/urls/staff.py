"""/api/v1/staff/patients/ routes ([S3] block of config/urls.py)."""

from django.urls import path

from medilink.patients import views_staff as v

urlpatterns = [
    path("", v.PatientCreateView.as_view(), name="staff-patients-create"),
    path("search/", v.SearchView.as_view(), name="staff-patients-search"),
    path("duplicate-checks/", v.DuplicateCheckView.as_view(), name="staff-patients-duplicates"),
    path("add-existing/", v.AddExistingView.as_view(), name="staff-patients-add-existing"),
    path("<uuid:fp_id>/", v.PatientDetailView.as_view(), name="staff-patients-detail"),
    path(
        "<uuid:fp_id>/identifiers/",
        v.IdentifierCreateView.as_view(),
        name="staff-patients-identifiers",
    ),
    path("<uuid:fp_id>/reveal/", v.RevealView.as_view(), name="staff-patients-reveal"),
    path(
        "<uuid:fp_id>/insurance-profiles/",
        v.InsuranceListView.as_view(),
        name="staff-patients-insurance",
    ),
    path(
        "<uuid:fp_id>/insurance-profiles/<uuid:profile_id>/",
        v.InsuranceDetailView.as_view(),
        name="staff-patients-insurance-detail",
    ),
    path(
        "<uuid:fp_id>/insurance-profiles/<uuid:profile_id>/verify/",
        v.InsuranceVerifyView.as_view(),
        name="staff-patients-insurance-verify",
    ),
    path(
        "<uuid:fp_id>/insurance-profiles/<uuid:profile_id>/card-images/",
        v.CardImageView.as_view(),
        name="staff-patients-insurance-card",
    ),
    path(
        "<uuid:fp_id>/insurance-profiles/<uuid:profile_id>/card-images/<str:side>/download-links/",
        v.CardDownloadLinkView.as_view(),
        name="staff-patients-insurance-card-link",
    ),
    path(
        "<uuid:fp_id>/health-profile/",
        v.HealthProfileView.as_view(),
        name="staff-patients-health-profile",
    ),
    path("<uuid:fp_id>/consents/", v.ConsentCreateView.as_view(), name="staff-patients-consents"),
    path(
        "<uuid:fp_id>/<str:kind>/<uuid:item_id>/review/",
        v.HealthItemReviewView.as_view(),
        name="staff-patients-health-review",
    ),
    path(
        "<uuid:fp_id>/<str:kind>/",
        v.HealthItemCreateView.as_view(),
        name="staff-patients-health-item",
    ),
]
