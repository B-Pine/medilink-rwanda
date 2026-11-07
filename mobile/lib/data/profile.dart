/// A patient's own profile (contract §3.2 PA1–PA26), as the website's dashboard shows it:
/// details, photo, identity documents, insurance cards, health profile, notification settings.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'models.dart';
import 'session.dart';

DateTime? _day(Object? v) => v is String ? DateTime.tryParse(v) : null;
Json _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const {};
List<Json> _list(Object? v) => v is List ? v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList() : const [];
List<String> _strings(Object? v) => v is List ? v.map((e) => '$e').toList() : const [];

/// `YYYY-MM-DD` for the API.
String apiDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

class ProfileDetail {
  ProfileDetail.fromJson(Json j)
      : patientId = j['patient_id'] as String,
        relationship = j['relationship'] as String? ?? 'self',
        medilinkNumber = j['medilink_number'] as String?,
        fullName = j['full_name'] as String? ?? '',
        preferredName = j['preferred_name'] as String?,
        dateOfBirth = _day(j['date_of_birth']),
        birthEstimated = j['is_birth_date_estimated'] as bool? ?? false,
        sex = j['sex'] as String?,
        phone = j['phone_e164'] as String?,
        email = j['email'] as String?,
        address = j['address'] as String?,
        emergency = j['emergency_contact'] == null ? null : _map(j['emergency_contact']),
        noKnownAllergies = j['no_known_allergies'] as bool?,
        hasCareConsent = j['has_care_consent'] as bool? ?? false,
        completion = _map(j['completion']).map((k, v) => MapEntry(k, v == true)),
        hasPhoto = j['has_photo'] as bool? ?? false,
        version = j['version'] as int? ?? 1;

  final String patientId, relationship, fullName;
  final String? medilinkNumber, preferredName, sex, phone, email, address;
  final DateTime? dateOfBirth;
  final bool birthEstimated, hasCareConsent, hasPhoto;
  final Json? emergency;
  final bool? noKnownAllergies;
  final Map<String, bool> completion;
  final int version;

  int get done => completion.values.where((v) => v).length;
  int get percent => completion.isEmpty ? 0 : (done * 100 / completion.length).round();
  bool get isSelf => relationship == 'self';
}

class IdentityDocument {
  IdentityDocument.fromJson(Json j)
      : id = j['id'] as String,
        kind = j['kind'] as String? ?? '',
        masked = j['masked_value'] as String? ?? '',
        verified = j['is_verified'] as bool? ?? false;
  final String id, kind, masked;
  final bool verified;
}

class InsuranceCard {
  InsuranceCard.fromJson(Json j)
      : id = j['id'] as String,
        insurerCode = j['insurer_code'] as String? ?? '',
        insurerName = j['insurer_display'] as String? ?? '',
        memberNumber = j['member_number'] as String? ?? '',
        isPrincipal = j['is_principal'] as bool? ?? true,
        principalName = j['principal_name'] as String?,
        validUntil = _day(j['valid_until']),
        isExpired = j['is_expired'] as bool? ?? false,
        status = j['status'] as String? ?? 'unverified',
        isActive = j['is_active'] as bool? ?? true,
        hasFront = _map(j['card_images'])['front'] != null,
        hasBack = _map(j['card_images'])['back'] != null;
  final String id, insurerCode, insurerName, memberNumber, status;
  final bool isPrincipal, isExpired, isActive, hasFront, hasBack;
  final String? principalName;
  final DateTime? validUntil;
}

class HealthEntry {
  HealthEntry.fromJson(Json j)
      : id = j['id'] as String,
        label = (j['substance_text'] ?? j['display'] ?? j['drug_display'] ?? '') as String,
        fromClinician = j['source'] == 'clinician',
        verification = j['verification_status'] as String? ?? 'unverified';
  final String id, label, verification;
  final bool fromClinician;
}

class HealthSummary {
  HealthSummary.fromJson(Json j)
      : noKnownAllergies = j['no_known_allergies'] as bool?,
        allergies = _list(j['allergies']).map(HealthEntry.fromJson).toList(),
        conditions = _list(j['conditions']).map(HealthEntry.fromJson).toList(),
        medications = _list(j['medications']).map(HealthEntry.fromJson).toList();
  final bool? noKnownAllergies;
  final List<HealthEntry> allergies, conditions, medications;

  List<HealthEntry> of(String kind) => switch (kind) {
        'allergies' => allergies,
        'conditions' => conditions,
        _ => medications,
      };
}

class NotificationPrefs {
  NotificationPrefs.fromJson(Json j)
      : version = j['version'] as int? ?? 0,
        available = _strings(j['available_channels']),
        channels = _map(j['channels']).map((k, v) => MapEntry(k, _strings(v))),
        quietOn = _map(j['quiet_hours'])['is_enabled'] as bool? ?? false,
        quietStart = _map(j['quiet_hours'])['start'] as String? ?? '21:00',
        quietEnd = _map(j['quiet_hours'])['end'] as String? ?? '07:00',
        reminders = (j['reminder_offsets_minutes'] as List? ?? const []).whereType<int>().toList(),
        dependents = _list(j['dependents']),
        criticalLocked = j['is_critical_locked'] as bool? ?? false;
  final int version;
  final List<String> available;
  final Map<String, List<String>> channels;
  final bool quietOn, criticalLocked;
  final String quietStart, quietEnd;
  final List<int> reminders;
  final List<Json> dependents;
}

class Delegations {
  Delegations.fromJson(Json j)
      : granted = _list(j['granted']),
        received = _list(j['received']),
        pending = _list(j['pending_invites']);
  final List<Json> granted, received, pending;
}

String _p(String id) => '/api/v1/patient/profiles/$id/';

final profileDetailProvider = FutureProvider.autoDispose.family<ProfileDetail, String>((ref, id) async {
  return ProfileDetail.fromJson(await ref.read(apiProvider).get(_p(id)) as Json);
});

final identifiersProvider = FutureProvider.autoDispose.family<List<IdentityDocument>, String>((ref, id) async {
  return resultsOf(await ref.read(apiProvider).get('${_p(id)}identifiers/')).map(IdentityDocument.fromJson).toList();
});

final insuranceProvider = FutureProvider.autoDispose.family<List<InsuranceCard>, String>((ref, id) async {
  final data = await ref.read(apiProvider).get('${_p(id)}insurance-profiles/');
  return resultsOf(data).map(InsuranceCard.fromJson).where((c) => c.isActive).toList();
});

final healthProvider = FutureProvider.autoDispose.family<HealthSummary, String>((ref, id) async {
  return HealthSummary.fromJson(await ref.read(apiProvider).get('${_p(id)}health-profile/') as Json);
});

/// A 5-minute link to the profile photo, or null (none yet, or still being scanned).
final photoUrlProvider = FutureProvider.autoDispose.family<String?, String>((ref, id) async {
  try {
    final data = await ref.read(apiProvider).post('${_p(id)}photo/download-links/');
    return data is Map ? data['url'] as String? : null;
  } on Exception {
    return null;
  }
});

final notificationPrefsProvider = FutureProvider.autoDispose<NotificationPrefs>((ref) async {
  return NotificationPrefs.fromJson(
    await ref.read(apiProvider).get('/api/v1/patient/notification-preferences/') as Json,
  );
});

final delegationsProvider = FutureProvider.autoDispose<Delegations>((ref) async {
  return Delegations.fromJson(await ref.read(apiProvider).get('/api/v1/patient/delegations/') as Json);
});

/// After any change to a profile: its detail, completion and lists.
void refreshProfile(WidgetRef ref, String id) {
  ref
    ..invalidate(profileDetailProvider(id))
    ..invalidate(identifiersProvider(id))
    ..invalidate(insuranceProvider(id))
    ..invalidate(healthProvider(id))
    ..invalidate(photoUrlProvider(id));
}
