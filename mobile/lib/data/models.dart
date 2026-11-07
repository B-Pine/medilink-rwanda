/// API shapes the app reads (OpenAPI schema, /api/v1/schema/). Unknown fields are ignored.
library;

typedef Json = Map<String, dynamic>;

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
Json _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const {};
List<Json> _list(Object? v) => v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : const [];
List<String> _strings(Object? v) => v is List ? v.map((e) => e.toString()).toList() : const [];

/// Lists come either bare or paginated as {results: [...]}.
List<Json> resultsOf(Object? data) => data is Map ? _list(data['results']) : _list(data);

class Profile {
  Profile(this.patientId, this.displayName, this.relationship);
  factory Profile.fromJson(Json j) =>
      Profile(j['patient_id'] as String, j['display_name'] as String? ?? '', j['relationship'] as String? ?? 'self');
  final String patientId, displayName, relationship;
}

class Me {
  Me({required this.id, required this.email, required this.fullName, required this.language, required this.profiles});
  factory Me.fromJson(Json j) => Me(
        id: j['id'] as String,
        email: j['email'] as String? ?? '',
        fullName: j['full_name'] as String? ?? '',
        language: j['preferred_language'] as String? ?? 'rw',
        profiles: _list(j['profiles']).map(Profile.fromJson).toList(),
      );
  final String id, email, fullName, language;
  final List<Profile> profiles;

  String get firstName => fullName.trim().split(RegExp(r'\s+')).last;
  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.first[0] + (parts.length > 1 ? parts.last[0] : '')).toUpperCase();
  }
}

class Estimate {
  Estimate(this.min, this.max);
  factory Estimate.fromJson(Json j) => Estimate(j['min'] as int?, j['max'] as int?);
  final int? min, max;
}

class ActiveVisit {
  ActiveVisit.fromJson(Json j)
      : id = j['visit_id'] as String,
        patientName = j['patient_display_name'] as String? ?? '',
        facilityName = j['facility_name'] as String? ?? '',
        service = _map(j['service_name_i18n']),
        ticket = j['ticket_number'] as String? ?? '',
        state = j['state'] as String? ?? 'waiting',
        stage = j['stage'] as String? ?? '',
        servicePoint = j['service_point'] as String?,
        ahead = j['ahead'] as int? ?? 0,
        estimate = Estimate.fromJson(_map(j['estimate'])),
        version = j['version'] as int? ?? 0,
        raw = j;
  final String id, patientName, facilityName, ticket, state, stage;
  final Json service;
  final String? servicePoint;
  final int ahead, version;
  final Estimate estimate;
  final Json raw;

  bool get isCalled => state == 'called';
}

class Booking {
  Booking.fromJson(Json j)
      : id = j['id'] as String,
        code = j['booking_code'] as String? ?? '',
        status = j['status'] as String? ?? 'confirmed',
        patientName = j['patient_display_name'] as String? ?? '',
        facilitySlug = j['facility_slug'] as String? ?? '',
        facilityName = j['facility_name'] as String? ?? '',
        service = _map(j['service_name_i18n']),
        doctor = j['doctor'] as String?,
        startsAt = _date(j['starts_at']) ?? DateTime.now(),
        endsAt = _date(j['ends_at']),
        canChange = j['can_change'] as bool? ?? false,
        version = j['version'] as int? ?? 0,
        raw = j;
  final String id, code, status, patientName, facilitySlug, facilityName;
  final Json service;
  final String? doctor;
  final DateTime startsAt;
  final DateTime? endsAt;
  final bool canChange;
  final int version;
  final Json raw;
}

class FacilitySummary {
  FacilitySummary.fromJson(Json j)
      : slug = j['slug'] as String,
        name = j['name'] as String? ?? '',
        type = j['type'] as String? ?? '',
        emergency = j['emergency_department'] as bool? ?? false,
        district = j['district'] as String? ?? '',
        sector = j['sector'] as String? ?? '',
        distanceKm = (j['distance_km'] as num?)?.toDouble(),
        openNow = j['open_now'] as bool? ?? false,
        waiting = j['waiting'] as int?,
        waitRange = j['wait_range'] == null ? null : Estimate.fromJson(_map(j['wait_range'])),
        queueLoad = j['queue_load'] as String?,
        nextSlotAt = _date(j['next_slot_at']),
        lat = (j['lat'] as num?)?.toDouble(),
        lng = (j['lng'] as num?)?.toDouble(),
        insurers = _strings(j['insurers']).where((c) => c.isNotEmpty).toList();
  final String slug, name, type, district, sector;
  final bool emergency, openNow;
  final double? distanceKm, lat, lng;
  final int? waiting;
  final Estimate? waitRange;
  final String? queueLoad;
  final DateTime? nextSlotAt;

  /// Insurer codes accepted here (contract PT §2.1); no prices or shares (U-01).
  final List<String> insurers;

  String get place => [sector, district].where((s) => s.isNotEmpty).join(', ');
}

class FacilityService {
  FacilityService.fromJson(Json j)
      : id = j['id'] as String,
        name = _map(j['name_i18n']),
        bookable = j['bookable'] as bool? ?? false,
        waiting = j['waiting'] as int?,
        nextSlotAt = _date(j['next_slot_at']),
        insurers = _strings(j['insurers']).where((c) => c.isNotEmpty).toList();
  final String id;
  final Json name;
  final bool bookable;
  final int? waiting;
  final DateTime? nextSlotAt;
  final List<String> insurers;
}

class Doctor {
  Doctor.fromJson(Json j)
      : id = j['membership_id'] as String,
        name = j['name'] as String? ?? '',
        specialty = j['specialty'] as String? ?? '',
        days = (j['days'] as List? ?? const []).whereType<int>().toList()..sort(),
        serviceIds = _strings(j['service_ids']),
        bio = _map(j['bio_i18n']),
        languages = _strings(j['languages']);
  final String id, name, specialty;

  /// Weekdays they work here, 0 = Monday.
  final List<int> days;
  final List<String> serviceIds, languages;

  /// Written by the doctor, shown only when they made it public (upgrade 05 §3).
  final Json bio;

  String get initials =>
      name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2).map((p) => p[0].toUpperCase()).join();
}

class Facility {
  Facility.fromJson(Json j)
      : slug = j['slug'] as String,
        name = j['name'] as String? ?? '',
        type = j['type'] as String? ?? '',
        emergency = j['emergency_department'] as bool? ?? false,
        description = _map(j['description_i18n']),
        address = j['address'] as String? ?? '',
        phone = j['phone'] as String? ?? '',
        district = j['district'] as String? ?? '',
        sector = j['sector'] as String? ?? '',
        lat = (j['lat'] as num?)?.toDouble(),
        lng = (j['lng'] as num?)?.toDouble(),
        openNow = j['open_now'] as bool? ?? false,
        hours = (j['hours'] as List? ?? const []).map((row) => _strings(row)).toList(),
        services = _list(j['services']).map(FacilityService.fromJson).toList(),
        doctors = _list(j['doctors']).map(Doctor.fromJson).toList();
  final String slug, name, type, address, phone, district, sector;
  final bool emergency, openNow;
  final Json description;
  final double? lat, lng;
  final List<List<String>> hours;
  final List<FacilityService> services;
  final List<Doctor> doctors;

  String get place => [sector, district].where((s) => s.isNotEmpty).join(', ');

  /// Every insurer accepted for at least one service, in first-seen order.
  List<String> get insurers => {for (final x in services) ...x.insurers}.toList();
}

class Slot {
  Slot.fromJson(Json j)
      : id = j['id'] as String,
        startsAt = _date(j['starts_at']) ?? DateTime.now(),
        doctor = j['doctor'] as String?,
        membershipId = j['membership_id'] as String?,
        openPlaces = j['open_places'] as int? ?? 0;
  final String id;
  final DateTime startsAt;
  final String? doctor, membershipId;
  final int openPlaces;
}

class SlotDay {
  SlotDay(this.date, this.slots);
  SlotDay.fromJson(Json j)
      : date = DateTime.parse(j['date'] as String),
        slots = _list(j['slots']).map(Slot.fromJson).toList();
  final DateTime date;
  final List<Slot> slots;
}

class Prescription {
  Prescription.fromJson(Json j)
      : id = j['id'] as String,
        number = j['number'] as String? ?? '',
        facilityName = j['facility_name'] as String? ?? '',
        prescriber = j['prescriber_name'] as String? ?? '',
        status = j['status'] as String? ?? '',
        issuedAt = _date(j['issued_at']),
        itemCount = j['item_count'] as int? ?? 0;
  final String id, number, facilityName, prescriber, status;
  final DateTime? issuedAt;
  final int itemCount;
}

class Diagnosis {
  Diagnosis.fromJson(Json j)
      : text = (j['plain_language'] as String?)?.isNotEmpty == true
            ? j['plain_language'] as String
            : j['display'] as String? ?? '';
  final String text;
}

class ConsultationRecord {
  ConsultationRecord.fromJson(Json j)
      : id = j['id'] as String,
        facilityName = j['facility_name'] as String? ?? '',
        date = _date(j['service_date']),
        doctor = j['doctor_name'] as String? ?? '',
        diagnoses = _list(j['diagnoses']).map(Diagnosis.fromJson).toList();
  final String id, facilityName, doctor;
  final DateTime? date;
  final List<Diagnosis> diagnoses;
}

class MedicalDocument {
  MedicalDocument.fromJson(Json j)
      : id = j['id'] as String,
        kind = j['kind'] as String? ?? '',
        number = j['number'] as String? ?? '',
        date = _date(j['document_date']),
        facilityName = j['facility_name'] as String? ?? '',
        author = j['author_name'] as String? ?? '',
        status = j['status'] as String? ?? '';
  final String id, kind, number, facilityName, author, status;
  final DateTime? date;
}

class LabResult {
  LabResult.fromJson(Json j)
      : id = j['id'] as String,
        testName = j['test_name'] as String? ?? '',
        facilityName = j['facility_name'] as String? ?? '',
        releasedAt = _date(j['released_at']),
        abnormal = j['is_abnormal'] as bool? ?? false;
  final String id, testName, facilityName;
  final DateTime? releasedAt;
  final bool abnormal;
}

/// A symptom from the public catalogue (`/api/v1/public/symptoms/`).
class Symptom {
  Symptom.fromJson(Json j)
      : code = j['code'] as String,
        name = (j['name_i18n'] as Map?)?.cast<String, dynamic>() ?? const {},
        group = j['body_system'] as String? ?? '',
        redFlag = j['is_red_flag'] as bool? ?? false;
  final String code, group;
  final Json name;
  final bool redFlag;
}
