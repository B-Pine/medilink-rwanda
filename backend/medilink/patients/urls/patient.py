"""/api/v1/patient/ S3 routes ([S3] block of config/urls.py)."""

from django.urls import path

from medilink.patients import views_patient as v

urlpatterns = [
    path("profiles/", v.ProfileListView.as_view(), name="patient-profiles"),
    path("profiles/<uuid:patient_id>/", v.ProfileDetailView.as_view(), name="patient-profile"),
    path(
        "profiles/<uuid:patient_id>/identifiers/",
        v.IdentifierListView.as_view(),
        name="patient-identifiers",
    ),
    path(
        "profiles/<uuid:patient_id>/identifiers/<uuid:identifier_id>/reveal/",
        v.IdentifierRevealView.as_view(),
        name="patient-identifier-reveal",
    ),
    path(
        "profiles/<uuid:patient_id>/insurance-profiles/",
        v.InsuranceListView.as_view(),
        name="patient-insurance",
    ),
    path(
        "profiles/<uuid:patient_id>/health-profile/",
        v.HealthProfileView.as_view(),
        name="patient-health-profile",
    ),
    path(
        "profiles/<uuid:patient_id>/access-history/",
        v.AccessHistoryView.as_view(),
        name="patient-access-history",
    ),
    path(
        "profiles/<uuid:patient_id>/<str:kind>/<uuid:item_id>/entered-in-error/",
        v.HealthItemErrorView.as_view(),
        name="patient-health-item-error",
    ),
    path(
        "profiles/<uuid:patient_id>/<str:kind>/",
        v.HealthItemCreateView.as_view(),
        name="patient-health-item",
    ),
    path("dependents/", v.DependentCreateView.as_view(), name="patient-dependents"),
    path("delegations/", v.DelegationListView.as_view(), name="patient-delegations"),
    path(
        "delegations/accept/", v.DelegationAcceptView.as_view(), name="patient-delegations-accept"
    ),
    path(
        "delegations/<uuid:object_id>/revoke/",
        v.DelegationRevokeView.as_view(),
        name="patient-delegations-revoke",
    ),
    path(
        "insurance-profiles/<uuid:profile_id>/",
        v.InsuranceDetailView.as_view(),
        name="patient-insurance-detail",
    ),
    path(
        "insurance-profiles/<uuid:profile_id>/deactivate/",
        v.InsuranceDeactivateView.as_view(),
        name="patient-insurance-deactivate",
    ),
    path(
        "insurance-profiles/<uuid:profile_id>/card-images/",
        v.CardImageView.as_view(),
        name="patient-insurance-card",
    ),
    path(
        "insurance-profiles/<uuid:profile_id>/card-images/<str:side>/download-links/",
        v.CardDownloadLinkView.as_view(),
        name="patient-insurance-card-link",
    ),
    path("record-claims/", v.ClaimCreateView.as_view(), name="patient-claims"),
    path("record-claims/<uuid:claim_id>/", v.ClaimDetailView.as_view(), name="patient-claim"),
    path(
        "record-claims/<uuid:claim_id>/verify/",
        v.ClaimVerifyView.as_view(),
        name="patient-claim-verify",
    ),
    path("consents/", v.ConsentView.as_view(), name="patient-consents"),
]
