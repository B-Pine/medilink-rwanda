// Synthetic sample data for the screenshot harness (no real people).
import 'package:medilink/data/models.dart';

final sampleMe = Me.fromJson({
  'id': 'u1',
  'email': 'patient@demo.medilink.test',
  'full_name': 'Mukamana Jeanne',
  'preferred_language': 'rw',
  'profiles': [
    {'patient_id': 'p1', 'display_name': 'Mukamana Jeanne', 'relationship': 'self'},
    {'patient_id': 'p2', 'display_name': 'Iradukunda Eric', 'relationship': 'guardian'},
  ],
});

final sampleVisit = ActiveVisit.fromJson({
  'visit_id': 'v1',
  'patient_display_name': 'Mukamana Jeanne',
  'facility_name': 'Remera Health Centre',
  'service_name_i18n': {'en': 'General consultation', 'rw': 'Isuzuma rusange'},
  'ticket_number': 'A-024',
  'state': 'waiting',
  'stage': 'consultation',
  'ahead': 3,
  'estimate': {'min': 12, 'max': 20},
  'version': 1,
});

final sampleBookings = [
  Booking.fromJson({
    'id': 'b1',
    'booking_code': 'BK-7Q2M',
    'status': 'confirmed',
    'patient_display_name': 'Mukamana Jeanne',
    'facility_slug': 'kigali-demo-clinic',
    'facility_name': 'Kigali Demo Clinic',
    'service_name_i18n': {'en': 'Dental care', 'rw': 'Kuvura amenyo'},
    'starts_at': DateTime.now().add(const Duration(days: 2, hours: 1)).toUtc().toIso8601String(),
    'can_change': true,
    'version': 1,
  }),
  Booking.fromJson({
    'id': 'b2',
    'booking_code': 'BK-9F1A',
    'status': 'confirmed',
    'patient_display_name': 'Iradukunda Eric',
    'facility_slug': 'musanze-demo-health-centre',
    'facility_name': 'Musanze Demo Health Centre',
    'service_name_i18n': {'en': 'Child vaccination', 'rw': 'Inkingo z’abana'},
    'starts_at': DateTime.now().add(const Duration(days: 9)).toUtc().toIso8601String(),
    'can_change': true,
    'version': 1,
  }),
];

final sampleFacilities = [
  for (final (slug, name, type, er, km, waiting, lat, lng) in [
    ('remera-hc', 'Remera Health Centre', 'health_center', false, 0.8, 6, -1.9536, 30.1128),
    ('kibagabaga', 'Kibagabaga District Hospital', 'district_hospital', true, 2.4, 14, -1.9310, 30.1180),
    ('kigali-demo-clinic', 'Kigali Demo Clinic', 'private_clinic', false, 3.1, 2, -1.9500, 30.0588),
    ('chuk', 'CHUK Referral Hospital', 'referral_hospital', true, 4.6, 31, -1.9442, 30.0614),
    ('kacyiru-poly', 'Kacyiru Polyclinic', 'polyclinic', false, 5.2, null, -1.9380, 30.0890),
  ])
    FacilitySummary.fromJson({
      'slug': slug,
      'name': name,
      'type': type,
      'emergency_department': er,
      'district': 'Gasabo',
      'sector': 'Remera',
      'distance_km': km,
      'open_now': slug != 'kacyiru-poly',
      'waiting': waiting,
      'wait_range': waiting == null ? null : {'min': waiting * 2, 'max': waiting * 3},
      'lat': lat,
      'lng': lng,
    }),
];
