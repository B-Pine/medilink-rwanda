// Synthetic sample data for the screenshot harness (no real people).
import 'package:medilink/data/models.dart';
import 'package:medilink/data/profile.dart';

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
      'insurers': switch (type) {
        'private_clinic' => ['private_other', 'mmi'],
        'polyclinic' => <String>[],
        _ => ['mutuelle', 'rama', 'mmi', 'private_other'],
      },
    }),
];

final sampleFacility = Facility.fromJson({
  'slug': 'kibagabaga-hospital',
  'name': 'Kibagabaga Hospital',
  'type': 'district_hospital',
  'emergency_department': true,
  'address': 'KG 19 Ave, Kibagabaga',
  'phone': '+250788000000',
  'district': 'Gasabo',
  'sector': 'Kimironko',
  'open_now': true,
  'hours': [
    ['Mon–Fri', '07:00–17:00'],
    ['Sat', '08:00–12:00'],
  ],
  'services': [
    {'id': 's-gp', 'name_i18n': {'en': 'General consultation', 'rw': 'Isuzuma rusange'}, 'bookable': true, 'waiting': 4, 'insurers': ['mutuelle', 'rama', 'mmi']},
    {'id': 's-paed', 'name_i18n': {'en': 'Paediatrics', 'rw': "Ubuvuzi bw'abana"}, 'bookable': true, 'insurers': ['mutuelle', 'private_other']},
  ],
  'doctors': [
    {
      'membership_id': 'm-1',
      'name': 'Dr Aline Mukamana',
      'specialty': 'Paediatrician',
      'days': [0, 1, 3, 4],
      'service_ids': ['s-gp', 's-paed'],
      'bio_i18n': {
        'en': 'Cares for children from birth to 15, with a focus on asthma and nutrition.',
        'rw': "Avura abana kuva bavutse kugeza ku myaka 15, cyane cyane asima n'imirire.",
      },
      'languages': ['rw', 'en', 'fr'],
    },
    {'membership_id': 'm-2', 'name': 'Dr Eric Habimana', 'specialty': 'General practitioner', 'days': [2, 5], 'service_ids': ['s-gp']},
  ],
});

final sampleSlots = [
  for (var d = 1; d <= 5; d++)
    SlotDay(DateTime(2026, 11, 5 + d), [
      for (final (h, m) in [(8, 'm-1'), (9, 'm-2'), (10, 'm-1'), (11, 'm-1'), (14, 'm-2'), (15, 'm-1')])
        Slot.fromJson({
          'id': 'slot-$d-$h',
          'starts_at': DateTime(2026, 11, 5 + d, h).toIso8601String(),
          'doctor': m == 'm-1' ? 'Dr Aline Mukamana' : 'Dr Eric Habimana',
          'membership_id': m,
          'open_places': 1,
        }),
    ]),
];

final sampleSymptoms = [
  for (final (code, en, rw, red) in [
    ('chest_pain', 'Chest pain', 'Kubabara mu gatuza', true),
    ('fever', 'Fever', 'Umuriro', false),
    ('cough', 'Cough', 'Inkorora', false),
    ('headache', 'Headache', 'Kurwara umutwe', false),
    ('stomach_pain', 'Stomach pain', 'Kuribwa mu nda', false),
    ('rash', 'Rash', 'Uduheri', false),
    ('diarrhoea', 'Diarrhoea', 'Impiswi', false),
    ('vomiting', 'Vomiting', 'Kuruka', false),
    ('back_pain', 'Back pain', 'Kubabara umugongo', false),
    ('sore_throat', 'Sore throat', 'Kubabara mu muhogo', false),
    ('ear_pain', 'Ear pain', 'Kubabara ugutwi', false),
    ('tiredness', 'Tiredness', 'Umunaniro', false),
    ('eye_problem', 'Eye problem', "Ikibazo cy'amaso", false),
    ('joint_pain', 'Joint pain', 'Kubabara ingingo', false),
  ])
    Symptom.fromJson({'code': code, 'name_i18n': {'en': en, 'rw': rw}, 'body_system': 'general', 'is_red_flag': red}),
];

final sampleProfile = ProfileDetail.fromJson({
  'patient_id': 'p1',
  'relationship': 'self',
  'medilink_number': 'ML-4K7Q-92',
  'full_name': 'Mukamana Jeanne',
  'date_of_birth': '1994-03-12',
  'sex': 'female',
  'phone_e164': '+250788000111',
  'email': 'patient@demo.medilink.test',
  'address': 'Kimironko, Gasabo',
  'emergency_contact': null,
  'no_known_allergies': null,
  'has_care_consent': true,
  'completion': {
    'details': true,
    'identifier': true,
    'emergency_contact': false,
    'care_consent': true,
    'insurance': true,
    'allergies_reviewed': false,
  },
  'has_photo': false,
  'version': 3,
});

final sampleIdentifiers = [
  IdentityDocument.fromJson({'id': 'i1', 'kind': 'national_id', 'masked_value': '•••• •••• 4412', 'is_verified': true}),
];

final sampleInsurance = [
  InsuranceCard.fromJson({
    'id': 'c1',
    'insurer_code': 'mutuelle',
    'insurer_display': 'Mutuelle de Santé',
    'member_number': '1203/77/04',
    'is_principal': true,
    'valid_until': '2027-06-30',
    'is_expired': false,
    'status': 'verified',
    'is_active': true,
    'card_images': {'front': null, 'back': null},
  }),
];

final sampleHealth = HealthSummary.fromJson({
  'no_known_allergies': null,
  'allergies': [
    {'id': 'a1', 'substance_text': 'Penicillin', 'source': 'clinician', 'verification_status': 'verified'},
  ],
  'conditions': [
    {'id': 'h1', 'display': 'Asthma', 'source': 'patient', 'verification_status': 'unverified'},
  ],
  'medications': <Object>[],
});

final samplePrefs = NotificationPrefs.fromJson({
  'version': 2,
  'available_channels': ['in_app', 'web_push', 'email'],
  'channels': {
    'critical': ['in_app', 'web_push'],
    'important': ['in_app', 'email'],
    'routine': ['in_app'],
  },
  'quiet_hours': {'is_enabled': true, 'start': '21:30', 'end': '06:30'},
  'reminder_offsets_minutes': [120, 1440],
  'dependents': [
    {'patient_id': 'p2', 'display_name': 'Iradukunda Eric', 'relationship': 'guardian', 'receive_alerts': true},
  ],
  'is_critical_locked': false,
});

final sampleDelegations = Delegations.fromJson({
  'granted': [
    {'id': 'd1', 'patient_id': 'p1', 'profile_name': 'Mukamana Jeanne', 'holder_name': 'Habimana Eric', 'relationship': 'delegate', 'can_revoke': true},
  ],
  'received': <Object>[],
  'pending_invites': <Object>[],
});
