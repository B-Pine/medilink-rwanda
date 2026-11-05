import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'models.dart';
import 'location.dart';
import 'session.dart';

/// A result and whether it came from the phone's saved copy (no connection).
class Cached<T> {
  const Cached(this.data, {this.offline = false});
  final T data;
  final bool offline;
}

/// Fetches, keeps an encrypted copy, and falls back to that copy when offline (upgrade 15 §4).
Future<Cached<T>> _cached<T>(
  Ref ref,
  String name,
  Future<Object?> Function(Api api) fetch,
  T Function(Object? data) parse,
) async {
  final store = ref.read(secureStoreProvider);
  try {
    final data = await fetch(ref.read(apiProvider));
    await store.writeCache(name, data);
    return Cached(parse(data));
  } on ApiException catch (e) {
    if (e.kind == ApiFailure.offline || e.kind == ApiFailure.slow) {
      final saved = await store.readCache(name);
      if (saved != null) return Cached(parse(saved), offline: true);
    }
    rethrow;
  }
}

final meProvider = FutureProvider<Me>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/auth/me/');
  return Me.fromJson(data! as Json);
});

/// The family member the patient is acting for; null = everyone they manage.
final activePatientProvider = NotifierProvider<ActivePatient, String?>(ActivePatient.new);

class ActivePatient extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String? patientId) => state = patientId;
}

final activeVisitsProvider = FutureProvider<Cached<List<ActiveVisit>>>(
  (ref) => _cached(
    ref,
    'visits.active',
    (api) => api.get('/api/v1/patient/visits/active/'),
    (data) => resultsOf(data).map(ActiveVisit.fromJson).toList(),
  ),
);

/// `upcoming` or `past`.
final bookingsProvider = FutureProvider.family<Cached<List<Booking>>, String>(
  (ref, when) => _cached(
    ref,
    'bookings.$when',
    (api) => api.get('/api/v1/patient/bookings/', query: {'when': when}),
    (data) {
      final list = resultsOf(data).map(Booking.fromJson).toList()
        ..sort((a, b) => when == 'past' ? b.startsAt.compareTo(a.startsAt) : a.startsAt.compareTo(b.startsAt));
      return list;
    },
  ),
);

final unreadProvider = FutureProvider<int>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/notifications/unread-count/');
  return (data is Map ? data['unread'] as int? : null) ?? 0;
});

class SearchQuery {
  const SearchQuery({
    this.openNow = false,
    this.emergency = false,
    this.availableToday = false,
    this.lat,
    this.lng,
    this.serviceCode,
  });
  final bool openNow, emergency, availableToday;

  /// The phone's position, rounded to about 1 km before it leaves the phone.
  final double? lat, lng;

  /// Only facilities offering this service (e.g. the symptom assistant's suggestion).
  final String? serviceCode;

  SearchQuery copyWith({
    bool? openNow,
    bool? emergency,
    bool? availableToday,
    double? lat,
    double? lng,
    String? serviceCode,
  }) =>
      SearchQuery(
        openNow: openNow ?? this.openNow,
        emergency: emergency ?? this.emergency,
        availableToday: availableToday ?? this.availableToday,
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
        serviceCode: serviceCode ?? this.serviceCode,
      );

  Json toJson() => {
        if (openNow) 'open_now': true,
        if (emergency) 'emergency': true,
        if (availableToday) 'available_today': true,
        if (lat != null && lng != null) 'near': {'lat': lat, 'lng': lng},
        if (serviceCode != null && serviceCode!.isNotEmpty) 'service_code': serviceCode,
      };

  @override
  bool operator ==(Object other) =>
      other is SearchQuery &&
      other.openNow == openNow &&
      other.emergency == emergency &&
      other.availableToday == availableToday &&
      other.lat == lat &&
      other.lng == lng &&
      other.serviceCode == serviceCode;

  @override
  int get hashCode => Object.hash(openNow, emergency, availableToday, lat, lng, serviceCode);
}

/// Facilities sorted by distance when the phone's location is known (Home "Near you", Care).
final nearbyQueryProvider = Provider<SearchQuery>((ref) {
  final here = ref.watch(locationProvider).point;
  return SearchQuery(lat: here?.latitude, lng: here?.longitude);
});

final facilitySearchProvider = FutureProvider.family<List<FacilitySummary>, SearchQuery>((ref, query) async {
  final data = await ref.read(apiProvider).post('/api/v1/public/facilities/search/', query.toJson());
  return resultsOf(data).map(FacilitySummary.fromJson).toList();
});

final facilityProvider = FutureProvider.family<Facility, String>((ref, slug) async {
  final data = await ref.read(apiProvider).get('/api/v1/public/facilities/$slug/');
  return Facility.fromJson(data! as Json);
});

typedef SlotQuery = ({String slug, String serviceId});

final slotsProvider = FutureProvider.autoDispose.family<List<SlotDay>, SlotQuery>((ref, q) async {
  final data = await ref
      .read(apiProvider)
      .get('/api/v1/public/facilities/${q.slug}/slots/', query: {'service_id': q.serviceId});
  final days = data is Map ? data['days'] : null;
  return resultsOf(days).map(SlotDay.fromJson).where((d) => d.slots.isNotEmpty).toList();
});

final prescriptionsProvider = FutureProvider<Cached<List<Prescription>>>(
  (ref) => _cached(
    ref,
    'prescriptions',
    (api) => api.get('/api/v1/patient/prescriptions/', query: {'patient_id': ref.watch(activePatientProvider)}),
    (data) => resultsOf(data).map(Prescription.fromJson).toList(),
  ),
);

final recordsProvider = FutureProvider<List<ConsultationRecord>>((ref) async {
  final data = await ref
      .read(apiProvider)
      .get('/api/v1/patient/records/', query: {'patient_id': ref.watch(activePatientProvider)});
  return resultsOf(data).map(ConsultationRecord.fromJson).toList();
});

final documentsProvider = FutureProvider<List<MedicalDocument>>((ref) async {
  final data = await ref
      .read(apiProvider)
      .get('/api/v1/patient/documents/', query: {'patient_id': ref.watch(activePatientProvider)});
  return resultsOf(data).map(MedicalDocument.fromJson).toList();
});

final resultsProvider = FutureProvider<List<LabResult>>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/patient/results/');
  return resultsOf(data).map(LabResult.fromJson).toList();
});

/// The symptom catalogue, red flags first. Booking needs 1–5 of these.
final symptomsProvider = FutureProvider<List<Symptom>>((ref) async {
  final data = await ref.read(apiProvider).get('/api/v1/public/symptoms/');
  return resultsOf(data).map(Symptom.fromJson).toList()
    ..sort((a, b) => (b.redFlag ? 1 : 0).compareTo(a.redFlag ? 1 : 0));
});

/// Drops every patient-specific result; called after each sign-in so no earlier account shows.
void invalidatePatientData(WidgetRef ref) {
  ref
    ..invalidate(meProvider)
    ..invalidate(activePatientProvider)
    ..invalidate(activeVisitsProvider)
    ..invalidate(bookingsProvider)
    ..invalidate(unreadProvider)
    ..invalidate(prescriptionsProvider)
    ..invalidate(recordsProvider)
    ..invalidate(documentsProvider)
    ..invalidate(resultsProvider);
}
