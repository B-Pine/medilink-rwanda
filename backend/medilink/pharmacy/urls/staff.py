"""/api/v1/staff/... pharmacy routes (contract sprint-07 §3.1)."""

from django.urls import path

from medilink.pharmacy import views as v

urlpatterns = [
    path(
        "consultations/<uuid:consultation_id>/prescription/",
        v.ConsultationPrescriptionView.as_view(),
        name="staff-consultation-prescription",
    ),
    path(
        "consultations/<uuid:consultation_id>/prescription/items/",
        v.PrescriptionItemsView.as_view(),
        name="staff-consultation-prescription-items",
    ),
    path(
        "prescription-items/<uuid:item_id>/",
        v.PrescriptionItemView.as_view(),
        name="staff-prescription-item",
    ),
    path(
        "prescription-items/<uuid:item_id>/cancel/",
        v.ItemCancelView.as_view(),
        name="staff-prescription-item-cancel",
    ),
    path(
        "prescriptions/<uuid:prescription_id>/",
        v.PrescriptionView.as_view(),
        name="staff-prescription",
    ),
    path(
        "prescriptions/<uuid:prescription_id>/cancel/",
        v.PrescriptionCancelView.as_view(),
        name="staff-prescription-cancel",
    ),
    path(
        "prescriptions/<uuid:prescription_id>/dispense/",
        v.DispenseView.as_view(),
        name="staff-prescription-dispense",
    ),
    path(
        "prescriptions/<uuid:prescription_id>/labels/",
        v.LabelsView.as_view(),
        name="staff-prescription-labels",
    ),
    path(
        "prescriptions/<uuid:prescription_id>/queries/",
        v.QueriesView.as_view(),
        name="staff-prescription-queries",
    ),
    path(
        "prescription-queries/<uuid:query_id>/answer/",
        v.QueryAnswerView.as_view(),
        name="staff-prescription-query-answer",
    ),
    path(
        "prescription-queries/<uuid:query_id>/close/",
        v.QueryCloseView.as_view(),
        name="staff-prescription-query-close",
    ),
    path("pharmacy/queue/", v.QueueView.as_view(), name="staff-pharmacy-queue"),
    path("pharmacy/my-day/", v.PharmacyDayView.as_view(), name="staff-pharmacy-my-day"),
    path("pharmacy/history/", v.DispenseHistoryView.as_view(), name="staff-pharmacy-history"),
    path(
        "pharmacy/availability/",
        v.AvailabilityListView.as_view(),
        name="staff-pharmacy-availability",
    ),
    path(
        "pharmacy/availability/<str:drug_code>/",
        v.AvailabilityView.as_view(),
        name="staff-pharmacy-availability-set",
    ),
    path("drugs/", v.DrugSearchView.as_view(), name="staff-drug-search"),
    # W5 stock (upgrade 13 §3)
    path("pharmacy/stock/", v.StockListView.as_view(), name="staff-pharmacy-stock"),
    path(
        "pharmacy/stock/receive/",
        v.StockReceiveView.as_view(),
        name="staff-pharmacy-stock-receive",
    ),
    path(
        "pharmacy/stock/expiring/",
        v.StockExpiringView.as_view(),
        name="staff-pharmacy-stock-expiring",
    ),
    path(
        "pharmacy/stock/movements/",
        v.StockMovementsView.as_view(),
        name="staff-pharmacy-stock-movements",
    ),
    path(
        "pharmacy/stock/batches/<uuid:batch_id>/adjust/",
        v.StockAdjustView.as_view(),
        name="staff-pharmacy-stock-adjust",
    ),
    path(
        "pharmacy/stock/<str:drug_code>/",
        v.StockDetailView.as_view(),
        name="staff-pharmacy-stock-detail",
    ),
]
