// Renders app screens with sample data to PNG files, to review the design without a phone.
// Not part of CI (outside test/). Run:  flutter test test_screens --dart-define=SHOTS=<folder>
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:go_router/go_router.dart';
import 'package:medilink/app/strings.dart';
import 'package:medilink/app/theme.dart';
import 'package:latlong2/latlong.dart';
import 'package:medilink/data/location.dart';
import 'package:medilink/data/models.dart';
import 'package:medilink/data/providers.dart';
import 'package:medilink/screens/care/book_screen.dart';
import 'package:medilink/screens/care/care_screen.dart';
import 'package:medilink/screens/care/doctor_screen.dart';
import 'package:medilink/screens/care/facility_screen.dart';
import 'package:medilink/screens/care/map_screen.dart';
import 'package:medilink/screens/home/home_screen.dart';
import 'package:medilink/data/profile.dart';
import 'package:medilink/screens/me/claim_screen.dart';
import 'package:medilink/screens/me/family_screen.dart';
import 'package:medilink/screens/me/me_screen.dart';
import 'package:medilink/screens/me/settings_screen.dart';
import 'package:medilink/screens/me/notification_settings_screen.dart';
import 'package:medilink/screens/me/profile_screen.dart';
import 'package:medilink/screens/me/health_details.dart';
import 'package:medilink/screens/me/money_disputes.dart';

import 'sample.dart';

const _out = String.fromEnvironment('SHOTS');

class _Here extends LocationController {
  _Here(this.point);
  final LatLng? point;
  @override
  Located build() => Located(point: point);
}

Future<void> _loadFonts() async {
  const families = {
    'Inter': ['Inter-400', 'Inter-500', 'Inter-600', 'Inter-700'],
    'Figtree': ['Figtree-500', 'Figtree-600', 'Figtree-700', 'Figtree-800'],
    'PhosphorRegular': ['Phosphor-Regular'],
    'PhosphorFill': ['Phosphor-Fill'],
    'PhosphorBold': ['Phosphor-Bold'],
  };
  for (final entry in families.entries) {
    final loader = FontLoader(entry.key);
    for (final file in entry.value) {
      loader.addFont(rootBundle.load('assets/fonts/$file.ttf'));
    }
    await loader.load();
  }
}

Future<void> _shoot(
  WidgetTester tester,
  String name,
  Widget screen,
  List<dynamic> overrides, {
  String lang = 'rw',
  double textScale = 1,
  bool dark = false,
  Future<void> Function(WidgetTester)? act,
}) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  // flutter_test paints shadows without blur (a solid strip); show them as a phone does.
  debugDisableShadows = false;
  Palette.dark = dark;
  final key = GlobalKey();
  final router = GoRouter(
    initialLocation: '/x',
    routes: [GoRoute(path: '/x', builder: (_, _) => screen)],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [...overrides],
      retry: (_, _) => null,
      child: RepaintBoundary(
        key: key,
        child: MaterialApp.router(
          theme: buildTheme(),
          debugShowCheckedModeBanner: false,
          routerConfig: router,
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              padding: const EdgeInsets.only(top: 32),
              disableAnimations: true,
              textScaler: TextScaler.linear(textScale),
              platformBrightness: dark ? Brightness.dark : Brightness.light,
            ),
            child: S(strings: Strings.forCode(lang), child: child!),
          ),
        ),
      ),
    ),
  );
  for (var i = 0; i < 8; i++) {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
    await tester.pump(const Duration(milliseconds: 400));
  }
  if (act != null) await act(tester);
  await tester.runAsync(() async {
    final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await File('$_out/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
  });
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 1));
  debugDisableShadows = true;
  Palette.dark = false;
}

/// Lets in-flight animations (a button's colour, a sheet) finish before the picture.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    // flutter_map's tile cache asks path_provider for a folder; there is no plugin in tests.
    final cache = Directory.systemTemp.createTempSync('medilink-shots');
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(const MethodChannel('plugins.flutter.io/path_provider'), (_) async => cache.path);
    // Settings reads the phone's saved choices and fingerprint support; nothing is saved here.
    // ignore: invalid_use_of_visible_for_testing_member (this folder is a test, outside test/)
    SharedPreferences.setMockInitialValues({});
    for (final channel in ['plugins.it_nomads.com/flutter_secure_storage', 'plugins.flutter.io/local_auth_android', 'rw.medilink/secure']) {
      messenger.setMockMethodCallHandler(MethodChannel(channel), (_) async => null);
    }
    await _loadFonts();
  });

  final base = [
    meProvider.overrideWith((ref) async => sampleMe),
    unreadProvider.overrideWith((ref) async => 3),
    facilitySearchProvider.overrideWith((ref, q) async => sampleFacilities),
    locationProvider.overrideWith(() => _Here(const LatLng(-1.95, 30.09))),
  ];
  final noLocation = [
    meProvider.overrideWith((ref) async => sampleMe),
    unreadProvider.overrideWith((ref) async => 0),
    facilitySearchProvider.overrideWith((ref, q) async => sampleFacilities),
    locationProvider.overrideWith(() => _Here(null)),
  ];

  testWidgets('home with a ticket', (tester) async {
    await _shoot(tester, 'home-ticket', const HomeScreen(), [
      ...base,
      activeVisitsProvider.overrideWith((ref) async => Cached([sampleVisit])),
      bookingsProvider.overrideWith((ref, when) async => Cached(sampleBookings)),
    ]);
  }, skip: _out.isEmpty);

  testWidgets('home, next visit', (tester) async {
    await _shoot(tester, 'home-next', const HomeScreen(), [
      ...base,
      activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[])),
      bookingsProvider.overrideWith((ref, when) async => Cached(sampleBookings)),
    ], lang: 'en');
  }, skip: _out.isEmpty);

  testWidgets('home, nothing planned, no location', (tester) async {
    await _shoot(tester, 'home-empty', const HomeScreen(), [
      ...noLocation,
      activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[])),
      bookingsProvider.overrideWith((ref, when) async => const Cached(<Booking>[])),
    ]);
  }, skip: _out.isEmpty);

  testWidgets('map', (tester) async {
    await _shoot(tester, 'map', const MapScreen(), base);
  }, skip: _out.isEmpty);

  testWidgets('home, nothing planned (scrolled)', (tester) async {
    await _shoot(
      tester,
      'home-empty-scrolled',
      const HomeScreen(),
      [
        ...base,
        activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[])),
        bookingsProvider.overrideWith((ref, when) async => const Cached(<Booking>[])),
      ],
      act: (tester) async {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -620));
        await tester.pump(const Duration(milliseconds: 500));
      },
    );
  }, skip: _out.isEmpty);

  testWidgets('care', (tester) async {
    await _shoot(tester, 'care', const CareScreen(), [...base, activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[]))]);
  }, skip: _out.isEmpty);

  final facility = [
    ...base,
    facilityProvider.overrideWith((ref, slug) async => sampleFacility),
    slotsProvider.overrideWith((ref, q) async => sampleSlots),
    symptomsProvider.overrideWith((ref) async => sampleSymptoms),
  ];

  for (final lang in ['rw', 'en']) {
    testWidgets('doctor ($lang)', (tester) async {
      await _shoot(tester, 'doctor-$lang', const DoctorScreen(slug: 'kibagabaga-hospital', doctorId: 'm-1'), facility,
          lang: lang);
    }, skip: _out.isEmpty);
  }

  testWidgets('doctor (scrolled)', (tester) async {
    await _shoot(
      tester,
      'doctor-scrolled',
      const DoctorScreen(slug: 'kibagabaga-hospital', doctorId: 'm-1'),
      facility,
      lang: 'en',
      act: (tester) async {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -500));
        await tester.pump(const Duration(milliseconds: 500));
        await tester.pump(const Duration(milliseconds: 300)); // let the bar title fade in
      },
    );
  }, skip: _out.isEmpty);

  testWidgets('facility', (tester) async {
    await _shoot(tester, 'facility', const FacilityScreen(slug: 'kibagabaga-hospital'), facility, lang: 'en');
  }, skip: _out.isEmpty);

  testWidgets('book with a doctor', (tester) async {
    await _shoot(
      tester,
      'book-doctor',
      const BookScreen(slug: 'kibagabaga-hospital', serviceId: 's-gp', doctorId: 'm-1'),
      facility,
      lang: 'en',
    );
  }, skip: _out.isEmpty);

  testWidgets('book confirm sheet', (tester) async {
    await _shoot(
      tester,
      'book-confirm',
      const BookScreen(slug: 'kibagabaga-hospital', serviceId: 's-gp'),
      facility,
      lang: 'en',
      act: (tester) async {
        await tester.tap(find.text('08:00'));
        for (var i = 0; i < 6; i++) {
          await tester.pump(const Duration(milliseconds: 300));
        }
        await tester.tap(find.text('Chest pain'));
        await tester.tap(find.text('Fever'));
        await _settle(tester);
      },
    );
  }, skip: _out.isEmpty);

  testWidgets('book confirm sheet, nothing chosen yet', (tester) async {
    await _shoot(
      tester,
      'book-confirm-empty',
      const BookScreen(slug: 'kibagabaga-hospital', serviceId: 's-gp'),
      facility,
      act: (tester) async {
        await tester.tap(find.text('08:00'));
        await _settle(tester);
      },
    );
  }, skip: _out.isEmpty);

  final profile = [
    ...base,
    profileDetailProvider.overrideWith((ref, id) async => sampleProfile),
    identifiersProvider.overrideWith((ref, id) async => sampleIdentifiers),
    insuranceProvider.overrideWith((ref, id) async => sampleInsurance),
    healthProvider.overrideWith((ref, id) async => sampleHealth),
    photoUrlProvider.overrideWith((ref, id) async => null),
    notificationPrefsProvider.overrideWith((ref) async => samplePrefs),
    delegationsProvider.overrideWith((ref) async => sampleDelegations),
  ];

  for (final lang in ['en', 'rw']) {
    testWidgets('profile ($lang)', (tester) async {
      await _shoot(tester, 'profile-$lang', const ProfileScreen(patientId: 'p1'), profile, lang: lang);
    }, skip: _out.isEmpty);
  }

  testWidgets('profile (scrolled)', (tester) async {
    await _shoot(
      tester,
      'profile-scrolled',
      const ProfileScreen(patientId: 'p1'),
      profile,
      lang: 'en',
      act: (tester) async {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -900));
        for (var i = 0; i < 4; i++) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
          await tester.pump(const Duration(milliseconds: 300));
        }
      },
    );
  }, skip: _out.isEmpty);

  testWidgets('me', (tester) async {
    await _shoot(tester, 'me', const MeScreen(), profile, lang: 'en');
  }, skip: _out.isEmpty);

  testWidgets('notification settings', (tester) async {
    await _shoot(tester, 'notification-settings', const NotificationSettingsScreen(), profile, lang: 'en');
  }, skip: _out.isEmpty);

  testWidgets('claim', (tester) async {
    await _shoot(tester, 'claim', const ClaimScreen(), profile, lang: 'en');
  }, skip: _out.isEmpty);

  testWidgets('family', (tester) async {
    await _shoot(tester, 'family', const FamilyScreen(), profile, lang: 'en');
  }, skip: _out.isEmpty);

  // Every language and large text on the key screens. An overflow fails the test, so long
  // Kinyarwanda or French words and 1.3x / 1.6x text must fit.
  final ticket = [
    ...base,
    activeVisitsProvider.overrideWith((ref) async => Cached([sampleVisit])),
    bookingsProvider.overrideWith((ref, when) async => Cached(sampleBookings)),
  ];
  final keyScreens = <(String, Widget, List<dynamic>)>[
    ('home-ticket', const HomeScreen(), ticket),
    ('care', const CareScreen(), [...base, activeVisitsProvider.overrideWith((ref) async => const Cached(<ActiveVisit>[]))]),
    ('facility', const FacilityScreen(slug: 'kibagabaga-hospital'), facility),
    ('doctor', const DoctorScreen(slug: 'kibagabaga-hospital', doctorId: 'm-1'), facility),
    ('me', const MeScreen(), profile),
    ('notification-settings', const NotificationSettingsScreen(), profile),
    ('claim', const ClaimScreen(), profile),
    ('family', const FamilyScreen(), profile),
  ];
  for (final (name, screen, overrides) in keyScreens) {
    for (final (lang, scale) in [('rw', 1.0), ('fr', 1.0), ('rw', 1.3), ('rw', 1.6), ('fr', 1.3)]) {
      final tag = scale == 1 ? lang : '$lang-x$scale';
      testWidgets('$name ($tag)', (tester) async {
        await _shoot(tester, '$name-$tag', screen, overrides, lang: lang, textScale: scale);
      }, skip: _out.isEmpty);
    }
  }
  // Dark mode (follows the phone) on the key screens and the booking sheet.
  for (final (name, screen, overrides) in keyScreens) {
    testWidgets('$name (dark)', (tester) async {
      await _shoot(tester, '$name-dark', screen, overrides, lang: 'en', dark: true);
    }, skip: _out.isEmpty);
  }
  for (final dark in [false, true]) {
    testWidgets('settings${dark ? ' (dark)' : ''}', (tester) async {
      await _shoot(tester, dark ? 'settings-dark' : 'settings', const SettingsScreen(), profile, lang: 'en', dark: dark);
    }, skip: _out.isEmpty);
  }
  testWidgets('map (dark)', (tester) async {
    await _shoot(tester, 'map-dark', const MapScreen(), base, lang: 'en', dark: true);
  }, skip: _out.isEmpty);
  testWidgets('profile (dark)', (tester) async {
    await _shoot(tester, 'profile-dark', const ProfileScreen(patientId: 'p1'), profile, lang: 'en', dark: true);
  }, skip: _out.isEmpty);
  testWidgets('book confirm sheet (dark)', (tester) async {
    await _shoot(
      tester,
      'book-confirm-dark',
      const BookScreen(slug: 'kibagabaga-hospital', serviceId: 's-gp'),
      facility,
      lang: 'en',
      dark: true,
      act: (tester) async {
        await tester.tap(find.text('08:00'));
        for (var i = 0; i < 6; i++) {
          await tester.pump(const Duration(milliseconds: 300));
        }
        await tester.tap(find.text('Fever'));
        await _settle(tester);
      },
    );
  }, skip: _out.isEmpty);

  testWidgets('book confirm sheet (fr)', (tester) async {
    await _shoot(
      tester,
      'book-confirm-empty-fr',
      const BookScreen(slug: 'kibagabaga-hospital', serviceId: 's-gp'),
      facility,
      lang: 'fr',
      act: (tester) async {
        await tester.tap(find.text('08:00'));
        await _settle(tester);
      },
    );
  }, skip: _out.isEmpty);

  // ---- v1.1.2: dashboard parity (bills, disputes, record and medicine details)
  final bill = <String, dynamic>{
    'id': 'b1', 'patient_id': 'p1', 'facility_name': 'Kicukiro Health Center', 'service_date': '2026-10-26',
    'status': 'partly_paid', 'total_rwf': 11000, 'insurer_share_rwf': 9350, 'patient_share_rwf': 1650,
    'paid_rwf': 1000, 'balance_rwf': 650,
    'lines': [
      {'name': 'Antenatal visit', 'quantity': 1, 'total_rwf': 3000, 'insurer_share_rwf': 2550, 'patient_share_rwf': 450},
      {'name': 'Ultrasound', 'quantity': 1, 'total_rwf': 8000, 'insurer_share_rwf': 6800, 'patient_share_rwf': 1200},
    ],
    'payments': [
      {'method': 'mtn_momo', 'amount_rwf': 1000, 'received_at': '2026-10-26T09:12:00Z', 'status': 'recorded', 'receipt_number': 'RC-2026-000184'},
    ],
  };
  final bills = [
    {...bill, 'id': 'b0', 'facility_name': 'Kigali Clinic', 'service_date': '2026-11-07', 'status': 'open', 'balance_rwf': 1200},
    bill,
    {...bill, 'id': 'b2', 'facility_name': 'Kibagabaga District Hospital', 'service_date': '2026-10-08', 'status': 'paid', 'balance_rwf': 0},
  ];
  final dispute = <String, dynamic>{
    'id': 'd1', 'patient_id': 'p1', 'facility_name': 'Kigali Clinic', 'subject_type': 'document',
    'subject_snapshot': {'number': 'DOC-2026-000412'}, 'status': 'resolved', 'outcome': 'correction_refused',
    'description': 'My certificate says three days of rest; the doctor told me five days.',
    'decision_reason': 'The signed consultation records three days of rest.',
    'created_at': '2026-10-29T08:00:00Z', 'acknowledge_by': '2026-11-01T08:00:00Z', 'decide_by': null,
    'can_accept': true, 'can_escalate': true, 'can_reopen': false, 'can_add_statement': true, 'statement': '',
    'version': 4,
    'messages': [
      {'id': 'm1', 'author_name': 'Mutesi Diane', 'author_role': 'handler', 'body': 'We read the signed record with Dr Uwimana.', 'created_at': '2026-11-04T10:00:00Z'},
      {'id': 'm2', 'author_name': 'Mukamana Jeanne', 'author_role': 'patient', 'body': 'Thank you.', 'created_at': '2026-11-04T11:00:00Z'},
    ],
  };
  final prescription = <String, dynamic>{
    'id': 'rx1', 'patient_id': 'p1', 'number': 'RX-2026-000101', 'facility_name': 'Kigali Clinic',
    'status': 'ready_to_dispense', 'expires_at': '2026-12-07T00:00:00Z',
    'items': [
      {'drug_display': 'Paracetamol 500 mg tablet', 'dose': '2 tablets', 'frequency_code': 'tds', 'duration_days': 5,
       'quantity': 30, 'dispensed_quantity': 0, 'instructions': 'After food', 'status': 'issued', 'substitute_display': ''},
      {'drug_display': 'Amoxicillin 500 mg capsule', 'dose': '1 capsule', 'frequency_code': 'bd', 'duration_days': 7,
       'quantity': 14, 'dispensed_quantity': 14, 'instructions': '', 'status': 'dispensed', 'substitute_display': ''},
    ],
  };
  final record = <String, dynamic>{
    'id': 'c1', 'facility_name': 'Kigali Clinic', 'service_date': '2026-10-18', 'doctor_name': 'Dr Uwimana Keza',
    'diagnoses': [{'plain_language': 'High blood pressure', 'display': 'Essential hypertension'}],
    'patient_instructions_text': 'Take the tablets every morning. Come back in 4 weeks.', 'plan_text': '',
    'vitals': {'temperature_c': 36.8, 'systolic_mmhg': 152, 'diastolic_mmhg': 96, 'pulse_bpm': 84, 'weight_kg': 71},
    'addenda': [],
  };

  for (final dark in [false, true]) {
    final tag = dark ? '-dark' : '';
    testWidgets('parity bills$tag', (tester) async {
      await _shoot(tester, 'bills$tag', const BillsScreen(), [...base, billsProvider.overrideWith((ref) async => bills)],
          lang: 'en', dark: dark);
    }, skip: _out.isEmpty);
    testWidgets('parity bill$tag', (tester) async {
      await _shoot(tester, 'bill$tag', const BillScreen(billId: 'b1'),
          [...base, billProvider.overrideWith((ref, id) async => bill)], lang: 'en', dark: dark);
    }, skip: _out.isEmpty);
    testWidgets('parity dispute$tag', (tester) async {
      await _shoot(tester, 'dispute$tag', const DisputeScreen(disputeId: 'd1'),
          [...base, disputeProvider.overrideWith((ref, id) async => dispute)], lang: 'en', dark: dark);
    }, skip: _out.isEmpty);
    testWidgets('parity medication$tag', (tester) async {
      await _shoot(tester, 'medication$tag', const MedicationScreen(prescriptionId: 'rx1'),
          [...base, prescriptionProvider.overrideWith((ref, id) async => prescription)], dark: dark);
    }, skip: _out.isEmpty);
    testWidgets('parity record$tag', (tester) async {
      await _shoot(tester, 'record$tag', const RecordScreen(recordId: 'c1'),
          [...base, recordProvider.overrideWith((ref, id) async => record)], lang: 'en', dark: dark);
    }, skip: _out.isEmpty);
  }
}
